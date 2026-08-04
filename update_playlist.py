"""
Update YouTube Playlist (YouTube Data API Batch Inserter)
Populates past TMKOC episode batches (+200 episodes/day) into your official YouTube Playlist.
"""

import csv
import json
import os
import re
import sys
import time

STATE_FILE = "state.json"
CSV_FILE = "episodes.csv"


def extract_video_id(url):
    if not url:
        return ''
    match = re.search(r'(?:v=|\/embed\/|\/shorts\/|youtu\.be\/|^)([a-zA-Z0-9_-]{11})(?:[&?]|$)', url)
    return match.group(1) if match else ''


def get_youtube_service():
    client_id = os.environ.get('YOUTUBE_CLIENT_ID')
    client_secret = os.environ.get('YOUTUBE_CLIENT_SECRET')
    refresh_token = os.environ.get('YOUTUBE_REFRESH_TOKEN')

    if not (client_id and client_secret and refresh_token):
        print("[WARNING] YouTube API OAuth secrets not found. Skipping YouTube Playlist update.")
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


def main():
    print("=======================================================")
    print("  YouTube Playlist Batch Auto-Updater")
    print("=======================================================")

    if not os.path.exists(STATE_FILE):
        print(f"Error: {STATE_FILE} not found!")
        sys.exit(1)

    with open(STATE_FILE, "r", encoding="utf-8") as f:
        state = json.load(f)

    youtube_service = get_youtube_service()
    playlist_id = os.environ.get("YOUTUBE_PLAYLIST_ID")

    current_pop = state.get("playlist_populated_up_to", 0)
    target_pop = min(4778, current_pop + 200)

    if current_pop >= 4778:
        print("[FINISHED] All 4,778 episodes have been populated into playlist.")
        return

    print(f"Populating YouTube Playlist for episodes {current_pop + 1} to {target_pop}...")

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

    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

    print("\n=======================================================")
    print(f" Playlist Batch Update Complete! Processed {added_count} videos.")
    print(f" Playlist Populated Up To: Ep {target_pop}")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
