import csv
import json
import urllib.request
import re
from datetime import datetime
import os

CSV_FILE = 'data/episodes.csv'
TEMP_CSV_FILE = 'episodes_patch.csv'
CACHE_FILE = 'data/dates_cache.json'

def format_date(raw_date):
    try:
        dt = datetime.strptime(raw_date[:10], "%Y-%m-%d")
        return dt.strftime("%d %b %Y")
    except Exception:
        return ""

def patch_dates():
    with open(CACHE_FILE, 'r', encoding='utf-8') as f:
        cache = json.load(f)
        
    unavailable_urls = set(url for url, date in cache.items() if date == "Unavailable")
    print(f"Found {len(unavailable_urls)} videos marked as Unavailable. Attempting bypass...")

    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
        
    patched_count = 0
    for row in rows:
        if len(row) > 4:
            url = row[2]
            if url in unavailable_urls:
                try:
                    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                    html = urllib.request.urlopen(req).read().decode('utf-8')
                    match = re.search(r'"publishDate":"(.*?)"', html)
                    if match:
                        raw_date = match.group(1)
                        formatted = format_date(raw_date)
                        if formatted:
                            row[4] = formatted
                            cache[url] = raw_date
                            patched_count += 1
                            print(f"Patched Episode {row[0]}: {formatted}")
                except Exception as e:
                    pass
                
    if patched_count > 0:
        with open(TEMP_CSV_FILE, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(rows)
        os.replace(TEMP_CSV_FILE, CSV_FILE)
        
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, indent=4)
            
        print(f"Successfully patched {patched_count} restricted videos!")
    else:
        print("No videos could be patched.")

if __name__ == "__main__":
    patch_dates()
