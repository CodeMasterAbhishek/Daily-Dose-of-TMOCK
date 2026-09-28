import os
import json
import time
from playwright.sync_api import sync_playwright

DB_FILE = os.path.join("data", "sonyliv_episodes.json")

def save_data(data_dict):
    """Safely write the scraped data to JSON."""
    tmp_file = DB_FILE + ".tmp"
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(data_dict, f, indent=4, ensure_ascii=False)
    os.replace(tmp_file, DB_FILE)

def main():
    print("==================================================")
    print("  SonyLIV TMKOC Ground Truth Scraper")
    print("==================================================")
    
    # Load existing data to allow resuming
    db = {}
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                db = json.load(f)
            print(f"Loaded {len(db)} existing episodes from database.")
        except Exception as e:
            print(f"Error loading DB: {e}")
    else:
        print("Starting a fresh database.")

    with sync_playwright() as p:
        print("\nLaunching browser... (Please do not close it)")
        # Run HEADED so it bypasses CloudFront / Bot Protection easily
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        # We will intercept API responses
        def handle_response(response):
            # SonyLIV APIs usually have 'apiv2.sonyliv.com'
            if "sonyliv.com" in response.url:
                try:
                    # Only process JSON responses
                    if response.request.resource_type in ["fetch", "xhr"]:
                        data = response.json()
                        
                        # SonyLIV usually wraps episodes in 'resultObj' or 'containers'
                        # We recursively search the JSON payload for episode structures
                        def extract_episodes(obj):
                            if isinstance(obj, dict):
                                # Look for typical SonyLIV episode keys
                                if "episodeNumber" in obj and "title" in obj and "duration" in obj:
                                    ep_num = str(obj.get("episodeNumber"))
                                    db[ep_num] = {
                                        "episodeNumber": ep_num,
                                        "title": obj.get("title", ""),
                                        "description": obj.get("longDescription") or obj.get("description", ""),
                                        "duration_seconds": obj.get("duration"),
                                        # Save the ENTIRE raw payload just in case!
                                        "raw_data": obj
                                    }
                                    print(f"  -> Captured Ep {ep_num}: {db[ep_num]['title']} ({db[ep_num]['duration_seconds']}s)")
                                for k, v in obj.items():
                                    extract_episodes(v)
                            elif isinstance(obj, list):
                                for item in obj:
                                    extract_episodes(item)

                        start_len = len(db)
                        extract_episodes(data)
                        if len(db) > start_len:
                            # Save immediately if we found new episodes (Power cut protection)
                            save_data(db)
                            
                except Exception:
                    pass

        page.on("response", handle_response)

        # The URL for TMKOC
        url = "https://www.sonyliv.com/shows/taarak-mehta-ka-ooltah-chashmah-1700000084"
        print(f"\nNavigating to {url}")
        
        try:
            page.goto(url, timeout=60000)
            print("Page loaded successfully.")
            
            # Wait for user to bypass any initial popups or let React load
            time.sleep(5)
            
            print("\n*** ULTRA-STABLE AUTO-SCROLLING INITIATED ***")
            print("Using direct URL navigation for each 100-episode chunk!")
            
            # Based on the screenshot, ranges go from 4801-4900 down to 1-100
            # We will generate these URLs mathematically to avoid React UI glitches.
            ranges = []
            for end_ep in range(4900, 99, -100):
                start_ep = end_ep - 99
                ranges.append(f"{start_ep}-{end_ep}")
            
            for range_str in ranges:
                chunk_url = f"{url}/episodes/{range_str}"
                print(f"\n---> Navigating to chunk: {range_str}")
                
                try:
                    page.goto(chunk_url, timeout=60000)
                    time.sleep(4) # Wait for network load
                except Exception as e:
                    print(f"Could not navigate to {chunk_url}: {e}")
                    continue
                
                print("  Scrolling down this section...")
                stuck_counter = 0
                last_db_size = len(db)
                
                # Scroll loop for THIS specific chunk
                while True:
                    page.keyboard.press("End")
                    time.sleep(1.5)
                    
                    try:
                        view_more = page.locator("text=View More").first
                        if view_more.is_visible():
                            view_more.click()
                            time.sleep(2)
                    except:
                        pass

                    if len(db) > last_db_size:
                        last_db_size = len(db)
                        stuck_counter = 0
                    else:
                        stuck_counter += 1
                    
                    # If we don't find new episodes for a few scrolls, we hit the bottom of this 100-ep chunk
                    if stuck_counter > 5:
                        print(f"  Reached bottom of {range_str} chunk.")
                        break

            print("\n==================================================")
            print(f"  SUCCESS! Extracted a total of {len(db)} episodes.")
            print("  Data saved to data/sonyliv_episodes.json")
            print("==================================================")

        except Exception as e:
            print(f"\nAn error occurred (Browser closed or connection lost): {e}")
            print("Don't worry, all extracted episodes up to this point have been safely saved!")
        finally:
            browser.close()

if __name__ == "__main__":
    main()
