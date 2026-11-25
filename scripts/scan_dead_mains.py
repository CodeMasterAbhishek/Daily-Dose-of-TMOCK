import json
import asyncio
import aiohttp
import sys

sys.stdout.reconfigure(encoding='utf-8')

async def check_video(session, sem, ep_num, vid_id, backups, dead_list):
    if not vid_id:
        dead_list.append((ep_num, "No Main Link", len(backups)))
        return
        
    async with sem:
        url = f'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={vid_id}&format=json'
        try:
            async with session.get(url, timeout=10) as resp:
                if resp.status in (401, 403):
                    dead_list.append((ep_num, "Geo-blocked/Private", len(backups)))
                elif resp.status == 404:
                    dead_list.append((ep_num, "Deleted/Not Found", len(backups)))
                elif resp.status != 200:
                    dead_list.append((ep_num, f"Error {resp.status}", len(backups)))
        except Exception:
            dead_list.append((ep_num, "Network Error", len(backups)))

async def main():
    with open('data/episodes.json', 'r', encoding='utf-8') as f:
        db = json.load(f)
    
    print(f"Scanning {len(db)} main episodes to see how many are dead...")
    
    dead_list = []
    sem = asyncio.Semaphore(150)
    
    connector = aiohttp.TCPConnector(limit=150)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = []
        for ep_num, d in db.items():
            tasks.append(asyncio.create_task(
                check_video(session, sem, ep_num, d.get('yt_main'), d.get('yt_backups', []), dead_list)
            ))
        
        total = len(tasks)
        for i, f in enumerate(asyncio.as_completed(tasks)):
            await f
            if (i + 1) % 1000 == 0:
                print(f"Progress: {i+1}/{total} episodes scanned...")
                
    print("\n===============================")
    print(f" FOUND {len(dead_list)} DEAD EPISODES ")
    print("===============================")
    
    # Sort numerically by episode
    dead_list.sort(key=lambda x: int(x[0]))
    
    no_backups = [x for x in dead_list if x[2] == 0]
    has_backups = [x for x in dead_list if x[2] > 0]
    
    print(f"Total dead yt_main links: {len(dead_list)}")
    print(f"-> Episodes with dead main BUT have backups to fall back on: {len(has_backups)}")
    print(f"-> Episodes completely dead (NO backups): {len(no_backups)}")
    
    if len(no_backups) > 0:
        print("\nHere are the first 50 completely dead ones:")
        for ep, reason, _ in no_backups[:50]:
            print(f"Ep {ep} - {reason}")
            
    # Save the list of dead ones to a file so we can heal them instantly
    with open('data/dead_mains_to_heal.json', 'w') as f:
        json.dump([x[0] for x in no_backups], f)

if __name__ == '__main__':
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
