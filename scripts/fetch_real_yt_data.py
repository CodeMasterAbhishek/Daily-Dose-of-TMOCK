import json
import re
import urllib.request

def get_yt_data(vid_id):
    url = f"https://www.youtube.com/watch?v={vid_id}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        
        # Extract description
        desc = ""
        desc_match = re.search(r'"shortDescription":"(.*?)"', html)
        if desc_match:
            desc = desc_match.group(1).replace('\\n', '\n').replace('\\"', '"')
            
        # Extract duration
        duration = 0
        dur_match = re.search(r'"lengthSeconds":"(\d+)"', html)
        if dur_match:
            duration = int(dur_match.group(1))
            
        return desc, duration
    except Exception as e:
        print(f"Error fetching {vid_id}: {e}")
        return "", 0

with open('data/episodes.json', 'r', encoding='utf-8') as f:
    db = json.load(f)

for ep in ['3859', '3860', '3861', '3862']:
    if ep in db:
        vid_id = db[ep].get('yt_main')
        if vid_id:
            print(f"Fetching real YouTube data for Ep {ep} (Video: {vid_id})...")
            desc, dur = get_yt_data(vid_id)
            if desc or dur:
                # Clean up description to prevent massive text blocks
                desc_clean = desc.split('Click here to')[0].split('Click here to')[0].strip()
                if len(desc_clean) > 500:
                    desc_clean = desc_clean[:497] + "..."
                
                db[ep]['description'] = desc_clean
                if dur > 0:
                    db[ep]['durationSeconds'] = dur
                print(f"  -> Duration: {dur}s")
                print(f"  -> Description: {desc_clean[:60]}...")

with open('data/episodes.json', 'w', encoding='utf-8') as f:
    json.dump(db, f, separators=(',', ':'), ensure_ascii=False)

print("Done updating deleted episodes with real YouTube data!")
