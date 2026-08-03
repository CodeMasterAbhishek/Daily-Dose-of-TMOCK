import csv
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


def is_range_compilation(title: str, description: str) -> bool:
    """Detects if a title or description represents a multi-episode compilation range (e.g. Ep 4499-4504)."""
    text = (title + " " + description).lower()
    
    # Check for range patterns like 4499-4504 or 100 to 105
    m = re.search(r'\b(?:ep|episode|episodes|ep\.|एपिसोड)?\s*(\d{2,4})\s*(?:-|–|—|to|से)\s*(\d{2,4})\b', text)
    if m:
        n1, n2 = int(m.group(1)), int(m.group(2))
        if abs(n2 - n1) >= 2:
            return True
            
    if 'compilation' in text or 'best of' in text or 'mega episode' in text or 'full movie' in text:
        return True

    return False


def find_single_episode(ep_num: int) -> tuple[str, str, str] | None:
    """Searches YouTube specifically for SINGLE Episode `ep_num` excluding compilations."""
    queries = [
        f"Taarak Mehta Ka Ooltah Chashmah Episode {ep_num} Full Episode",
        f"Taarak Mehta Ka Ooltah Chashmah एपिसोड {ep_num}",
        f"Ep {ep_num} Taarak Mehta Ka Ooltah Chashmah",
    ]

    for q in queries:
        try:
            vids = scrapetube.get_search(q, limit=10)
            for v in vids:
                title_runs = v.get('title', {}).get('runs', [])
                title = title_runs[0].get('text', '') if title_runs else ''
                vid_id = v.get('videoId', '')
                channel = v.get('ownerText', {}).get('runs', [{}])[0].get('text', '')
                
                # Check description snippet
                desc = ''
                for s in v.get('detailedMetadataSnippets', []):
                    for r in s.get('snippetText', {}).get('runs', []):
                        desc += " " + r.get('text', '')

                if not vid_id or is_range_compilation(title, desc):
                    continue

                # Ensure episode number matches ep_num exactly
                combined = (title + " " + desc).lower()
                num_match = re.search(rf'\b0*{ep_num}\b', combined)
                if num_match:
                    url = f"https://www.youtube.com/watch?v={vid_id}"
                    return (str(ep_num), title, url)
        except Exception:
            continue

    return None


def main():
    print("=======================================================")
    print("  Fixing Dataset: Replacing Multi-Episode Compilations")
    print("=======================================================")

    csv_path = "episodes.csv"
    rows = []
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    fixed_count = 0
    for idx, r in enumerate(rows):
        ep_num = int(r["Episode"])
        title = r["Title"]

        if is_range_compilation(title, ""):
            print(f"[{idx+1}/{len(rows)}] Multi-episode compilation detected: Ep {ep_num} ('{title[:50]}...')")
            res = find_single_episode(ep_num)
            if res:
                _, new_title, new_url = res
                print(f"  ✓ REPLACED WITH SINGLE EPISODE: {new_title[:60]} ({new_url})")
                r["Title"] = new_title
                r["URL"] = new_url
                fixed_count += 1
                time.sleep(0.3)
            else:
                print(f"  ⚠ Could not find single episode alternative for Ep {ep_num}")

    # Write fixed dataset back to CSV
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["Episode", "Title", "URL", "Status"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nCompleted! Fixed {fixed_count} multi-episode compilation links in dataset.")


if __name__ == "__main__":
    main()
