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
import datetime

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


def get_minutes(duration_str: str) -> int:
    parts = duration_str.split(':')
    if len(parts) == 3: # H:M:S
        return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 2: # M:S
        return int(parts[0])
    return 0

def is_promo(title: str) -> bool:
    title_lower = title.lower()
    if any(k in title_lower for k in ['teaser', 'promo', 'precap', 'coming up next']):
        return True
    return False

def is_geoblocked_title(title: str) -> bool:
    return "new episode" in title.lower()

def is_single_episode(title: str, description: str, channel: str, ep_num: int, require_full: bool = False) -> bool:
    # Strict channel filter
    valid_channels = ['sony sab', 'sony pal', 'taarak mehta ka ooltah chashmah', 'taarak mehta ka ooltah chashmah episodes']
    if channel.lower() not in valid_channels:
        return False

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
        
    if require_full:
        if any(k in combined_text for k in ['teaser', 'promo', 'precap', 'coming up next']):
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


def parse_relative_date(time_text: str) -> str:
    if not time_text:
        return ""
    
    text = time_text.lower()
    now = datetime.datetime.now()
    
    match = re.search(r'(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago', text)
    if not match:
        return ""
        
    val = int(match.group(1))
    unit = match.group(2)
    
    if unit == 'minute':
        delta = datetime.timedelta(minutes=val)
    elif unit == 'hour':
        delta = datetime.timedelta(hours=val)
    elif unit == 'day':
        delta = datetime.timedelta(days=val)
    elif unit == 'week':
        delta = datetime.timedelta(weeks=val)
    elif unit == 'month':
        delta = datetime.timedelta(days=val * 30)
    elif unit == 'year':
        delta = datetime.timedelta(days=val * 365)
    else:
        delta = datetime.timedelta(0)
        
    target_date = now - delta
    # Return as "DD MMM YYYY" (e.g. 14 Aug 2026)
    return target_date.strftime("%d %b %Y")


def find_episode(ep_num: int, require_full: bool = False):
    search_queries = [
        f"Ep {ep_num} Taarak Mehta Ka Ooltah Chashmah",
        f"Taarak Mehta Ka Ooltah Chashmah Episode {ep_num}",
        f"Taarak Mehta Ka Ooltah Chashmah एपिसोड {ep_num}",
        f"TMKOC Episode {ep_num} Full Episode",
    ]

    best_match = None
    best_duration = -1

    for query in search_queries:
        try:
            videos = scrapetube.get_search(query, limit=8)
            for vid in videos:
                title_runs = vid.get('title', {}).get('runs', [])
                title = "".join([r.get('text', '') for r in title_runs]).strip()
                vid_id = vid.get('videoId', '')
                channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '')
                description = extract_description_text(vid)

                if vid_id and is_single_episode(title, description, channel, ep_num, require_full):
                    url = f"https://www.youtube.com/watch?v={vid_id}"
                    time_text = vid.get('publishedTimeText', {}).get('simpleText', '')
                    date_str = parse_relative_date(time_text)
                    duration_str = vid.get('lengthText', {}).get('simpleText', '21:45')
                    
                    if require_full and is_promo(title):
                        continue
                        
                    mins = get_minutes(duration_str)
                    if mins > best_duration:
                        best_duration = mins
                        best_match = (vid_id, title, url, date_str, duration_str)
        except Exception:
            continue
            
        if best_duration > 15:
            break

    return best_match
import re

def reverse_global_scan(rows):
    print("Running Reverse Global Scan for recent Sony uploads...")
    upgraded_count = 0
    try:
        videos = scrapetube.get_search("Taarak Mehta Ka Ooltah Chashmah Full Episode", sort_by="upload_date", limit=300)
        
        ep_map = {int(r[0]): (i, r) for i, r in enumerate(rows) if len(r) >= 6}
        valid_channels = ['sony sab', 'sony pal', 'taarak mehta ka ooltah chashmah', 'taarak mehta ka ooltah chashmah episodes']
        
        for vid in videos:
            channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '').lower()
            if channel not in valid_channels:
                continue
                
            title_runs = vid.get('title', {}).get('runs', [])
            title = "".join([r.get('text', '') for r in title_runs]).strip()
            description = extract_description_text(vid)
            
            # Extract episode number from title or description
            pattern = r"(?i)(?:ep|episode)\s*[-:]?\s*(\d+)"
            match = re.search(pattern, title)
            if not match:
                match = re.search(pattern, description)
                
            if match:
                ep_num = int(match.group(1))
                if ep_num in ep_map:
                    row_idx, row = ep_map[ep_num]
                    
                    vid_id = vid.get('videoId', '')
                    if not vid_id:
                        continue
                        
                    old_vid_id = row[2].split('v=')[-1]
                    if vid_id == old_vid_id:
                        continue # Already have this exact video
                        
                    duration_str = vid.get('lengthText', {}).get('simpleText', '0:00')
                    new_mins = get_minutes(duration_str)
                    
                    if new_mins < 5:
                        continue # Skip tiny promos under 5 mins
                        
                    old_mins = get_minutes(row[5])
                    
                    # Cascade upgrade: Accept if it's significantly longer than what we currently have.
                    # This allows 1-min promos to upgrade to 10-min parts, and 10-min parts to upgrade to 20-min full episodes!
                    if new_mins > old_mins + 2:
                        url = f"https://www.youtube.com/watch?v={vid_id}"
                        time_text = vid.get('publishedTimeText', {}).get('simpleText', '')
                        date_str = parse_relative_date(time_text)
                        
                        print(f"  [REVERSE UPGRADE] Ep {ep_num}: {title} ({duration_str})")
                        rows[row_idx] = [ep_num, title, url, "Found", date_str if date_str else row[4], duration_str]
                        upgraded_count += 1
                        
                        # Update map so we don't downgrade it if an older duplicate is further down the results
                        ep_map[ep_num] = (row_idx, rows[row_idx])
                        
    except Exception as e:
        print(f"Reverse global scan error: {e}")
        
    return upgraded_count


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

    rows = []
    if os.path.exists(CSV_FILE):
        with open(CSV_FILE, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            rows = list(reader)

    # 1. Reverse Global Scan (Catch extremely old re-uploads and promos)
    upgraded_count = reverse_global_scan(rows)
    
    # 2. Check for missing episode upgrades (old promos that might have been uploaded later but missed)
    # AND aggressively scan the last 100 episodes (using YouTube Relevance sort) to replace geo-blocked videos with public ones.
    for i, row in enumerate(rows):
        if len(row) >= 6:
            ep_num = int(row[0])
            title = row[1]
            duration_str = row[5]
            current_mins = get_minutes(duration_str)
            
            is_recent = (i >= len(rows) - 100)
            
            if is_promo(title) or current_mins < 16 or is_recent:
                print(f"Checking for better version for Ep {ep_num} (Currently: {duration_str})...")
                result = find_episode(ep_num, require_full=False)
                if result:
                    vid_id, new_title, new_url, new_date_str, new_duration_str = result
                    new_mins = get_minutes(new_duration_str)
                    
                    old_is_promo = is_promo(title)
                    new_is_promo = is_promo(new_title)
                    old_is_geoblocked = is_geoblocked_title(title)
                    new_is_geoblocked = is_geoblocked_title(new_title)
                    
                    should_upgrade = False
                    if old_is_promo and not new_is_promo:
                        should_upgrade = True
                    elif old_is_geoblocked and not new_is_geoblocked and new_mins >= 18:
                        should_upgrade = True
                    elif new_mins > current_mins + 1:
                        # Only upgrade on duration if we aren't downgrading public -> geoblocked
                        if not (not old_is_geoblocked and new_is_geoblocked):
                            should_upgrade = True
                    elif is_recent and new_mins >= 18:
                        # For recent episodes, accept new full episodes via relevance sort.
                        # Only upgrade if the video ID is different AND it's not a downgrade to geoblocked!
                        if vid_id != row[2].split('v=')[-1]:
                            if not (not old_is_geoblocked and new_is_geoblocked):
                                should_upgrade = True
                        
                    if should_upgrade:
                        print(f"  [UPGRADED] Ep {ep_num}: {new_title} ({new_duration_str})")
                        rows[i] = [ep_num, new_title, new_url, "Found", new_date_str if new_date_str else row[4], new_duration_str]
                        upgraded_count += 1
                    else:
                        print(f"  [KEPT] Existing version is optimal.")

    if upgraded_count > 0:
        with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerows(rows)
            
    # 2. Find new episodes
    episodes_added = 0
    next_ep = last_ep + 1

    while True:
        print(f"Searching for Episode {next_ep}...")
        result = find_episode(next_ep)

        if result:
            vid_id, title, url, date_str, duration_str = result
            print(f"[FOUND] Ep {next_ep}: {title} ({url})")

            with open(CSV_FILE, mode="a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                if date_str:
                    writer.writerow([next_ep, title, url, "Found", date_str, duration_str])
                else:
                    writer.writerow([next_ep, title, url, "Found", "", duration_str])

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
    print(f" Website Update Complete! {episodes_added} new episode(s) added, {upgraded_count} promo(s) upgraded.")
    print(f" Latest Episode in DB: Ep {last_ep}")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
