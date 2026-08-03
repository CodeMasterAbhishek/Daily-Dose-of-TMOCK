"""
Sony LIV Official TMKOC Episode & Synopsis Scraper
Fetches official episode titles, detailed synopses, air dates, and thumbnails directly from Sony LIV.
Generates sony_liv_synopses.json ready for LLM arc discovery.
"""

import urllib.request
import json
import re
import os

def fetch_sony_liv_metadata():
    url = 'https://www.sonyliv.com/shows/taarak-mehta-ka-ooltah-chashmah-1700000082'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
    }
    req = urllib.request.Request(url, headers=headers)
    
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        json_matches = re.findall(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        
        synopses = []
        
        if json_matches:
            data = json.loads(json_matches[0])
            print("Successfully extracted Sony LIV Next.js metadata payload!")
            
            # Recursively search for episode containers and description strings
            def search_containers(obj):
                if isinstance(obj, dict):
                    if 'episodeNumber' in obj or 'title' in obj:
                        title = obj.get('title', '')
                        desc = obj.get('description', '') or obj.get('synopsis', '') or obj.get('summary', '')
                        ep_num = obj.get('episodeNumber')
                        
                        if title and desc:
                            synopses.append({
                                'epNumber': ep_num,
                                'title': title,
                                'synopsis': desc,
                                'airDate': obj.get('broadcastDate', ''),
                                'image': obj.get('thumbnail', '')
                            })
                    for key, val in obj.items():
                        search_containers(val)
                elif isinstance(obj, list):
                    for item in obj:
                        search_containers(item)

            search_containers(data)
            
        print(f"Extracted {len(synopses)} episode synopses from Sony LIV payload.")
        
        # Save to sony_liv_synopses.json
        output_file = 'sony_liv_synopses.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(synopses, f, indent=2)
            
        print(f"Saved dataset to {output_file}!")
        return synopses

    except Exception as e:
        print(f"Error fetching Sony LIV metadata: {e}")
        return []

if __name__ == '__main__':
    fetch_sony_liv_metadata()
