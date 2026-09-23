import urllib.request
import re

def check_embed(url):
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        html = urllib.request.urlopen(req).read().decode('utf-8')
        channel_match = re.search(r'"ownerChannelName":"([^"]+)"', html)
        channel = channel_match.group(1) if channel_match else 'Unknown'
        print(f'{url} -> Channel: {channel}')
    except Exception as e:
        print('Error:', e)

check_embed('https://www.youtube.com/watch?v=FPet7LBlQ2g')
check_embed('https://www.youtube.com/watch?v=oTMKlDx_ZO8')
