"""
SonyLIV Enrichment Script (Run locally once a week)
Finds episodes in episodes.json that are missing SonyLIV metadata
(description, exact duration) and fills them in automatically.
Only touches episodes that need enrichment — skips everything else.

Usage: python scripts/enrich_from_sonyliv.py
"""

import os
import json
import time
import math
from playwright.sync_api import sync_playwright

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_FILE = os.path.join(BASE_DIR, "data", "episodes.json")

def load_db():
    with open(DB_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_db(db):
    tmp = DB_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(db, f, separators=(',', ':'), ensure_ascii=False)
    os.replace(tmp, DB_FILE)

def find_missing_episodes(db):
    """Find episodes that have no SonyLIV description (need enrichment)."""
    missing = []
    for ep_key, data in db.items():
        if not ep_key.isdigit():
            continue
        desc = data.get("description", "").strip()
        # If description is empty or is our generic placeholder, it needs enrichment
        if not desc or desc.startswith("Watch full single episode") or desc.startswith("Special Event"):
            missing.append(int(ep_key))
    return sorted(missing)

def main():
    print("==================================================")
    print("  SonyLIV Weekly Enrichment")
    print("==================================================")

    db = load_db()
    missing = find_missing_episodes(db)

    if not missing:
        print("All episodes already have SonyLIV data! Nothing to do.")
        return

    print(f"Found {len(missing)} episodes needing enrichment.")
    print(f"Range: Ep {missing[0]} to Ep {missing[-1]}")

    # Calculate which 100-episode chunks we need to visit
    chunks = set()
    for ep in missing:
        start = ((ep - 1) // 100) * 100 + 1
        end = start + 99
        chunks.add((start, end))
    chunks = sorted(chunks, reverse=True)

    print(f"Will visit {len(chunks)} SonyLIV page(s): {[f'{s}-{e}' for s,e in chunks]}")

    enriched_count = 0
    missing_set = set(missing)

    with sync_playwright() as p:
        print("\nLaunching browser...")
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        def handle_response(response):
            nonlocal enriched_count
            if "sonyliv.com" not in response.url:
                return
            if response.request.resource_type not in ["fetch", "xhr"]:
                return
            try:
                data = response.json()
                def extract(obj):
                    nonlocal enriched_count
                    if isinstance(obj, dict):
                        if "episodeNumber" in obj and "title" in obj and "duration" in obj:
                            ep_num = int(obj.get("episodeNumber", 0))
                            ep_key = str(ep_num)
                            if ep_num in missing_set and ep_key in db:
                                desc = obj.get("longDescription") or obj.get("description", "")
                                duration = obj.get("duration", 0)
                                
                                # Only update if we actually got better data
                                if desc or duration:
                                    if desc:
                                        db[ep_key]["description"] = desc
                                    if duration and duration > 0:
                                        db[ep_key]["durationSeconds"] = int(duration)
                                    
                                    enriched_count += 1
                                    missing_set.discard(ep_num)
                                    save_db(db)
                                    print(f"  ✅ Enriched Ep {ep_num}: {desc[:60]}..." if desc else f"  ✅ Enriched Ep {ep_num}: duration={duration}s")
                        for v in obj.values():
                            extract(v)
                    elif isinstance(obj, list):
                        for item in obj:
                            extract(item)
                extract(data)
            except:
                pass

        page.on("response", handle_response)

        base_url = "https://www.sonyliv.com/shows/taarak-mehta-ka-ooltah-chashmah-1700000084"

        for chunk_start, chunk_end in chunks:
            if not missing_set:
                break

            url = f"{base_url}/episodes/{chunk_start}-{chunk_end}"
            print(f"\nNavigating to {url}")
            try:
                page.goto(url, timeout=60000)
                time.sleep(5)
            except Exception as e:
                print(f"  Failed to load: {e}")
                continue

            # Scroll to load all episodes
            stuck = 0
            last_count = enriched_count
            while True:
                page.keyboard.press("End")
                time.sleep(3)

                try:
                    btn = page.locator("text=View More").first
                    if btn.is_visible():
                        btn.click()
                        time.sleep(3)
                except:
                    pass

                if enriched_count > last_count:
                    last_count = enriched_count
                    stuck = 0
                else:
                    stuck += 1

                if stuck > 8:
                    break

        browser.close()

    # Final save
    save_db(db)

    remaining = len(missing_set)
    print("\n==================================================")
    print(f"  Enrichment Complete!")
    print(f"  Episodes enriched: {enriched_count}")
    if remaining > 0:
        print(f"  Still missing: {remaining} (SonyLIV may have removed them)")
    else:
        print(f"  All episodes now have full SonyLIV data!")
    print("==================================================")

if __name__ == "__main__":
    main()
