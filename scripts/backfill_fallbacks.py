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
import concurrent.futures

def process_row(row):
    if len(row) < 6 or not row[0].isdigit():
        return row
        
    ep_num = int(row[0])
    primary_url = row[2]
    
    if len(row) >= 8 and row[6].strip() and row[7].strip():
        return row
        
    print(f"Searching fallback & short for Ep {ep_num}...")
    
    query = f"Taarak Mehta Ka Ooltah Chashmah Episode {ep_num}"
    fallback_url = row[6].strip() if len(row) >= 7 else ""
    short_url = row[7].strip() if len(row) >= 8 else ""
    
    try:
        videos = scrapetube.get_search(query, limit=10)
        for vid in videos:
            channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '').lower()
            valid_channels = [
                'sony sab', 
                'sony pal', 
                'taarak mehta ka ooltah chashmah', 
                'taarak mehta ka ooltah chashmah episodes',
                'taarak mehta ka ooltah chashmah movies',
                'liv comedy'
            ]
            
            if channel in valid_channels:
                title_runs = vid.get('title', {}).get('runs', [])
                title = "".join([r.get('text', '') for r in title_runs]).strip().lower()
                
                ep_extract = re.search(r'(?:ep|episode|ep\.|एपिसोड)\s*#?\s*(\d+)', title)
                found_ep = int(ep_extract.group(1)) if ep_extract else -1
                
                if found_ep == ep_num or str(ep_num) in title:
                    vid_id = vid.get('videoId', '')
                    duration_str = vid.get('lengthText', {}).get('simpleText', '0:00')
                    mins = get_minutes(duration_str)
                    
                    potential_url = f"https://www.youtube.com/watch?v={vid_id}"
                    if potential_url != primary_url:
                        if 15 <= mins <= 30 and not fallback_url:
                            fallback_url = potential_url
                        elif 8 <= mins < 15 and not short_url:
                            short_url = potential_url
                            
            if fallback_url and short_url:
                break
    except Exception as e:
        pass
        
    while len(row) < 8:
        row.append("")
        
    row[6] = fallback_url
    row[7] = short_url
    
    return row

print("Processing episodes concurrently using 20 workers...")

processed_rows = []
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
    processed_rows = list(executor.map(process_row, rows))

updated_count = sum(1 for i, r in enumerate(processed_rows) if len(r) >= 8 and (r[6] or r[7]) and (len(rows[i]) < 8 or r[6] != rows[i][6] if len(rows[i])>6 else r[6] or r[7] != rows[i][7] if len(rows[i])>7 else r[7]))

with open(TEMP_FILE, 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    for row in processed_rows:
        writer.writerow(row)

shutil.move(TEMP_FILE, CSV_FILE)
print(f"Done! Evaluated {len(rows)} episodes. Added/Updated fallbacks.")
