import urllib.request
import json
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

urls = ['WGlcKgAxjB4', '6JPGPTKlQU8', 'PykbMfov7fc']
for vid in urls:
    try:
        url = f'https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v={vid}&format=json'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        res = urllib.request.urlopen(req).read()
        data = json.loads(res.decode('utf-8'))
        print(f'{vid}: {data.get("title")} by {data.get("author_name")}')
    except Exception as e:
        print(f'{vid}: Error - {e}')
