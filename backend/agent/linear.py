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
