"""
Update Website & Episodes DB (Zero YouTube Data API Quota Consumed)
Detects new TMKOC episode uploads using scrapetube and updates episodes.json & state.json directly.
"""

import json
import os
import re
import sys
import time
import datetime
import tempfile

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

from config import STATE_FILE, JSON_DB_FILE, BASE_DIR, VALID_CHANNELS
from utils import get_minutes, is_compilation

RE_EPISODE_RANGE = re.compile(r'\b(?:ep|episode|episodes|ep\.|एपिसोड)?\s*(\d{2,4})\s*(?:-|–|—|to|से)\s*(\d{2,4})\b')
RE_EP_EXTRACT = re.compile(r'(?:ep|episode|ep\.|एपिसोड)\s*#?\s*(\d+)')
RE_RELATIVE_DATE = re.compile(r'(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago')
RE_EP_PATTERN = re.compile(r"(?i)(?:ep|episode)\s*[-:]?\s*(\d+)")


# ───────────────────────────── Helpers ─────────────────────────────

def extract_video_id(url):
    if not url: return None
    match = re.search(r'(?:v=|youtu\.be/|/v/|/embed/)([^&?]+)', url)
    return match.group(1) if match else None

def duration_str_to_seconds(duration_str):
    """Convert '21:45' or '1:02:30' to total seconds."""
    try:
        parts = duration_str.split(':')
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
    except (ValueError, TypeError, AttributeError):
        pass
    return 0

def is_promo(title: str) -> bool:
    title_lower = title.lower()
    return any(k in title_lower for k in ['teaser', 'promo', 'precap', 'coming up next'])

def is_geoblocked_title(title: str) -> bool:
    title_lower = title.lower()
    if "new episode available" in title_lower or "new episode premieres" in title_lower:
        return True
    if "| new episode" in title_lower or "|new episode" in title_lower:
        return True
    return False

def is_single_episode(title: str, description: str, channel: str, ep_num: int, require_full: bool = False) -> bool:
    if channel.lower() not in VALID_CHANNELS:
        return False

    title_lower = title.lower()
    desc_lower = description.lower()
    combined_text = title_lower + " " + desc_lower

    m = RE_EPISODE_RANGE.search(combined_text)
    if m and int(m.group(1)) != int(m.group(2)):
        n1, n2 = int(m.group(1)), int(m.group(2))
        if abs(n2 - n1) >= 2:
            return False

    if any(k in combined_text for k in ['compilation', 'best of', 'full movie', 'mega episode']):
        return False
        
    if require_full:
        if any(k in combined_text for k in ['teaser', 'promo', 'precap', 'coming up next']):
            return False

    ep_extract = RE_EP_EXTRACT.search(title_lower)
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
    
    match = RE_RELATIVE_DATE.search(text)
    if not match:
        return ""
        
    val = int(match.group(1))
    unit = match.group(2)
    
    deltas = {
        'minute': datetime.timedelta(minutes=val),
        'hour': datetime.timedelta(hours=val),
        'day': datetime.timedelta(days=val),
        'week': datetime.timedelta(weeks=val),
        'month': datetime.timedelta(days=val * 30),
        'year': datetime.timedelta(days=val * 365),
    }
    
    target_date = now - deltas.get(unit, datetime.timedelta(0))
    return target_date.strftime("%d %b %Y")


def get_video_score(mins: int, channel: str, title: str) -> int:
    channel_lower = channel.lower().strip()
    
    # EXACT whitelist to prevent ANY random channels
    official_channels = [
        'sony sab', 'taarak mehta ka ooltah chashmah', 'sony pal',
        'taarak mehta ka ooltah chashmah episodes', 'liv comedy',
        'taarak mehta ka ooltah chashmah movies'
    ]
    
    if channel_lower not in official_channels:
        return -9999999  # INSTANTLY REJECT ANY UNOFFICIAL CHANNEL
        
    c_score = 0
    if channel_lower == 'sony sab':
        c_score = 100
    elif 'taarak mehta' in channel_lower:
        c_score = 80
    elif channel_lower == 'sony pal':
        c_score = 20
        
    is_full = 1000 if mins >= 15 else 0
    is_double = 1000 if mins >= 35 else 0
    compilation_penalty = -5000 if is_compilation(title) else 0
    
    return is_full + is_double + compilation_penalty + c_score * 10 + mins


# ───────────────────────────── JSON I/O ─────────────────────────────

def load_db():
    """Load the master episodes.json database."""
    if not os.path.exists(JSON_DB_FILE):
        print(f"Error: {JSON_DB_FILE} not found!")
        sys.exit(1)
    with open(JSON_DB_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_db(db):
    """Atomically save the master episodes.json database."""
    db_dir = os.path.dirname(JSON_DB_FILE) or "."
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=db_dir, suffix=".tmp", delete=False, encoding="utf-8") as tmp:
            json.dump(db, tmp, separators=(',', ':'), ensure_ascii=False)
            tmp_path = tmp.name
        os.replace(tmp_path, JSON_DB_FILE)
    except Exception as e:
        print(f"[ERROR] Atomic write failed, falling back to direct write: {e}")
        with open(JSON_DB_FILE, "w", encoding="utf-8") as f:
            json.dump(db, f, separators=(',', ':'), ensure_ascii=False)


# ───────────────────────────── YouTube Search ─────────────────────────────

def find_episode(ep_num: int, require_full: bool = False):
    """Search YouTube for a specific episode and return the best match + fallbacks."""
    search_queries = [
        f"Ep {ep_num} Taarak Mehta Ka Ooltah Chashmah",
        f"Taarak Mehta Ka Ooltah Chashmah Episode {ep_num}",
        f"Taarak Mehta Ka Ooltah Chashmah एपिसोड {ep_num}",
        f"TMKOC Episode {ep_num} Full Episode",
    ]

    best_match = None
    best_score = -1
    best_mins = -1
    fallback_id = None
    short_id = None

    for query in search_queries:
        try:
            videos = scrapetube.get_search(query, limit=10)
            for vid in videos:
                title_runs = vid.get('title', {}).get('runs', [])
                title = "".join([r.get('text', '') for r in title_runs]).strip()
                vid_id = vid.get('videoId', '')
                channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '')
                description = extract_description_text(vid)

                if vid_id and is_single_episode(title, description, channel, ep_num, require_full):
                    time_text = vid.get('publishedTimeText', {}).get('simpleText', '')
                    date_str = parse_relative_date(time_text)
                    duration_str = vid.get('lengthText', {}).get('simpleText', '0:00')
                    
                    if require_full and is_promo(title):
                        continue
                        
                    mins = get_minutes(duration_str)
                    if mins > 55:
                        continue
                        
                    score = get_video_score(mins, channel, title)
                        
                    if score > best_score:
                        # Demote old best to fallback
                        if best_match and best_match['vid_id'] != vid_id:
                            if best_mins >= 15:
                                fallback_id = best_match['vid_id']
                            elif best_mins >= 8 and not short_id:
                                short_id = best_match['vid_id']
                        best_score = score
                        best_mins = mins
                        best_match = {
                            'vid_id': vid_id,
                            'title': title,
                            'date_str': date_str,
                            'duration_str': duration_str,
                            'duration_secs': duration_str_to_seconds(duration_str),
                            'channel': channel,
                        }
                    elif best_match and vid_id != best_match['vid_id']:
                        if not fallback_id and mins >= 15:
                            fallback_id = vid_id
                        elif not short_id and 8 <= mins < 15:
                            short_id = vid_id
        except Exception as e:
            print(f"  [WARN] Search query failed: {e}")
            continue
            
        if best_mins > 15 and fallback_id and short_id:
            break

    if best_match:
        best_match['fallback_id'] = fallback_id
        best_match['short_id'] = short_id
        return best_match
    return None


# ───────────────────────────── Upgrade Scan ─────────────────────────────

def upgrade_existing_episodes(db, upgraded_details):
    """Scan recent and weak episodes for better YouTube links."""
    upgraded_count = 0
    ep_nums = sorted([int(k) for k in db.keys()], reverse=True)
    max_ep = ep_nums[0] if ep_nums else 0
    
    for ep_num in ep_nums:
        ep_key = str(ep_num)
        ep_data = db[ep_key]
        
        title = ep_data.get('title', '')
        current_secs = ep_data.get('durationSeconds', 0)
        current_mins = current_secs // 60 if current_secs else 0
        current_vid = ep_data.get('yt_main', '')
        
        is_recent = (ep_num > max_ep - 100)
        
        # Only check episodes that are promos, too short, too long, or recent
        if not (is_promo(title) or current_mins < 16 or current_mins > 55 or is_recent):
            continue
            
        print(f"Checking for better version for Ep {ep_num} (Currently: {current_mins}m)...")
        result = find_episode(ep_num, require_full=False)
        if not result:
            print(f"  [KEPT] No better version found.")
            continue
            
        new_vid = result['vid_id']
        new_title = result['title']
        new_mins = get_minutes(result['duration_str'])
        new_channel = result['channel']
        
        old_is_promo = is_promo(title)
        new_is_promo = is_promo(new_title)
        old_is_geoblocked = is_geoblocked_title(title)
        new_is_geoblocked = is_geoblocked_title(new_title)
        
        should_upgrade = False
        
        if old_is_promo and not new_is_promo:
            should_upgrade = True
        elif not old_is_promo and new_is_promo:
            should_upgrade = False
        elif old_is_geoblocked and not new_is_geoblocked and new_mins >= 18:
            should_upgrade = True
        elif not old_is_geoblocked and new_is_geoblocked:
            should_upgrade = False
        else:
            new_score = get_video_score(new_mins, new_channel, new_title)
            old_score_estimate = get_video_score(current_mins, "Unknown", title)
            if new_score > old_score_estimate + 10 and new_vid != current_vid:
                should_upgrade = True
        
        if should_upgrade:
            print(f"  [UPGRADED] Ep {ep_num}: {new_title} ({result['duration_str']})")
            ep_data['yt_main'] = new_vid
            ep_data['durationSeconds'] = result['duration_secs']
            if result.get('date_str'):
                ep_data['releaseDate'] = result['date_str']
            ep_data['status'] = 'Found'
            
            # Add fallback/short if found
            if result.get('fallback_id') and result['fallback_id'] != new_vid:
                backups = ep_data.get('yt_backups', [])
                if result['fallback_id'] not in backups:
                    backups.insert(0, result['fallback_id'])
                ep_data['yt_backups'] = backups
            if result.get('short_id') and result['short_id'] != new_vid:
                shorts = ep_data.get('yt_shorts', [])
                if result['short_id'] not in shorts:
                    shorts.insert(0, result['short_id'])
                ep_data['yt_shorts'] = shorts
                
            upgraded_count += 1
            upgraded_details.append(f"Ep {ep_num} ({current_mins}m -> {new_mins}m)")
        else:
            # Even if not upgrading main, try to add new fallbacks
            updated = False
            if result.get('fallback_id') and result['fallback_id'] != current_vid:
                backups = ep_data.get('yt_backups', [])
                if result['fallback_id'] not in backups:
                    backups.insert(0, result['fallback_id'])
                    ep_data['yt_backups'] = backups
                    updated = True
            if result.get('short_id') and result['short_id'] != current_vid:
                shorts = ep_data.get('yt_shorts', [])
                if result['short_id'] not in shorts:
                    shorts.insert(0, result['short_id'])
                    ep_data['yt_shorts'] = shorts
                    updated = True
                    
            if updated:
                print(f"  [UPDATED FALLBACKS] Ep {ep_num}")
                upgraded_count += 1
            else:
                print(f"  [KEPT] Existing version is optimal.")
    
    return upgraded_count


# ───────────────────────────── Main ─────────────────────────────

def main():
    print("=======================================================")
    print("  TMKOC Website & DB Auto-Updater (JSON Native Mode)")
    print("=======================================================")

    upgraded_details = []
    added_details = []

    if not os.path.exists(STATE_FILE):
        print(f"Error: {STATE_FILE} not found!")
        sys.exit(1)

    with open(STATE_FILE, "r", encoding="utf-8") as f:
        state = json.load(f)

    db = load_db()
    
    # Reconcile state with actual DB
    all_ep_nums = [int(k) for k in db.keys() if k.isdigit()]
    max_db_ep = max(all_ep_nums) if all_ep_nums else 0
    last_ep = state.get("last_episode", 4778)
    
    if max_db_ep > 0 and max_db_ep != last_ep:
        print(f"Reconciling state: state.json says {last_ep}, but DB max is {max_db_ep}. Using {max_db_ep}.")
        last_ep = max_db_ep
        state["last_episode"] = max_db_ep

    print(f"Checking for new TMKOC episodes after Ep {last_ep}...")

    # 1. Upgrade existing weak/promo/recent episodes
    upgraded_count = upgrade_existing_episodes(db, upgraded_details)
    
    # 2. Find brand new episodes
    episodes_added = 0
    next_ep = last_ep + 1

    while True:
        print(f"Searching for Episode {next_ep}...")
        result = find_episode(next_ep, require_full=True)

        if result:
            vid_id = result['vid_id']
            title = result['title']
            print(f"[FOUND] Ep {next_ep}: {title}")

            backups = []
            if result.get('fallback_id') and result['fallback_id'] != vid_id:
                backups.append(result['fallback_id'])
            shorts = []
            if result.get('short_id') and result['short_id'] != vid_id:
                shorts.append(result['short_id'])

            db[str(next_ep)] = {
                "epNumber": next_ep,
                "title": title,
                "description": "",
                "releaseDate": result.get('date_str', ''),
                "durationSeconds": result['duration_secs'],
                "thumbnail": "",
                "yt_main": vid_id,
                "yt_backups": backups,
                "yt_shorts": shorts,
                "status": "Found"
            }

            added_details.append(f"Ep {next_ep}")
            last_ep = next_ep
            episodes_added += 1
            next_ep += 1
        else:
            print(f"[UP TO DATE] Ep {next_ep} is not available on YouTube yet.")
            break

    # Save JSON database
    if upgraded_count > 0 or episodes_added > 0:
        save_db(db)
        print(f"\nSaved {len(db)} episodes to {JSON_DB_FILE}")

    # Update state atomically
    today_str = time.strftime("%Y-%m-%d")
    state["last_episode"] = last_ep
    state["last_updated"] = today_str
    state["total_found"] = len(db)

    state_dir = os.path.dirname(STATE_FILE) or "."
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=state_dir, suffix=".tmp", delete=False, encoding="utf-8") as tmp:
            json.dump(state, tmp, indent=2)
            tmp_path = tmp.name
        os.replace(tmp_path, STATE_FILE)
    except Exception as e:
        print(f"[ERROR] Failed to write state.json atomically: {e}")
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)

    # Write activity log
    if added_details or upgraded_details:
        now_str = datetime.datetime.now(datetime.timezone.utc).strftime('%d %b %Y (%H:%M UTC)')
        
        log_entry = f"## 🔄 Sync Report: {now_str}\n\n"
        log_entry += "### 📊 Insights & Summary\n"
        
        if added_details:
            log_entry += f"- **New Episodes Added:** {len(added_details)} (Latest: Ep {last_ep})\n"
        else:
            log_entry += f"- **New Episodes Added:** 0 (Latest remains Ep {last_ep})\n"
            
        if upgraded_details:
            log_entry += f"- **Links Upgraded:** {len(upgraded_details)} (Replaced promos or dead links with full episodes)\n"
        else:
            log_entry += f"- **Links Upgraded:** 0\n"
            
        log_entry += "\n"
        
        if added_details:
            log_entry += "### ✨ New Episodes\n"
            for ep in added_details:
                log_entry += f"- {ep}\n"
            log_entry += "\n"
            
        if upgraded_details:
            log_entry += f"### 📈 Upgrades ({len(upgraded_details)})\n"
            log_entry += "<details>\n<summary>Click to view all upgraded episodes</summary>\n\n"
            for up in upgraded_details:
                clean_up = up.replace("->", "➡️")
                parts = clean_up.split(' (')
                if len(parts) == 2:
                    log_entry += f"- **{parts[0]}**: {parts[1][:-1]}\n"
                else:
                    log_entry += f"- {clean_up}\n"
            log_entry += "\n</details>\n\n"
            
        log_entry += "---\n\n"
        
        log_file = os.path.join(BASE_DIR, "activity_logs.md")
        existing_log = ""
        try:
            with open(log_file, "r", encoding="utf-8") as f:
                existing_log = f.read()
        except FileNotFoundError:
            pass
        with open(log_file, "w", encoding="utf-8") as f:
            f.write(log_entry + existing_log)

    print("\n=======================================================")
    print(f" Website Update Complete! {episodes_added} new episode(s) added, {upgraded_count} link(s) upgraded.")
    print(f" Latest Episode in DB: Ep {last_ep}")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
