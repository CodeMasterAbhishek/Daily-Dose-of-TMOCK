import urllib.request
import json
import re

url = 'https://www.youtube.com/watch?v=ozBvPzCYESM'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    html = urllib.request.urlopen(req).read().decode('utf-8')

    desc_match = re.search(r'"shortDescription":"(.*?)"', html)
    desc = desc_match.group(1).replace('\\n', '\n').replace('\\"', '"') if desc_match else ''
    desc = desc.split('Click here to subscribe')[0].strip()

    dur_match = re.search(r'"lengthSeconds":"(\d+)"', html)
    duration = int(dur_match.group(1)) if dur_match else 3584

    with open('data/episodes.json', 'r', encoding='utf-8') as f:
        db = json.load(f)

    for ep in ['3859', '3860', '3861', '3862']:
        if ep in db:
            db[ep]['yt_main'] = 'ozBvPzCYESM'
            db[ep]['durationSeconds'] = duration
            db[ep]['description'] = desc

    with open('data/episodes.json', 'w', encoding='utf-8') as f:
        json.dump(db, f, separators=(',', ':'), ensure_ascii=False)

    print(f'Successfully injected real data for 3859-3862! Duration: {duration}s')
except Exception as e:
    print(f"Failed: {e}")
