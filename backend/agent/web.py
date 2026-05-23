import re
import requests
from bs4 import BeautifulSoup
from duckduckgo_search import DDGS


def search(query: str, num_results: int = 6) -> str:
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=num_results))
        if not results:
            return 'No results found.'
        lines = []
        for i, r in enumerate(results, 1):
            lines.append(f"{i}. **{r.get('title', '')}**")
            lines.append(f"   {r.get('href', '')}")
            lines.append(f"   {r.get('body', '')}")
            lines.append('')
        return '\n'.join(lines)
    except Exception as e:
        return f'Search error: {e}'


def fetch_page(url: str) -> str:
    try:
        resp = requests.get(
            url, timeout=12,
            headers={'User-Agent': 'Mozilla/5.0 (compatible; GeminiAgent/1.0)'},
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'lxml')
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside']):
            tag.decompose()
        text = soup.get_text(separator='\n', strip=True)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text[:10000]
    except Exception as e:
        return f'Error fetching page: {e}'
