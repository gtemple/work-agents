import requests
from django.conf import settings

_API = 'https://api.linear.app/graphql'


def _post(query: str, variables: dict = None):
    res = requests.post(
        _API,
        json={'query': query, 'variables': variables or {}},
        headers={'Authorization': settings.LINEAR_API_KEY},
        timeout=10,
    )
    return res.json()


def post_comment(issue_id: str, body: str):
    _post(
        '''mutation($issueId: String!, $body: String!) {
            commentCreate(input: {issueId: $issueId, body: $body}) { success }
        }''',
        {'issueId': issue_id, 'body': body},
    )


def fetch_issues(team_id: str = None, state_filter: str = 'open'):
    """Fetch issues from Linear. state_filter: 'open', 'all'."""
    filter_clause = ''
    if team_id:
        filter_clause = f'filter: {{ team: {{ id: {{ eq: "{team_id}" }} }} }}'

    query = f'''{{
        issues({filter_clause} first: 100 orderBy: updatedAt) {{
            nodes {{
                id identifier title description url priority
                labels {{ nodes {{ name }} }}
                state {{ name type }}
                team {{ id name key }}
                createdAt updatedAt
            }}
        }}
    }}'''

    data = _post(query)
    issues = data.get('data', {}).get('issues', {}).get('nodes', [])

    if state_filter == 'open':
        # Exclude completed/cancelled states
        issues = [i for i in issues if i.get('state', {}).get('type') not in ('completed', 'cancelled')]

    return issues


def set_status(issue_id: str, state_name: str):
    """Move issue to a state by name (e.g. 'In Progress', 'Done')."""
    # Fetch available states
    data = _post(
        '''query($issueId: String!) {
            issue(id: $issueId) {
                team { states { nodes { id name } } }
            }
        }''',
        {'issueId': issue_id},
    )
    try:
        states = data['data']['issue']['team']['states']['nodes']
        match = next((s for s in states if s['name'].lower() == state_name.lower()), None)
        if match:
            _post(
                '''mutation($issueId: String!, $stateId: String!) {
                    issueUpdate(id: $issueId, input: {stateId: $stateId}) { success }
                }''',
                {'issueId': issue_id, 'stateId': match['id']},
            )
    except (KeyError, StopIteration):
        pass
