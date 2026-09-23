import csv
import urllib.request
import re
import random
import time

def check_video(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read().decode('utf-8')
        
        # Check channel
        channel_match = re.search(r'"ownerChannelName":"([^"]+)"', html)
        channel = channel_match.group(1) if channel_match else 'Unknown'
        
        # Check embeddable
        # "playabilityStatus":{"status":"UNPLAYABLE","reason":"Video unavailable","errorScreen":{"playerErrorMessageRenderer":{"subreason":{"simpleText":"Watch on YouTube"}}}}
        # usually means disabled embed if we're hitting it from an embed context, but from regular web page, it might say "status":"OK" but have "isCrawlable":true.
        # Wait, the best way to check embed is to hit the /embed/ page
        
        embed_url = url.replace('watch?v=', 'embed/')
        req_embed = urllib.request.Request(embed_url, headers={'User-Agent': 'Mozilla/5.0'})
        embed_html = urllib.request.urlopen(req_embed).read().decode('utf-8')
        
        embeddable = True
        if 'UNPLAYABLE' in embed_html or 'Video unavailable' in embed_html or 'Watch on YouTube' in embed_html:
            embeddable = False
            
        return channel, embeddable
    except Exception as e:
        return 'Error', False

from scripts.config import CSV_FILE
episodes = []
with open(CSV_FILE, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    next(reader, None)
    for row in reader:
        if len(row) > 2 and 'youtube.com' in row[2]:
            episodes.append(row[2])

print(f"Total episodes: {len(episodes)}")
sample = random.sample(episodes, min(30, len(episodes)))

blocked_count = 0
for url in sample:
    channel, embeddable = check_video(url)
    status = "Allowed" if embeddable else "Blocked"
    if not embeddable: blocked_count += 1
    print(f"{status} | {channel} | {url}")
    time.sleep(0.5)

print(f"\nBlocked in sample: {blocked_count}/{len(sample)}")
