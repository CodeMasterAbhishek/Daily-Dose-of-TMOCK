import json
import os
import sys
import urllib.request
import urllib.error

# Ensure we can import from config
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from config import JSON_DB_FILE

SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_ANON_KEY')

def fetch_dead_links():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Missing Supabase credentials in environment variables.")
        return []
        
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/dead_links?select=*"
    req = urllib.request.Request(url, headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json'
    })
    
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Failed to fetch dead links: {e}")
        return []
        
def delete_dead_link(record_id):
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/dead_links?id=eq.{record_id}"
    req = urllib.request.Request(url, method='DELETE', headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}'
    })
    try:
        urllib.request.urlopen(req)
        return True
    except:
        return False

def is_video_dead(vid_id):
    """Check if a video is unavailable or dead by testing its player playability status."""
    if not vid_id:
        return True
    try:
        url = "https://www.youtube.com/youtubei/v1/player"
        payload = json.dumps({
            "context": {
                "client": {
                    "clientName": "ANDROID",
                    "clientVersion": "19.09.37",
                    "hl": "en",
                    "gl": "IN"
                }
            },
            "videoId": vid_id
        }).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "com.google.android.youtube/19.09.37"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            status = data.get("playabilityStatus", {}).get("status", "")
            # "OK" indicates the video is healthy and playable.
            # Other statuses (UNPLAYABLE, ERROR, LOGIN_REQUIRED) indicate dead or geo-blocked.
            return status != "OK"
    except Exception as e:
        print(f"Notice: Could not probe video {vid_id} status ({e}). Assuming safe.")
        return False

def scrape_new_link(ep_number):
    try:
        import scrapetube
        from utils import get_minutes, is_compilation
    except ImportError:
        print("Required modules not found for scraping.")
        return None
        
    print(f"Searching YouTube for replacement for Episode {ep_number}...")
    query = f"Taarak Mehta Ka Ooltah Chashmah Episode {ep_number}"
    videos = scrapetube.get_search(query, sort_by="relevance")
    
    OFFICIAL_CHANNELS = [
        "Sony SAB", "Taarak Mehta Ka Ooltah Chashmah", "Sony PAL", 
        "Taarak Mehta Ka Ooltah Chashmah Episodes", "LIV Comedy", 
        "Taarak Mehta ka Ooltah Chashmah Movies"
    ]
    
    for count, video in enumerate(videos):
        if count >= 30:
            break
            
        vid = video.get('videoId')
        if not vid:
            continue
            
        title = ""
        try:
            title = video['title']['runs'][0]['text']
        except:
            pass
            
        channel_name = ""
        try:
            channel_name = video.get('ownerText', {}).get('runs', [{}])[0].get('text', '')
        except:
            pass
            
        # VERY STRICT WHITELIST
        if channel_name not in OFFICIAL_CHANNELS:
            continue
            
        # Basic validation: ensure it's not a compilation and is roughly ~20 mins
        duration_str = ""
        try:
            duration_str = video['lengthText']['simpleText']
        except:
            pass
            
        mins = get_minutes(duration_str)
        if 15 <= mins <= 45 and not is_compilation(title) and str(ep_number) in title:
            print(f"Found solid replacement: {vid} ({title})")
            return vid
            
    return None

def main():
    print("==================================================")
    print("  TMKOC Auto-Healer (Nightly)")
    print("==================================================")
    
    dead_links = fetch_dead_links()
    if not dead_links:
        print("No dead links reported. Database is perfectly healthy!")
        return
        
    print(f"Found {len(dead_links)} dead links reported by users.")
    
    # Load JSON DB
    with open(JSON_DB_FILE, 'r', encoding='utf-8') as f:
        db = json.load(f)
        
    fixed_count = 0
    for record in dead_links:
        ep_num = str(record['episode_number'])
        dead_vid = record['video_id']
        record_id = record['id']
        
        if ep_num not in db:
            print(f"Ep {ep_num} not in DB. Deleting report.")
            delete_dead_link(record_id)
            continue
            
        ep_data = db[ep_num]
        
        # Check if the reported dead video is still our main video or in backups
        needs_fix = False
        if ep_data.get('yt_main') == dead_vid:
            needs_fix = True
        elif dead_vid in ep_data.get('yt_backups', []):
            if is_video_dead(dead_vid):
                ep_data['yt_backups'].remove(dead_vid)
                print(f"Removed verified dead backup {dead_vid} from Ep {ep_num}")
                delete_dead_link(record_id)
                fixed_count += 1
            else:
                print(f"Reported backup {dead_vid} for Ep {ep_num} is alive. Discarding report.")
                delete_dead_link(record_id)
            continue
            
        if not needs_fix:
            print(f"Video {dead_vid} is already replaced for Ep {ep_num}. Skipping.")
            delete_dead_link(record_id)
            continue
            
        # Verify if the main video is actually dead before altering the database
        if not is_video_dead(dead_vid):
            print(f"Main video {dead_vid} for Ep {ep_num} was reported dead, but verified PLAYABLE. Discarding false report.")
            delete_dead_link(record_id)
            continue

        # It's the main video that truly died! Let's find a verified replacement.
        # First, try to promote a healthy backup
        promoted = False
        while ep_data.get('yt_backups'):
            candidate = ep_data['yt_backups'].pop(0)
            if not is_video_dead(candidate):
                ep_data['yt_main'] = candidate
                print(f"Promoted verified backup {candidate} to main for Ep {ep_num}")
                delete_dead_link(record_id)
                fixed_count += 1
                promoted = True
                break
            else:
                print(f"Backup {candidate} was also dead for Ep {ep_num}. Dropping it.")
        if promoted:
            continue
            
        # No backups available, we must scrape a new one!
        new_vid = scrape_new_link(ep_num)
        if new_vid and new_vid != dead_vid and not is_video_dead(new_vid):
            ep_data['yt_main'] = new_vid
            print(f"Replaced dead main video for Ep {ep_num} with new scrape: {new_vid}")
            delete_dead_link(record_id)
            fixed_count += 1
        else:
            print(f"Failed to find a playable replacement for Ep {ep_num} on YouTube.")
            # Leave it in Supabase to try again tomorrow
            
    if fixed_count > 0:
        tmp_db = JSON_DB_FILE + ".tmp"
        with open(tmp_db, 'w', encoding='utf-8') as f:
            json.dump(db, f, separators=(',', ':'), ensure_ascii=False)
        os.replace(tmp_db, JSON_DB_FILE)
        print(f"Successfully auto-healed {fixed_count} episodes!")
    else:
        print("No episodes were healed this run.")

if __name__ == "__main__":
    main()
