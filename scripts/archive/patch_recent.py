import csv
import sys
import os

sys.path.append(os.path.abspath('scripts'))
import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from update_website import find_episode
from utils import get_minutes

CSV_FILE = 'data/episodes.csv'
rows = []
with open(CSV_FILE, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    for row in reader:
        rows.append(row)

for i, row in enumerate(rows):
    if i == 0 or len(row) < 3: continue
    ep_num = int(row[0])
    if 4790 <= ep_num <= 4825:
        print(f"Checking {ep_num}...")
        result = find_episode(ep_num, require_full=False)
        if result:
            vid_id, new_title, new_url, new_date_str, new_duration_str, new_channel, fallback_url, short_url = result
            if new_channel == 'Sony SAB':
                print(f"  Found Sony SAB for {ep_num}: {new_title}")
                rows[i][1] = new_title
                rows[i][2] = new_url
                rows[i][5] = new_duration_str
                # Keep fallbacks as is or update them
            else:
                print(f"  Only found {new_channel} for {ep_num}")

with open(CSV_FILE, 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerows(rows)
print("Done patching.")
