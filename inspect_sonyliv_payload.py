"""
Inspect Sony LIV Payload for Official Episode Descriptions
"""

import urllib.request
import json
import re

def inspect():
    url = 'https://www.sonyliv.com/shows/taarak-mehta-ka-ooltah-chashmah-1700000082'
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    req = urllib.request.Request(url, headers=headers)
    
    try:
        html = urllib.request.urlopen(req).read().decode('utf-8')
        print(f"Fetched Sony LIV page ({len(html)} bytes)")
        
        # Regex search for description fields in JSON
        matches = re.findall(r'"description":"([^"]+)"', html)
        print(f"Found {len(matches)} description strings in page!")
        
        for idx, m in enumerate(matches[:10], 1):
            if len(m) > 20 and not m.startswith('http'):
                print(f"{idx}. {m[:120]}...")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    inspect()
