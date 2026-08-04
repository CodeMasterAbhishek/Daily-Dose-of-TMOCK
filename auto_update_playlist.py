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

OFFICIAL_CHANNELS = {'sony pal', 'sony sab', 'set india', 'sony liv', 'taarak mehta ka ooltah chashmah'}
STATE_FILE = "state.json"
CSV_FILE = "episodes.csv"


def extract_description_text(vid_dict: dict) -> str:
    """Extracts description snippet text from scrapetube search result dictionary."""
    snippets = vid_dict.get('detailedMetadataSnippets', [])
    desc_text = ""
    for s in snippets:
        runs = s.get('snippetText', {}).get('runs', [])
        for r in runs:
            desc_text += " " + r.get('text', '')
    return desc_text.strip()


def is_single_episode(title: str, description: str, channel: str, ep_num: int) -> bool:
    """
    Evaluates whether a YouTube video corresponds strictly to a SINGLE episode matching `ep_num`.
    """
    title_lower = title.lower()
    desc_lower = description.lower()
    channel_lower = channel.lower()
    combined_text = title_lower + " " + desc_lower

    # STRICTLY REJECT MULTI-EPISODE RANGES (e.g., Ep 4499-4504 or 100 to 105)
    if re.search(r'\b(?:ep|episode|episodes|ep\.|एपिसोड)?\s*(\d{2,4})\s*(?:-|–|—|to|से)\s*(\d{2,4})\b', combined_text):
        m = re.search(r'\b(?:ep|episode|episodes|ep\.|एपिसोड)?\s*(\d{2,4})\s*(?:-|–|—|to|से)\s*(\d{2,4})\b', combined_text)
        if m and int(m.group(1)) != int(m.group(2)):
            n1, n2 = int(m.group(1)), int(m.group(2))
            if abs(n2 - n1) >= 2:
                return False

    if any(k in combined_text for k in ['compilation', 'best of', 'full movie', 'mega episode']):
        return False

    # Check if a different episode number is explicitly in title/description
    ep_extract = re.search(r'(?:ep|episode|ep\.|एपिसोड)\s*#?\s*(\d+)', title_lower)
    if ep_extract:
        found_ep = int(ep_extract.group(1))
        if found_ep != ep_num:
            return False  # Reject if title mentions Ep 4683 when searching for 5083

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


def find_next_episode(ep_num: int) -> tuple[str, str, str] | None:
    """
    Searches YouTube for Episode `ep_num`.
    Returns (video_id, title, url) if found, else None.
    """
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
                title = title_runs[0].get('text', '') if title_runs else ''
                vid_id = vid.get('videoId', '')
                channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '')
                description = extract_description_text(vid)

                if vid_id and is_single_episode(title, description, channel, ep_num):
                    url = f"https://www.youtube.com/watch?v={vid_id}"
                    return (vid_id, title, url)
        except Exception:
            continue

    return None


def get_youtube_service():
    """Initializes YouTube API v3 service using environment secrets."""
    client_id = os.environ.get('YOUTUBE_CLIENT_ID')
    client_secret = os.environ.get('YOUTUBE_CLIENT_SECRET')
    refresh_token = os.environ.get('YOUTUBE_REFRESH_TOKEN')

    if not (client_id and client_secret and refresh_token):
        print("[INFO] YouTube API secrets not found. Running in CSV-only update mode.")
        return None

    try:
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            client_id=client_id,
            client_secret=client_secret,
            token_uri="https://oauth2.googleapis.com/token",
        )
        return build("youtube", "v3", credentials=creds)
    except Exception as e:
        print(f"[WARNING] Could not authenticate YouTube API: {e}")
        return None


def extract_video_id(url):
    if not url:
        return ''
    match = re.search(r'(?:v=|\/embed\/|\/shorts\/|youtu\.be\/|^)([a-zA-Z0-9_-]{11})(?:[&?]|$)', url)
    return match.group(1) if match else ''


def add_video_to_playlist(youtube_service, playlist_id, video_id):
    if not (youtube_service and playlist_id and video_id):
        return False
    try:
        request = youtube_service.playlistItems().insert(
            part="snippet",
            body={
                "snippet": {
                    "playlistId": playlist_id,
                    "resourceId": {
                        "kind": "youtube#video",
                        "videoId": video_id
                    }
                }
            }
        )
        request.execute()
        return True
    except Exception as e:
        print(f"[WARNING] Could not add video {video_id} to playlist: {e}")
        return False


def populate_daily_batch(youtube_service, playlist_id, state):
    current_pop = state.get("playlist_populated_up_to", 0)
    target_pop = min(4778, current_pop + 200)

    if current_pop >= 4778:
        print("[BATCH POPULATOR] All 4,778 episodes have been populated into playlist state.")
        return

    print(f"[BATCH POPULATOR] Populating batch for episodes {current_pop + 1} to {target_pop}...")

    ep_map = {}
    if os.path.exists(CSV_FILE):
        with open(CSV_FILE, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader, None)
            for row in reader:
                if len(row) >= 3 and row[0].isdigit():
                    ep_num = int(row[0])
                    vid_url = row[2]
                    vid_id = extract_video_id(vid_url)
                    if vid_id:
                        ep_map[ep_num] = vid_id

    added_count = 0
    for ep in range(current_pop + 1, target_pop + 1):
        vid_id = ep_map.get(ep)
        if vid_id and youtube_service and playlist_id:
            success = add_video_to_playlist(youtube_service, playlist_id, vid_id)
            if success:
                added_count += 1
            time.sleep(0.3)

    state["playlist_populated_up_to"] = target_pop
    print(f"[BATCH POPULATOR SUCCESS] Processed episodes {current_pop + 1} to {target_pop}. Updated playlist_populated_up_to = {target_pop}")


def main():
    print("=======================================================")
    print("  TMKOC Daily Auto-Sync & Batch Populator Bot")
    print("=======================================================")

    if not os.path.exists(STATE_FILE):
        print(f"Error: {STATE_FILE} not found!")
        sys.exit(1)

    with open(STATE_FILE, "r", encoding="utf-8") as f:
        state = json.load(f)

    youtube_service = get_youtube_service()
    playlist_id = os.environ.get("YOUTUBE_PLAYLIST_ID")

    # 1. Run Past Episodes Batch Populator (+200 episodes per day)
    try:
        populate_daily_batch(youtube_service, playlist_id, state)
    except Exception as e:
        print(f"[WARNING] Batch populator error: {e}")

    # 2. Check for Brand New Daily Episodes
    last_ep = state.get("last_episode", 4778)
    print(f"\nChecking for Brand New Daily Episodes (after Ep {last_ep})...")

    episodes_added = 0
    next_ep = last_ep + 1

    while True:
        print(f"Searching for Episode {next_ep} on YouTube...")
        result = find_next_episode(next_ep)

        if result:
            vid_id, title, url = result
            print(f"[FOUND BRAND NEW EPISODE] Ep {next_ep}: {title} ({url})")

            with open(CSV_FILE, mode="a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow([next_ep, title, url, "Found"])

            if youtube_service and playlist_id:
                add_video_to_playlist(youtube_service, playlist_id, vid_id)

            last_ep = next_ep
            episodes_added += 1
            next_ep += 1
        else:
            print(f"[UP TO DATE] Episode {next_ep} is not available on YouTube yet.")
            break

    # Save state
    today_str = time.strftime("%Y-%m-%d")
    state["last_episode"] = last_ep
    state["last_updated"] = today_str
    state["total_found"] = state.get("total_found", 4778) + episodes_added

    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

    print("\n=======================================================")
    print(f" Sync Complete! {episodes_added} new episode(s) detected today.")
    print(f" Latest Episode in DB: Ep {last_ep}")
    print(f" Batch Populated Up To: Ep {state.get('playlist_populated_up_to', 0)}")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
