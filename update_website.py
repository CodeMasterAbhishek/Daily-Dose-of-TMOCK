"""
Update Website & Episodes DB (Zero YouTube Data API Quota Consumed)
Detects new TMKOC episode uploads using scrapetube and updates episodes.csv & state.json.
"""

import csv
import json
import os
import re
import sys
import time

try:
    import scrapetube
except ImportError:
    print("Error: 'scrapetube' module is required. Install it using: pip install -r requirements.txt")
    sys.exit(1)

# Ensure UTF-8 output on Windows terminal
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

STATE_FILE = "state.json"
CSV_FILE = "episodes.csv"


def is_single_episode(title: str, description: str, channel: str, ep_num: int) -> bool:
    title_lower = title.lower()
    desc_lower = description.lower()
    combined_text = title_lower + " " + desc_lower

    # Reject multi-episode compilations
    if re.search(r'\b(?:ep|episode|episodes|ep\.|एपिसोड)?\s*(\d{2,4})\s*(?:-|–|—|to|से)\s*(\d{2,4})\b', combined_text):
        m = re.search(r'\b(?:ep|episode|episodes|ep\.|एपिसोड)?\s*(\d{2,4})\s*(?:-|–|—|to|से)\s*(\d{2,4})\b', combined_text)
        if m and int(m.group(1)) != int(m.group(2)):
            n1, n2 = int(m.group(1)), int(m.group(2))
            if abs(n2 - n1) >= 2:
                return False

    if any(k in combined_text for k in ['compilation', 'best of', 'full movie', 'mega episode']):
        return False

    # Check if a different episode number is explicitly in title
    ep_extract = re.search(r'(?:ep|episode|ep\.|एपिसोड)\s*#?\s*(\d+)', title_lower)
    if ep_extract:
        found_ep = int(ep_extract.group(1))
        if found_ep != ep_num:
            return False

    ep_patterns = [
        rf'(?:full\s+)?(?:ep|episode|ep\.|episodes|ep\s*#|एपिसोड)\s*[-:]?\s*0*{ep_num}\b',
        rf'[-:]?\s*0*{ep_num}\s*[-|]\s*(?:taarak|tarak|तारक)\b',
    ]

    for pat in ep_patterns:
        if re.search(pat, combined_text):
            return True

    if any(k in combined_text for k in ['taarak', 'tarak', 'तारक', 'tmkoc']):
        num_match = re.search(rf'\b0*{ep_num}\b', title_lower)
        if num_match:
            return True

    return False


def extract_description_text(vid_dict: dict) -> str:
    snippets = vid_dict.get('detailedMetadataSnippets', [])
    desc_text = ""
    for s in snippets:
        runs = s.get('snippetText', {}).get('runs', [])
        for r in runs:
            desc_text += " " + r.get('text', '')
    return desc_text.strip()


def find_next_episode(ep_num: int) -> tuple[str, str, str] | None:
    search_queries = [
        f"Ep {ep_num} Taarak Mehta Ka Ooltah Chashmah",
        f"Taarak Mehta Ka Ooltah Chashmah Episode {ep_num}",
        f"Taarak Mehta Ka Ooltah Chashmah एपिसोड {ep_num}",
        f"TMKOC Episode {ep_num} Full Episode",
    ]

    for query in search_queries:
        try:
            videos = scrapetube.get_search(query, limit=8)
            for vid in videos:
                title_runs = vid.get('title', {}).get('runs', [])
                title = "".join([r.get('text', '') for r in title_runs]).strip()
                vid_id = vid.get('videoId', '')
                channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '')
                description = extract_description_text(vid)

                if vid_id and is_single_episode(title, description, channel, ep_num):
                    url = f"https://www.youtube.com/watch?v={vid_id}"
                    return (vid_id, title, url)
        except Exception:
            continue

    return None


def main():
    print("=======================================================")
    print("  TMKOC Website & DB Auto-Updater (Zero Quota Mode)")
    print("=======================================================")

    if not os.path.exists(STATE_FILE):
        print(f"Error: {STATE_FILE} not found!")
        sys.exit(1)

    with open(STATE_FILE, "r", encoding="utf-8") as f:
        state = json.load(f)

    last_ep = state.get("last_episode", 4778)
    print(f"Checking for new TMKOC episodes after Ep {last_ep}...")

    episodes_added = 0
    next_ep = last_ep + 1

    while True:
        print(f"Searching for Episode {next_ep}...")
        result = find_next_episode(next_ep)

        if result:
            vid_id, title, url = result
            print(f"[FOUND] Ep {next_ep}: {title} ({url})")

            with open(CSV_FILE, mode="a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([next_ep, title, url, "Found"])

            last_ep = next_ep
            episodes_added += 1
            next_ep += 1
        else:
            print(f"[UP TO DATE] Ep {next_ep} is not available on YouTube yet.")
            break

    today_str = time.strftime("%Y-%m-%d")
    state["last_episode"] = last_ep
    state["last_updated"] = today_str
    state["total_found"] = state.get("total_found", 4778) + episodes_added

    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

    print("\n=======================================================")
    print(f" Website Update Complete! {episodes_added} new episode(s) added.")
    print(f" Latest Episode in DB: Ep {last_ep}")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
