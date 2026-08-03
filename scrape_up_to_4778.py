import csv
import json
import os
import re
import sys
import time

try:
    import scrapetube
except ImportError:
    print("Error: scrapetube not installed.")
    sys.exit(1)

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

OFFICIAL_CHANNELS = {'sony pal', 'sony sab', 'set india', 'sony liv', 'taarak mehta ka ooltah chashmah'}
STATE_FILE = "state.json"
CSV_FILE = "episodes.csv"


def is_single_episode(title: str, description: str, channel: str, ep_num: int) -> bool:
    title_lower = title.lower()
    desc_lower = description.lower()
    combined_text = title_lower + " " + desc_lower

    if re.search(r'\b(?:ep|episode|episodes|ep\.|एपिसोड)?\s*(\d{2,4})\s*(?:-|–|—|to|से)\s*(\d{2,4})\b', combined_text):
        m = re.search(r'\b(?:ep|episode|episodes|ep\.|एपिसोड)?\s*(\d{2,4})\s*(?:-|–|—|to|से)\s*(\d{2,4})\b', combined_text)
        if m and int(m.group(1)) != int(m.group(2)):
            n1, n2 = int(m.group(1)), int(m.group(2))
            if abs(n2 - n1) >= 2:
                return False

    if any(k in combined_text for k in ['compilation', 'best of', 'full movie', 'mega episode']):
        return False

    ep_patterns = [
        rf'(?:full\s+)?(?:ep|episode|ep\.|episodes|ep\s*#|एपिसोड)\s*[-:]?\s*0*{ep_num}\b',
        rf'[-:]?\s*0*{ep_num}\s*[-|]\s*(?:taarak|tarak|तारक)\b',
    ]

    for pat in ep_patterns:
        if re.search(pat, combined_text):
            return True

    num_match = re.search(rf'\b0*{ep_num}\b', combined_text)
    if num_match and any(k in combined_text for k in ['taarak', 'tarak', 'तारक', 'tmkoc']):
        return True

    return False


def find_episode(ep_num: int) -> tuple[str, str, str] | None:
    queries = [
        f"Taarak Mehta Ka Ooltah Chashmah Episode {ep_num} Full Episode",
        f"Taarak Mehta Ka Ooltah Chashmah एपिसोड {ep_num}",
        f"Ep {ep_num} Taarak Mehta Ka Ooltah Chashmah",
    ]

    for q in queries:
        try:
            vids = scrapetube.get_search(q, limit=8)
            for v in vids:
                title_runs = v.get('title', {}).get('runs', [])
                title = title_runs[0].get('text', '') if title_runs else ''
                vid_id = v.get('videoId', '')
                channel = v.get('ownerText', {}).get('runs', [{}])[0].get('text', '')

                desc = ''
                for s in v.get('detailedMetadataSnippets', []):
                    for r in s.get('snippetText', {}).get('runs', []):
                        desc += " " + r.get('text', '')

                if vid_id and is_single_episode(title, desc, channel, ep_num):
                    url = f"https://www.youtube.com/watch?v={vid_id}"
                    return (str(ep_num), title, url)
        except Exception:
            continue

    return None


def main():
    print("=======================================================")
    print("  Scraping Episodes from Ep 4501 to Ep 4778")
    print("=======================================================")

    # Read existing episodes
    existing_eps = set()
    rows = []
    with open(CSV_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            existing_eps.add(int(r["Episode"]))
            rows.append(r)

    added_count = 0
    start_ep = 4501
    end_ep = 4778

    print(f"Target Range: Episode {start_ep} to Episode {end_ep}...")

    for ep_num in range(start_ep, end_ep + 1):
        if ep_num in existing_eps:
            continue

        res = find_episode(ep_num)
        if res:
            _, title, url = res
            rows.append({"Episode": str(ep_num), "Title": title, "URL": url, "Status": "Found"})
            existing_eps.add(ep_num)
            added_count += 1
            print(f"[FOUND] Ep {ep_num}: {title[:50]}... ({url})")
        else:
            print(f"[MISSING] Ep {ep_num} not found on YouTube yet.")
        time.sleep(0.2)

    # Sort rows by episode number
    rows.sort(key=lambda x: int(x["Episode"]))

    # Write updated episodes.csv
    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["Episode", "Title", "URL", "Status"])
        writer.writeheader()
        writer.writerows(rows)

    # Update state.json
    max_ep = max(existing_eps) if existing_eps else 4778
    state = {
        "last_episode": max_ep,
        "last_updated": time.strftime("%Y-%m-%d"),
        "total_found": len(existing_eps),
        "playlist_populated_up_to": 200
    }
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

    print("\n=======================================================")
    print(f" Scraping Complete! Added {added_count} new episodes.")
    print(f" Total Episodes in DB: {len(existing_eps)} (Ep 1 to Ep {max_ep})")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
