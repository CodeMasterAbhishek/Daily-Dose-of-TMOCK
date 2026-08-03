"""
Sony LIV Batch Synopses Scraper
Scrapes the exact Sony LIV episode list page with full synopses as shown in user screenshot.
"""

import urllib.request
import json
import re
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

def scrape_sonyliv_batches():
    scratch_dir = os.path.join(os.path.dirname(__file__), 'scratch')
    os.makedirs(scratch_dir, exist_ok=True)
    out_file = os.path.join(scratch_dir, 'sonyliv_real_synopses.json')

    print("Fetching official Sony LIV page payload...")
    url = 'https://www.sonyliv.com/shows/taarak-mehta-ka-ooltah-chashmah-1700000082'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }

    req = urllib.request.Request(url, headers=headers)
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        print(f"Page size: {len(html)} bytes")

        # Parse JSON state payload
        match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        if match:
            data = json.loads(match.group(1))
            episodes = []

            # Traverse JSON to find episode cards with titles and descriptions
            def extract_cards(obj):
                if isinstance(obj, dict):
                    t = obj.get('title', '')
                    d = obj.get('description', '') or obj.get('summary', '') or obj.get('synopsis', '')
                    ep_num = obj.get('episodeNumber')
                    
                    if ('E1.' in t or 'E2.' in t or 'E3.' in t or ep_num or 'Taarak Mehta' in t) and d and len(d) > 30:
                        episodes.append({
                            'title': t,
                            'episodeNumber': ep_num,
                            'description': d
                        })
                    for k, v in obj.items():
                        extract_cards(v)
                elif isinstance(obj, list):
                    for item in obj:
                        extract_cards(item)

            extract_cards(data)
            print(f"Extracted {len(episodes)} episode cards with rich synopses!")

            if episodes:
                with open(out_file, 'w', encoding='utf-8') as f:
                    json.dump(episodes, f, indent=2)
                print(f"Saved to {out_file}!")
                print("Sample Episode 1 Synopsis:", episodes[0]['description'])
                return episodes

    except Exception as e:
        print(f"Error scraping Sony LIV batches: {e}")

if __name__ == '__main__':
    scrape_sonyliv_batches()
