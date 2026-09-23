import os
import csv
import re
import sys
import time
import shutil

try:
    import scrapetube
except ImportError:
    print("Please pip install scrapetube")
    sys.exit(1)

CSV_FILE = os.path.join(os.path.dirname(__file__), '../data/episodes.csv')

def get_minutes(duration_str: str) -> int:
    parts = duration_str.split(':')
    if len(parts) == 3: # H:M:S
        return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 2: # M:S
        return int(parts[0])
    return 0

print("Reading episodes...")
rows = []
with open(CSV_FILE, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    for row in reader:
        rows.append(row)

updated_count = 0
print(f"Total rows read: {len(rows)}")

print("Starting backfill for fallback URLs...")
print("This will take a while. It will only search for episodes that don't already have a fallback.")

TEMP_FILE = CSV_FILE + '.tmp'
with open(TEMP_FILE, 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    
    for row in rows:
        # If it's a valid data row
        if len(row) >= 6 and row[0].isdigit():
            ep_num = int(row[0])
            primary_url = row[2]
            
            # If we already have a 7th column (fallback url), just rewrite and skip
            if len(row) >= 7 and row[6].strip():
                writer.writerow(row)
                continue
                
            print(f"Searching fallback for Ep {ep_num}...")
            
            # Search specifically for TMKOC official channel
            query = f"Taarak Mehta Ka Ooltah Chashmah Episode {ep_num}"
            fallback_url = ""
            
            try:
                videos = scrapetube.get_search(query, limit=10)
                for vid in videos:
                    channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '').lower()
                    
                    if channel == 'taarak mehta ka ooltah chashmah' or channel == 'taarak mehta ka ooltah chashmah episodes':
                        title_runs = vid.get('title', {}).get('runs', [])
                        title = "".join([r.get('text', '') for r in title_runs]).strip().lower()
                        
                        ep_extract = re.search(r'(?:ep|episode|ep\.|एपिसोड)\s*#?\s*(\d+)', title)
                        found_ep = int(ep_extract.group(1)) if ep_extract else -1
                        
                        if found_ep == ep_num or str(ep_num) in title:
                            vid_id = vid.get('videoId', '')
                            duration_str = vid.get('lengthText', {}).get('simpleText', '0:00')
                            mins = get_minutes(duration_str)
                            
                            if 15 <= mins <= 30 and vid_id:
                                potential_url = f"https://www.youtube.com/watch?v={vid_id}"
                                if potential_url != primary_url:
                                    fallback_url = potential_url
                                    break
            except Exception as e:
                pass
                
            if len(row) == 6:
                row.append(fallback_url)
            else:
                row[6] = fallback_url
                
            if fallback_url:
                print(f"  -> Found fallback: {fallback_url}")
                updated_count += 1
            else:
                print(f"  -> No fallback found.")
                
            writer.writerow(row)
            f.flush()
            time.sleep(0.5)
        else:
            writer.writerow(row)

shutil.move(TEMP_FILE, CSV_FILE)
print(f"Done! Added fallbacks for {updated_count} episodes.")
