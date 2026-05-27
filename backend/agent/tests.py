from django.test import TestCase
from django.urls import reverse
from unittest.mock import patch, MagicMock, ANY
from agent.models import Session, Project, Memory, RepoMemory, UserContext, Message, AgentStep
from agent.agent_loop import _compose_system_prompt, BASE_SYSTEM_PROMPT, ORCHESTRATOR_SYSTEM_PROMPT, WORK_SYSTEM_PROMPT_PREFIX, TASK_TYPE_INSTRUCTIONS, run, _get_purposely_diff, _cancel_requested, request_cancel, clear_cancel
import uuid
from django.conf import settings
from google.genai import types

class AgentViewsTest(TestCase):
    def setUp(self):
        self.project = Project.objects.create(title="Test Project")
        self.session_id = uuid.uuid4()
        self.session = Session.objects.create(
            id=self.session_id,
            project=self.project,
            session_role='standard',
        )

    def test_list_sessions_view(self):
        response = self.client.get('/api/sessions/')
        self.assertEqual(response.status_code, 200)

    def test_create_session_view(self):
        data = {
            'project_id': str(self.project.id),
            'session_role': 'standard'
        }
        response = self.client.post('/api/sessions/new/', data, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('id', response.json())
        self.assertEqual(Session.objects.count(), 2)

    def test_get_session_view(self):
        response = self.client.get(f'/api/sessions/{self.session.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['id'], str(self.session.id))


class AgentLoopTest(TestCase):
    def setUp(self):
        self.project = Project.objects.create(title="Test Project")
        self.session_id = uuid.uuid4()
        self.session = Session.objects.create(
            id=self.session_id,
            project=self.project,
            session_role='standard',
            system_prompt='This is a custom system prompt.',
        )
        # Ensure GitHub username is set for testing
        settings.GITHUB_USERNAME = 'testuser'

    def tearDown(self):
        # Clean up settings after each test
        if hasattr(settings, 'GITHUB_USERNAME'):
            del settings.GITHUB_USERNAME
        clear_cancel(self.session_id) # Ensure cancel request is cleared

    def test_compose_system_prompt_base(self):
        prompt = _compose_system_prompt(self.session)
        self.assertIn(BASE_SYSTEM_PROMPT, prompt)
        self.assertIn(f"The user's GitHub username is `{settings.GITHUB_USERNAME}`", prompt)
        self.assertIn("## Session context\nThis is a custom system prompt.", prompt)

    def test_compose_system_prompt_orchestrator_role(self):
        self.session.session_role = 'orchestrator'
        self.session.save()
        # To make it accessible via session.as_project
        self.project.orchestrator = self.session
        self.project.save()

        prompt = _compose_system_prompt(self.session)
        self.assertIn(ORCHESTRATOR_SYSTEM_PROMPT, prompt)
        self.assertIn(f"## Project: {self.project.title}\n{self.project.description}", prompt)

    def test_compose_system_prompt_work_session(self):
        self.session.is_work = True
        self.session.linear_task_type = 'bug_fix'
        self.session.save()

        prompt = _compose_system_prompt(self.session)
        self.assertIn(WORK_SYSTEM_PROMPT_PREFIX, prompt)
        self.assertIn(TASK_TYPE_INSTRUCTIONS['bug_fix'], prompt)

    @patch('agent.models.RepoMemory.objects')
    def test_compose_system_prompt_repo_memory(self, MockRepoMemoryObjects):
        self.session.is_work = True
        self.session.save()

        mock_repo_memory_instance = MagicMock()
        mock_repo_memory_instance.content = "Repo-specific notes."
        MockRepoMemoryObjects.get.return_value = mock_repo_memory_instance

        prompt = _compose_system_prompt(self.session)
        self.assertIn("## Current repo knowledge base (purposely/purposely-web)\nRepo-specific notes.", prompt)

    @patch('agent.models.Memory.objects')
    def test_compose_system_prompt_persistent_memory(self, MockMemoryObjects):
        mock_memory_instance = MagicMock()
        mock_memory_instance.key = 'my-key'
        MockMemoryObjects.all.return_value = [mock_memory_instance]

        prompt = _compose_system_prompt(self.session)
        self.assertIn("## Persistent memory (1 entries)", prompt)
        self.assertIn("Available keys: \"my-key\"", prompt)

    @patch('agent.agent_loop.genai.Client')
    @patch('agent.agent_loop.tools.dispatch')
    @patch('agent.agent_loop._save_global_event') # Patch this to prevent it from being called
    def test_run_text_response(self, mock_save_global_event, mock_dispatch, mock_genai_client):
        # Mock the Gemini response for a simple text output
        mock_response = MagicMock()
        mock_response.candidates = [
            types.Candidate(content=types.Content(parts=[types.Part(text="Hello from the agent!")]))
        ]
        
        mock_usage_metadata = MagicMock(spec=[])
        mock_usage_metadata.prompt_token_count = 10
        mock_usage_metadata.candidates_token_count = 5
        mock_usage_metadata.thoughts_token_count = 0
        mock_response.usage_metadata = mock_usage_metadata

        mock_genai_client.return_value.models.generate_content.return_value = mock_response

        # Call the run function
        output_events = list(run(self.session, "Test prompt"))

        # Assertions
        self.assertEqual(len(output_events), 3) # tokens + assistant_text + done
        self.assertEqual(output_events[0]['type'], 'tokens')
        self.assertEqual(output_events[0]['payload']['input'], 10)
        self.assertEqual(output_events[0]['payload']['output'], 5)
        self.assertEqual(output_events[1]['type'], 'assistant_text')
        self.assertEqual(output_events[1]['payload']['text'], 'Hello from the agent!')
        self.assertEqual(output_events[2]['type'], 'done')
        self.assertEqual(output_events[2]['payload']['input_tokens'], 10)
        self.assertEqual(output_events[2]['payload']['output_tokens'], 5)
        self.assertEqual(Message.objects.count(), 1) # Only the agent message is saved by run()

        # Refresh session from DB to get updated token counts
        self.session.refresh_from_db()
        self.assertEqual(self.session.input_tokens, 10)
        self.assertEqual(self.session.output_tokens, 5)

    @patch('agent.agent_loop.genai.Client')
    @patch('agent.agent_loop.tools.dispatch')
    @patch('agent.agent_loop._save_global_event')
    @patch('agent.agent_loop._queue.Queue')
    @patch('threading.Thread')
    def test_run_tool_call(self, mock_thread, mock_queue, mock_save_global_event, mock_dispatch, mock_genai_client):
        mock_tool_code = types.FunctionCall(name='bash', args={'command': 'ls -F'})
        mock_tool_response = MagicMock()
        mock_tool_response.candidates = [
            types.Candidate(content=types.Content(parts=[types.Part(function_call=mock_tool_code)]))
        ]
        mock_usage_1 = MagicMock(spec=[])
        mock_usage_1.prompt_token_count = 20
        mock_usage_1.candidates_token_count = 10
        mock_usage_1.thoughts_token_count = 0
        mock_tool_response.usage_metadata = mock_usage_1

        mock_text_response = MagicMock()
        mock_text_response.candidates = [
            types.Candidate(content=types.Content(parts=[types.Part(text='Done.')]))
        ]
        mock_usage_2 = MagicMock(spec=[])
        mock_usage_2.prompt_token_count = 5
        mock_usage_2.candidates_token_count = 3
        mock_usage_2.thoughts_token_count = 0
        mock_text_response.usage_metadata = mock_usage_2

        mock_genai_client.return_value.models.generate_content.side_effect = [
            mock_tool_response,
            mock_text_response,
        ]

        mock_queue_instance = MagicMock()
        mock_queue_instance.get.return_value = 'file1\nfile2\n'
        mock_queue.return_value = mock_queue_instance

        output_events = list(run(self.session, "Run a tool"))

        event_types = [e['type'] for e in output_events]
        self.assertIn('tool_call', event_types)
        self.assertIn('tool_result', event_types)
        self.assertIn('done', event_types)

        tool_call_ev = next(e for e in output_events if e['type'] == 'tool_call')
        self.assertEqual(tool_call_ev['payload']['tool'], 'bash')
        self.assertEqual(tool_call_ev['payload']['args'], {'command': 'ls -F'})

        tool_result_ev = next(e for e in output_events if e['type'] == 'tool_result')
        self.assertEqual(tool_result_ev['payload']['tool'], 'bash')
        self.assertEqual(tool_result_ev['payload']['result'], 'file1\nfile2\n')

        done_ev = next(e for e in output_events if e['type'] == 'done')
        self.assertEqual(done_ev['payload']['input_tokens'], 25)
        self.assertEqual(done_ev['payload']['output_tokens'], 13)

        self.session.refresh_from_db()
        self.assertEqual(self.session.input_tokens, 25)
        self.assertEqual(self.session.output_tokens, 13)

    @patch('os.path.exists', return_value=True)
    @patch('agent.sandbox.git_exec') # Patch sandbox.git_exec which is called by _get_purposely_diff
    def test_get_purposely_diff_short(self, mock_git_exec, mock_os_path_exists):
        mock_git_exec.side_effect = [
            {'stdout': 'purposely/purposely-web'},  # For `git remote get-url origin`
            {'stdout': "short diff"}  # For `git diff origin/main...HEAD`
        ]
        diff = _get_purposely_diff(MagicMock())
        self.assertEqual(diff, "short diff")

    @patch('os.path.exists', return_value=True)
    @patch('agent.sandbox.git_exec') # Patch sandbox.git_exec which is called by _get_purposely_diff
    def test_get_purposely_diff_long(self, mock_git_exec, mock_os_path_exists):
        long_diff = "a\n" * 7000  # Create a diff longer than 12000 characters (7000 lines * 2 chars/line = 14000 chars)
        mock_git_exec.side_effect = [
            {'stdout': 'purposely/purposely-web'},  # For `git remote get-url origin`
            {'stdout': long_diff}  # For `git diff origin/main...HEAD`
        ]
        diff = _get_purposely_diff(MagicMock())
        self.assertLess(len(diff), len(long_diff))
        self.assertIn("… (", diff)
        self.assertIn(" more lines truncated)", diff)

    @patch('agent.sandbox.git_exec') # Patch sandbox.git_exec which is called by _get_purposely_diff
    def test_get_purposely_diff_no_repo(self, mock_git_exec):
        mock_session_dir = MagicMock()
        mock_session_dir.__truediv__.return_value.exists.return_value = False # Mock the exists() call on purposely_dir
        diff = _get_purposely_diff(mock_session_dir)
        self.assertIsNone(diff)
        mock_git_exec.assert_not_called()

    @patch('agent.agent_loop.genai.Client')
    @patch('agent.agent_loop.tools.dispatch')
    @patch('agent.agent_loop._save_global_event')
    def test_run_malformed_function_call(self, mock_save_global_event, mock_dispatch, mock_genai_client):
        # Mock the Gemini response for a malformed function call
        mock_response = MagicMock()
        # Simulate a malformed function call by setting finish_reason as a string
        mock_candidate = MagicMock()
        mock_candidate.finish_reason = 'MALFORMED_FUNCTION_CALL'
        mock_candidate.content = None # No content for malformed call
        mock_response.candidates = [mock_candidate]

        mock_usage_metadata_first_call = MagicMock(spec=[])
        mock_usage_metadata_first_call.prompt_token_count = 15
        mock_usage_metadata_first_call.candidates_token_count = 0
        mock_usage_metadata_first_call.thoughts_token_count = 0
        mock_response.usage_metadata = mock_usage_metadata_first_call

        mock_text_response = MagicMock()
        mock_text_response.candidates = [
            types.Candidate(content=types.Content(parts=[types.Part(text="Corrected response.")]))
        ]
        mock_usage_metadata_second_call = MagicMock(spec=[])
        mock_usage_metadata_second_call.prompt_token_count = 5
        mock_usage_metadata_second_call.candidates_token_count = 3
        mock_usage_metadata_second_call.thoughts_token_count = 0
        mock_text_response.usage_metadata = mock_usage_metadata_second_call

        # Set side_effect for generate_content to return malformed, then a valid text response
        mock_genai_client.return_value.models.generate_content.side_effect = [
            mock_response,
            mock_text_response # This second response will be after the retry
        ]

        output_events = list(run(self.session, "Test prompt with malformed call"))

        # Assertions
        # Expected events: 1 (initial tokens) + 1 (retry tool call) + 1 (second tokens) + 1 (assistant_text) + 1 (done) = 5
        self.assertEqual(len(output_events), 5)

        # Check the first 'tokens' event (from the first (malformed) API call)
        self.assertEqual(output_events[0]['type'], 'tokens')
        self.assertEqual(output_events[0]['payload']['input'], 15)
        self.assertEqual(output_events[0]['payload']['output'], 0) # No output tokens for malformed response

        # Check the '_retry' tool_call event
        self.assertEqual(output_events[1]['type'], 'tool_call')
        self.assertEqual(output_events[1]['payload']['tool'], '_retry')
        self.assertEqual(output_events[1]['payload']['args'], {})

        # Check the second 'tokens' event — cumulative totals (15 + 5 = 20, 0 + 3 = 3)
        self.assertEqual(output_events[2]['type'], 'tokens')
        self.assertEqual(output_events[2]['payload']['input'], 20)
        self.assertEqual(output_events[2]['payload']['output'], 3)

        # Check the assistant_text event from the corrected response
        self.assertEqual(output_events[3]['type'], 'assistant_text')
        self.assertEqual(output_events[3]['payload']['text'], 'Corrected response.')

        # Check the 'done' event
        self.assertEqual(output_events[4]['type'], 'done')
        # The done event should report the total input and output tokens for the *entire* session run
        self.assertEqual(output_events[4]['payload']['input_tokens'], 20) # 15 (first call) + 5 (second call)
        self.assertEqual(output_events[4]['payload']['output_tokens'], 3) # 0 (first call) + 3 (second call)

        # Verify that the session's token counts are updated correctly in the database
        self.session.refresh_from_db()
        self.assertEqual(self.session.input_tokens, 20)
        self.assertEqual(self.session.output_tokens, 3)

        # Verify that a corrective message was added to the history (implicitly by the second call to generate_content)
        # We can check the history of the mock client to confirm
        history_after_first_call = mock_genai_client.return_value.models.generate_content.call_args_list[0].kwargs['contents']
        history_after_second_call = mock_genai_client.return_value.models.generate_content.call_args_list[1].kwargs['contents']
        
        # The corrective message should be the last message in the history for the second call
        self.assertIn('Your last tool call was malformed and could not be parsed. Please try again', history_after_second_call[-1].parts[0].text)

