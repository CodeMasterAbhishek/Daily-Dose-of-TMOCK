import json
import asyncio
import aiohttp
import sys

sys.stdout.reconfigure(encoding='utf-8')

async def fetch_channel(session, sem, vid, channels):
    async with sem:
        url = f'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid}&format=json'
        try:
            async with session.get(url, timeout=10) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    author = data.get('author_name', 'Unknown Channel')
                    channels[author] = channels.get(author, 0) + 1
                elif resp.status == 404:
                    channels['[Deleted/Private Video]'] = channels.get('[Deleted/Private Video]', 0) + 1
                elif resp.status in (401, 403):
                    channels['[Geo-blocked/Unavailable]'] = channels.get('[Geo-blocked/Unavailable]', 0) + 1
                else:
                    channels[f'[Error {resp.status}]'] = channels.get(f'[Error {resp.status}]', 0) + 1
        except Exception:
            channels['[Network Error]'] = channels.get('[Network Error]', 0) + 1

async def main():
    with open('data/episodes.json', 'r', encoding='utf-8') as f:
        db = json.load(f)
    
    vids = set()
    for ep, d in db.items():
        if d.get('yt_main'): vids.add(d['yt_main'])
        for v in d.get('yt_backups', []): vids.add(v)
        for v in d.get('yt_shorts', []): vids.add(v)
    
    print(f"Scanning {len(vids)} unique videos using YouTube oEmbed API...")
    
    channels = {}
    sem = asyncio.Semaphore(150)
    
    connector = aiohttp.TCPConnector(limit=150)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = []
        for vid in vids:
            tasks.append(asyncio.create_task(fetch_channel(session, sem, vid, channels)))
        
        total = len(tasks)
        for i, f in enumerate(asyncio.as_completed(tasks)):
            await f
            if (i + 1) % 1000 == 0:
                print(f"Progress: {i+1}/{total} videos scanned...")
                
    print("\n===============================")
    print("        CHANNEL REPORT         ")
    print("===============================")
    sorted_channels = sorted(channels.items(), key=lambda x: x[1], reverse=True)
    for name, count in sorted_channels:
        print(f"{count} videos -> {name}")

if __name__ == '__main__':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
