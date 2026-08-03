import csv
import json
import os
import sys
import time

STATE_FILE = "state.json"
CSV_FILE = "episodes.csv"
BATCH_SIZE = 190  # Safe daily batch under 10,000 quota limit (190 * 50 = 9,500 units)


def get_youtube_service():
    """Initializes YouTube API v3 service using environment secrets."""
    client_id = os.environ.get('YOUTUBE_CLIENT_ID')
    client_secret = os.environ.get('YOUTUBE_CLIENT_SECRET')
    refresh_token = os.environ.get('YOUTUBE_REFRESH_TOKEN')

    if not (client_id and client_secret and refresh_token):
        print("[WARNING] YouTube API credentials missing.")
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
        print(f"[ERROR] Failed to authenticate YouTube API: {e}")
        return None


def add_video_to_playlist(youtube, playlist_id: str, video_id: str) -> bool:
    """Adds a video to the specified YouTube Playlist via API."""
    try:
        request_body = {
            "snippet": {
                "playlistId": playlist_id,
                "resourceId": {
                    "kind": "youtube#video",
                    "videoId": video_id
                }
            }
        }
        youtube.playlistItems().insert(
            part="snippet",
            body=request_body
        ).execute()
        return True
    except Exception as e:
        err_msg = str(e)
        if "quotaExceeded" in err_msg:
            print("[QUOTA EXCEEDED] Daily YouTube API quota limit reached for today.")
            return False
        print(f"[WARNING] Could not add video {video_id}: {err_msg[:80]}")
        return False


def main():
    print("=======================================================")
    print("  TMKOC Daily 190-Video Batch Playlist Populator")
    print("=======================================================")

    youtube = get_youtube_service()
    playlist_id = os.environ.get("YOUTUBE_PLAYLIST_ID")

    if not youtube or not playlist_id:
        print("[INFO] Missing YouTube API service or YOUTUBE_PLAYLIST_ID secret. Exiting.")
        return

    # Load state
    if not os.path.exists(STATE_FILE):
        print(f"[ERROR] {STATE_FILE} not found!")
        return

    with open(STATE_FILE, "r", encoding="utf-8") as f:
        state = json.load(f)

    # Current progress (start from 200 since user added 200 today)
    current_index = state.get("playlist_populated_up_to", 200)
    print(f"Current Playlist Progress: Populated up to index {current_index}")

    # Read CSV episodes
    episodes = []
    with open(CSV_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("URL") and "v=" in row["URL"]:
                vid_id = row["URL"].split("v=")[1].split("&")[0]
                episodes.append({
                    "episode": row["Episode"],
                    "title": row["Title"],
                    "url": row["URL"],
                    "video_id": vid_id
                })

    total_episodes = len(episodes)
    if current_index >= total_episodes:
        print(f"[COMPLETE] All {total_episodes} past episodes have already been added to your playlist!")
        return

    end_index = min(current_index + BATCH_SIZE, total_episodes)
    batch = episodes[current_index:end_index]

    print(f"\nProcessing Today's Batch: Video {current_index + 1} to {end_index} ({len(batch)} videos)...")

    added_count = 0
    quota_reached = False

    for idx, item in enumerate(batch):
        ep_num = item["episode"]
        vid_id = item["video_id"]
        title = item["title"]

        success = add_video_to_playlist(youtube, playlist_id, vid_id)
        if success:
            added_count += 1
            print(f"[{current_index + idx + 1}/{total_episodes}] Added Ep {ep_num}: {title[:40]}...")
            time.sleep(0.5)
        else:
            quota_reached = True
            break

    # Save state
    new_populated_index = current_index + added_count
    state["playlist_populated_up_to"] = new_populated_index
    state["last_updated"] = time.strftime("%Y-%m-%d")

    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

    print("\n=======================================================")
    print(f" Daily Batch Complete! Added {added_count} videos today.")
    print(f" Total Playlist Progress: {new_populated_index}/{total_episodes} videos")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
