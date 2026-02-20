"""
One-off script to fetch Wikipedia articles and save as .md files.
Uses the Wikipedia REST API plain-text extract endpoint.
"""

import re
import time
import urllib.request
import urllib.parse
import json
from pathlib import Path

DOCS_DIR = Path(__file__).parent / "docs"
MAX_CHARS = 6000  # Trim articles to ~6KB (richer articles = better chunks)

# (wikipedia_title, output_slug) — use actual standalone Wikipedia articles
SUPERBOWL_ARTICLES = [
    ("Super Bowl LX", "superbowl_lx_game"),
    ("2025 Seattle Seahawks season", "seahawks_2025_season"),
    ("2025 New England Patriots season", "patriots_2025_season"),
    ("Kenneth Walker III", "kenneth_walker_iii"),
    ("Jason Myers", "jason_myers"),
    ("Mike Macdonald (American football)", "mike_macdonald"),
    ("Drake Maye", "drake_maye"),
    ("Sam Darnold", "sam_darnold"),
    ("Jaxon Smith-Njigba", "jaxon_smith_njigba"),
    ("Super Bowl LX halftime show", "superbowl_lx_halftime"),
    ("2025–26 NFL playoffs", "nfl_playoffs_2025"),
    ("Levi's Stadium", "levis_stadium"),
    ("DK Metcalf", "dk_metcalf"),
    ("2025 NFL season", "nfl_season_2025"),
    ("Geno Smith", "geno_smith"),
]

OLYMPICS_ARTICLES = [
    ("2026 Winter Olympics", "winter_olympics_2026"),
    ("2026 Winter Olympics opening ceremony", "olympics_opening_ceremony"),
    ("2026 Winter Olympics medal table", "olympics_medal_table"),
    ("Venues of the 2026 Winter Olympics and Paralympics", "olympics_venues"),
    ("Figure skating at the 2026 Winter Olympics", "olympics_figure_skating"),
    ("Alpine skiing at the 2026 Winter Olympics", "olympics_alpine_skiing"),
    ("Biathlon at the 2026 Winter Olympics", "olympics_biathlon"),
    ("Cross-country skiing at the 2026 Winter Olympics", "olympics_cross_country"),
    ("Ice hockey at the 2026 Winter Olympics", "olympics_ice_hockey"),
    ("Short track speed skating at the 2026 Winter Olympics", "olympics_short_track"),
    ("Freestyle skiing at the 2026 Winter Olympics", "olympics_freestyle"),
    ("Snowboarding at the 2026 Winter Olympics", "olympics_snowboarding"),
    ("Ski jumping at the 2026 Winter Olympics", "olympics_ski_jumping"),
    ("List of 2026 Winter Olympics medal winners", "olympics_medal_winners"),
    ("Chronological summary of the 2026 Winter Olympics", "olympics_chronological"),
]


def fetch_extract(title: str) -> str:
    """Fetch plain text extract from Wikipedia API."""
    encoded = urllib.parse.quote(title.replace(" ", "_"))
    url = (
        f"https://en.wikipedia.org/api/rest_v1/page/summary/{encoded}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "RAG-Playground/1.0"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
    return data.get("extract", "")


def fetch_full_extract(title: str) -> str:
    """Fetch longer extract using the MediaWiki API."""
    params = urllib.parse.urlencode({
        "action": "query",
        "titles": title,
        "prop": "extracts",
        "explaintext": "1",
        "exsectionformat": "plain",
        "format": "json",
    })
    url = f"https://en.wikipedia.org/w/api.php?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": "RAG-Playground/1.0"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
    pages = data.get("query", {}).get("pages", {})
    for page in pages.values():
        return page.get("extract", "")
    return ""


def slug(title: str) -> str:
    """Convert title to filename slug."""
    s = title.split("(")[0].strip()  # Remove parenthetical disambiguation
    s = s.lower().replace("'", "").replace(" ", "_")
    s = re.sub(r"[^a-z0-9_]", "", s)
    return s


def main():
    DOCS_DIR.mkdir(parents=True, exist_ok=True)

    all_articles = SUPERBOWL_ARTICLES + OLYMPICS_ARTICLES
    print(f"Fetching {len(all_articles)} articles...")

    for title, file_slug in all_articles:
        filename = file_slug + ".md"
        filepath = DOCS_DIR / filename

        print(f"  Fetching: {title} -> {filename}")
        try:
            text = fetch_full_extract(title)
            if not text or len(text) < 200:
                # Fallback to summary endpoint
                text = fetch_extract(title)

            if len(text) > MAX_CHARS:
                # Trim at sentence boundary near MAX_CHARS
                cut = text[:MAX_CHARS].rfind(". ")
                if cut > MAX_CHARS // 2:
                    text = text[: cut + 1]
                else:
                    text = text[:MAX_CHARS]

            # Write with title as heading
            clean_title = title.split("(")[0].strip()
            filepath.write_text(f"# {clean_title}\n\n{text}\n", encoding="utf-8")
            print(f"    Saved {len(text)} chars")

        except Exception as e:
            print(f"    ERROR: {e}")

        time.sleep(0.5)  # Be polite to Wikipedia API

    print(f"\nDone! {len(list(DOCS_DIR.glob('*.md')))} files in {DOCS_DIR}")


if __name__ == "__main__":
    main()
