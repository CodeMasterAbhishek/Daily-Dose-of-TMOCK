"""
Official YouTube Description Extractor
Fetches full official video descriptions uploaded by Sony SAB for TMKOC episodes.
"""

import urllib.request
import csv
import re
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

def fetch_desc(video_id):
    url = f"https://www.youtube.com/watch?v={video_id}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        match = re.search(r'"shortDescription":"(.*?)"', html)
        if match:
            # Clean escaped characters
            desc = match.group(1).encode('utf-8').decode('unicode_escape', errors='ignore')
            return desc.replace('\\n', ' ').strip()
    except Exception as e:
        pass
    return ""

def test_fetch_range():
    episodes = []
    with open('episodes.csv', 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if len(row) >= 3:
                ep_num = int(row[0])
                title = row[1]
                url = row[2]
                vid = ''
                if 'v=' in url:
                    vid = url.split('v=')[1].split('&')[0]
                elif 'youtu.be/' in url:
                    vid = url.split('youtu.be/')[1].split('?')[0]
                
                if 72 <= ep_num <= 76 and vid:
                    episodes.append((ep_num, title, vid))

    print(f"Testing official description fetching for {len(episodes)} episodes...")
    for ep, title, vid in episodes:
        desc = fetch_desc(vid)
        print(f"\n--- Episode {ep}: {title} ---")
        print(f"Official Description: {desc[:200]}...")

if __name__ == '__main__':
    test_fetch_range()
