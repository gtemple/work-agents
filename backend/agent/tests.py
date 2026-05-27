from django.test import TestCase
from django.urls import reverse
from unittest.mock import patch, MagicMock, ANY
from agent.models import Session, Project, Memory, RepoMemory, UserContext, Message, AgentStep
from agent.agent_loop import _compose_system_prompt, BASE_SYSTEM_PROMPT, ORCHESTRATOR_SYSTEM_PROMPT, WORK_SYSTEM_PROMPT_PREFIX, TASK_TYPE_INSTRUCTIONS, run, _get_purposely_diff
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
        response = self.client.get(reverse('agent:list_sessions'))
        self.assertEqual(response.status_code, 200)

    def test_create_session_view(self):
        data = {
            'project_id': str(self.project.id),
            'session_role': 'standard'
        }
        response = self.client.post(reverse('agent:create_session'), data, content_type='application/json')
        self.assertEqual(response.status_code, 200)
        self.assertIn('id', response.json())
        self.assertEqual(Session.objects.count(), 2)

    def test_get_session_view(self):
        response = self.client.get(reverse('agent:get_session', args=[self.session.id]))
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
        
        # Directly mock the usage_metadata object to ensure attributes are accessible
        mock_usage_metadata = MagicMock()
        mock_usage_metadata.promptTokenCount = 10
        mock_usage_metadata.responseTokenCount = 5
        mock_usage_metadata.thoughtsTokenCount = 0
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
    @patch('agent.agent_loop._queue.Queue') # Mock the queue in _run_tool
    @patch('threading.Thread') # Mock threading.Thread in _run_tool
    def test_run_tool_call(self, mock_thread, mock_queue, mock_save_global_event, mock_dispatch, mock_genai_client):
        # Mock the Gemini response for a tool call
        mock_tool_code = types.FunctionCall(name='bash', args={'command': 'ls -F'})
        mock_response = MagicMock()
        mock_response.candidates = [
            types.Candidate(content=types.Content(parts=[types.Part(function_call=mock_tool_code)]))
        ]
        mock_usage_metadata = MagicMock()
        mock_usage_metadata.promptTokenCount = 20
        mock_usage_metadata.responseTokenCount = 10
        mock_usage_metadata.thoughtsTokenCount = 0
        mock_response.usage_metadata = mock_usage_metadata
        mock_genai_client.return_value.models.generate_content.return_value = mock_response

        # Configure the mock thread to execute its target when start() is called
        def start_side_effect(): # No arguments expected for start()
            if mock_thread.call_args:
                target_func = mock_thread.call_args.kwargs['target']
                target_func() # Execute the target function
            else:
                pass

        # Assign this side_effect to the start method of the *returned* thread instance
        # This will be called when the thread_instance.start() is invoked.
        mock_thread.return_value.start.side_effect = start_side_effect

        # Configure the mock queue to return a result when get() is called
        mock_queue_instance = MagicMock()
        mock_queue_instance.get.return_value = {'stdout': 'file1\nfile2\n'}
        mock_queue.return_value = mock_queue_instance

        # Call the run function
        output_events = list(run(self.session, "Run a tool"))

        # Assertions
        self.assertEqual(len(output_events), 4) # tokens, tool_call, tool_result, done
        self.assertEqual(output_events[0]['type'], 'tokens')
        self.assertEqual(output_events[0]['payload']['input'], 20)
        self.assertEqual(output_events[0]['payload']['output'], 10)

        self.assertEqual(output_events[1]['type'], 'tool_call')
        self.assertEqual(output_events[1]['payload']['tool'], 'bash')
        self.assertEqual(output_events[1]['payload']['args'], {'command': 'ls -F'})

        self.assertEqual(output_events[2]['type'], 'tool_result')
        self.assertEqual(output_events[2]['payload']['tool'], 'bash')
        self.assertEqual(output_events[2]['payload']['result'], {'stdout': 'file1\nfile2\n'})

        self.assertEqual(output_events[3]['type'], 'done')
        self.assertEqual(output_events[3]['payload']['input_tokens'], 20)
        self.assertEqual(output_events[3]['payload']['output_tokens'], 10)

        # Verify that dispatch was called with the correct arguments
        mock_dispatch.assert_called_once_with('bash', {'command': 'ls -F'}, ANY, settings.GITHUB_TOKEN, session=self.session)

        # Verify token counts updated in session
        self.session.refresh_from_db()
        self.assertEqual(self.session.input_tokens, 20)
        self.assertEqual(self.session.output_tokens, 10)

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
        self.assertIn("... (", diff)
        self.assertIn(" more lines truncated)", diff)

    @patch('agent.sandbox.git_exec') # Patch sandbox.git_exec which is called by _get_purposely_diff
    def test_get_purposely_diff_no_repo(self, mock_git_exec):
        mock_session_dir = MagicMock()
        mock_session_dir.__truediv__.return_value.exists.return_value = False # Mock the exists() call on purposely_dir
        diff = _get_purposely_diff(mock_session_dir)
        self.assertIsNone(diff)
        mock_git_exec.assert_not_called()
