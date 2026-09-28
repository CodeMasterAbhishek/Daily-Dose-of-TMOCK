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
            ep_data['yt_backups'].remove(dead_vid)
            print(f"Removed dead backup {dead_vid} from Ep {ep_num}")
            delete_dead_link(record_id)
            fixed_count += 1
            continue
            
        if not needs_fix:
            print(f"Video {dead_vid} is already replaced for Ep {ep_num}. Skipping.")
            delete_dead_link(record_id)
            continue
            
        # It's the main video that died! Let's find a new one.
        # First, try to promote a backup
        if ep_data.get('yt_backups'):
            new_main = ep_data['yt_backups'].pop(0)
            ep_data['yt_main'] = new_main
            print(f"Promoted backup {new_main} to main for Ep {ep_num}")
            delete_dead_link(record_id)
            fixed_count += 1
            continue
            
        # No backups available, we must scrape a new one!
        new_vid = scrape_new_link(ep_num)
        if new_vid:
            ep_data['yt_main'] = new_vid
            print(f"Replaced main video for Ep {ep_num} with new scrape: {new_vid}")
            delete_dead_link(record_id)
            fixed_count += 1
        else:
            print(f"Failed to find a replacement for Ep {ep_num} on YouTube.")
            # Leave it in Supabase to try again tomorrow
            
    if fixed_count > 0:
        with open(JSON_DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(db, f, separators=(',', ':'), ensure_ascii=False)
        print(f"Successfully auto-healed {fixed_count} episodes!")
    else:
        print("No episodes were healed this run.")

if __name__ == "__main__":
    main()
