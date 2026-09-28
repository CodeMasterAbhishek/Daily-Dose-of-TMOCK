import os
import json
import time
import math
from playwright.sync_api import sync_playwright

DB_FILE = os.path.join("data", "sonyliv_episodes.json")

def save_data(data_dict):
    tmp_file = DB_FILE + ".tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(data_dict, f, indent=4, ensure_ascii=False)
    os.replace(tmp_file, DB_FILE)

def main():
    print("==================================================")
    print("  SonyLIV Gap Filler (Missing Episodes)")
    print("==================================================")
    
    if not os.path.exists(DB_FILE):
        print("Database not found!")
        return

    with open(DB_FILE, "r", encoding="utf-8") as f:
        db = json.load(f)
        
    ep_nums = [int(k) for k in db.keys() if k.isdigit()]
    max_ep = max(ep_nums)
    expected = set(range(1, max_ep + 1))
    missing = sorted(list(expected - set(ep_nums)))
    
    if not missing:
        print("No missing episodes! You have a perfect database.")
        return
        
    print(f"Found {len(missing)} missing episodes: {missing}")
    
    # Calculate which 100-episode chunks contain these missing episodes
    chunks_to_visit = set()
    for ep in missing:
        chunk_start = ((ep - 1) // 100) * 100 + 1
        chunk_end = chunk_start + 99
        chunks_to_visit.add(f"{chunk_start}-{chunk_end}")
        
    chunks_to_visit = sorted(list(chunks_to_visit), reverse=True)
    print(f"\nWe need to revisit these chunks to find them: {chunks_to_visit}")
    
    with sync_playwright() as p:
        print("\nLaunching browser...")
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        def handle_response(response):
            if "sonyliv.com" in response.url and response.request.resource_type in ["fetch", "xhr"]:
                try:
                    data = response.json()
                    def extract_episodes(obj):
                        if isinstance(obj, dict):
                            if "episodeNumber" in obj and "title" in obj and "duration" in obj:
                                ep_num = str(obj.get("episodeNumber"))
                                if int(ep_num) in missing and ep_num not in db:
                                    db[ep_num] = {
                                        "episodeNumber": ep_num,
                                        "title": obj.get("title", ""),
                                        "description": obj.get("longDescription") or obj.get("description", ""),
                                        "duration_seconds": obj.get("duration"),
                                        "raw_data": obj
                                    }
                                    print(f"  -> SUCCESS: Rescued Missing Ep {ep_num}: {db[ep_num]['title']}")
                                    save_data(db)
                            for k, v in obj.items():
                                extract_episodes(v)
                        elif isinstance(obj, list):
                            for item in obj:
                                extract_episodes(item)
                    extract_episodes(data)
                except:
                    pass

        page.on("response", handle_response)
        
        base_url = "https://www.sonyliv.com/shows/taarak-mehta-ka-ooltah-chashmah-1700000084"

        for chunk in chunks_to_visit:
            url = f"{base_url}/episodes/{chunk}"
            print(f"\nNavigating to {url}")
            try:
                page.goto(url, timeout=60000)
                time.sleep(5)
            except Exception as e:
                print(f"Failed to load page: {e}")
                continue
                
            print("Scrolling slowly to ensure no network drops...")
            stuck_counter = 0
            last_db_size = len(db)
            
            while True:
                # Scroll slower to prevent network hiccups
                page.keyboard.press("End")
                time.sleep(3) 
                
                try:
                    view_more = page.locator("text=View More").first
                    if view_more.is_visible():
                        view_more.click()
                        time.sleep(3)
                except:
                    pass

                if len(db) > last_db_size:
                    last_db_size = len(db)
                    stuck_counter = 0
                else:
                    stuck_counter += 1
                
                # Give it 8 scrolls with no new data before moving on
                if stuck_counter > 8:
                    print(f"Reached bottom of chunk {chunk}. Moving to next.")
                    break

        print("\n==================================================")
        print("  Gap Filler Finished!")
        
        # Check if any are still missing
        ep_nums_final = [int(k) for k in db.keys() if k.isdigit()]
        missing_final = sorted(list(expected - set(ep_nums_final)))
        if missing_final:
            print(f"  WARNING: {len(missing_final)} episodes are STILL missing.")
            print("  This means SonyLIV has permanently removed them from their servers.")
        else:
            print("  AMAZING! All gaps were filled.")
        print("==================================================")
        browser.close()

if __name__ == "__main__":
    main()
