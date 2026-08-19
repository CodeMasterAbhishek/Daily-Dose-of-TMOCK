import csv
import json
import os
import subprocess
import time
from datetime import datetime

CACHE_FILE = 'data/dates_cache.json'
CSV_FILE = 'data/episodes.csv'
TEMP_CSV_FILE = 'episodes_temp.csv'

def load_cache():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_cache(cache):
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache, f, indent=4)

def format_date(raw_date):
    if not raw_date or len(raw_date) != 8:
        return ""
    try:
        dt = datetime.strptime(raw_date, "%Y%m%d")
        return dt.strftime("%d %b %Y") # e.g., 12 Jun 2017
    except ValueError:
        return ""

def fetch_date_with_retry(url, max_retries=3):
    for attempt in range(max_retries):
        try:
            result = subprocess.run(
                ['yt-dlp', '--print', 'upload_date', url],
                capture_output=True, text=True, check=True
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError as e:
            if "Video unavailable" in e.stderr or "Sign in to confirm your age" in e.stderr or "Private video" in e.stderr:
                return "Unavailable"
            print(f"Error fetching {url}. Retry {attempt + 1}/{max_retries}...")
            time.sleep(3 * (attempt + 1))
        except Exception as e:
            print(f"Unknown error fetching {url}: {e}. Retry {attempt + 1}/{max_retries}...")
            time.sleep(3 * (attempt + 1))
    return ""

def update_episodes():
    print("Starting background date update process...")
    cache = load_cache()
    
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
        
    print(f"Total videos to process: {len(rows)}")
    print(f"Found {len(cache)} entries already in cache.")
    
    modified_count = 0
    save_threshold = 20 # Save CSV every 20 modifications so we don't lose progress on power cut
    
    for i, row in enumerate(rows):
        # Ensure row has at least 6 columns
        if len(row) < 6:
            row.extend([""] * (6 - len(row)))
            
        ep_num, title, url, status, date, duration = row[:6]
        
        # Check cache
        if url in cache:
            cached_val = cache[url]
            if cached_val != "Unavailable":
                formatted = format_date(cached_val)
                if formatted and row[4] != formatted:
                    row[4] = formatted
                    modified_count += 1
            continue
            
        print(f"[{i+1}/{len(rows)}] Fetching date for Episode {ep_num} ({url})...")
        raw_date = fetch_date_with_retry(url)
        
        if raw_date:
            cache[url] = raw_date
            # Save cache immediately for fault tolerance
            save_cache(cache)
            
            if raw_date != "Unavailable":
                formatted = format_date(raw_date)
                if formatted:
                    row[4] = formatted
                    modified_count += 1
                    
        # Atomic save of CSV progress
        if modified_count >= save_threshold:
            print(f"Saving intermediate progress to CSV... (Row {i+1})")
            with open(TEMP_CSV_FILE, 'w', encoding='utf-8', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(header)
                writer.writerows(rows)
            os.replace(TEMP_CSV_FILE, CSV_FILE)
            modified_count = 0
            
    # Final save
    print("Saving final CSV...")
    with open(TEMP_CSV_FILE, 'w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)
    os.replace(TEMP_CSV_FILE, CSV_FILE)
    print("Done! All dates updated successfully.")

if __name__ == "__main__":
    update_episodes()
