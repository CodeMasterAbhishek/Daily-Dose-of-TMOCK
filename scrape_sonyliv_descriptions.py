"""
Sony LIV Official Episode Synopsis Scraper
Scrapes official episode descriptions from Sony LIV web pages and API payload.
"""

import urllib.request
import json
import re
import os

def scrape_sonyliv_official():
    scratch_dir = os.path.join(os.path.dirname(__file__), 'scratch')
    os.makedirs(scratch_dir, exist_ok=True)
    out_file = os.path.join(scratch_dir, 'sonyliv_episodes_synopsis.json')

    print("Fetching official Sony LIV metadata page...")
    url = 'https://www.sonyliv.com/shows/taarak-mehta-ka-ooltah-chashmah-1700000082'
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}

    req = urllib.request.Request(url, headers=headers)
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        
        # Extract JSON data from script tags
        matches = re.findall(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        episodes_data = []

        if matches:
            raw_data = json.loads(matches[0])
            
            # Recursive extractor for episode objects
            def extract_eps(obj):
                if isinstance(obj, dict):
                    if 'episodeNumber' in obj or ('title' in obj and 'description' in obj):
                        title = obj.get('title', '')
                        desc = obj.get('description', '') or obj.get('synopsis', '')
                        ep_num = obj.get('episodeNumber')
                        
                        if ep_num or title:
                            episodes_data.append({
                                'epNumber': ep_num,
                                'title': title,
                                'sonyliv_synopsis': desc,
                                'airDate': obj.get('broadcastDate', ''),
                                'sonyliv_url': obj.get('url', '')
                            })
                    for k, v in obj.items():
                        extract_eps(v)
                elif isinstance(obj, list):
                    for item in obj:
                        extract_eps(item)

            extract_eps(raw_data)

        # Merge with local episode numbers
        print(f"Extracted {len(episodes_data)} official episode entries from Sony LIV!")

        # Fallback/Merge with master episodes.csv list
        master_list = []
        with open('episodes.csv', 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            next(reader, None)
            for row in reader:
                if not row or len(row) < 2:
                    continue
                ep_num = int(row[0])
                title = row[1]
                
                # Match with Sony LIV synopsis if found
                matched_desc = title
                for ep in episodes_data:
                    if ep.get('epNumber') == ep_num:
                        matched_desc = ep.get('sonyliv_synopsis') or title
                        break

                master_list.append({
                    'epNumber': ep_num,
                    'title': title,
                    'sonyliv_description': matched_desc
                })

        master_list.sort(key=lambda x: x['epNumber'])

        with open(out_file, 'w', encoding='utf-8') as f:
            json.dump(master_list, f, indent=2)

        print(f"Saved {len(master_list)} official Sony LIV episode descriptions to {out_file}")

    except Exception as e:
        print(f"Error scraping Sony LIV: {e}")

if __name__ == '__main__':
    import csv
    scrape_sonyliv_official()
