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
        if not desc or desc.startswith("Watch full single episode") or desc.startswith("Special Event"):
            missing.append(int(ep_key))
    return sorted(missing)

def try_enrich(obj, db, missing_set):
    """Recursively search a JSON object for episode data and enrich the DB."""
    count = 0
    if isinstance(obj, dict):
        if "episodeNumber" in obj and ("title" in obj or "name" in obj) and "duration" in obj:
            ep_num = int(obj.get("episodeNumber", 0))
            ep_key = str(ep_num)
            if ep_num in missing_set and ep_key in db:
                desc = obj.get("longDescription") or obj.get("description", "")
                duration = obj.get("duration", 0)
                if desc or duration:
                    if desc:
                        db[ep_key]["description"] = desc
                    if duration and int(duration) > 0:
                        db[ep_key]["durationSeconds"] = int(duration)
                    missing_set.discard(ep_num)
                    count += 1
                    short_desc = (desc[:55] + "...") if desc and len(desc) > 55 else desc
                    print(f"  ✅ Enriched Ep {ep_num}: {short_desc}")
        for v in obj.values():
            count += try_enrich(v, db, missing_set)
    elif isinstance(obj, list):
        for item in obj:
            count += try_enrich(item, db, missing_set)
    return count

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
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        # Intercept XHR/fetch responses (catches episodes loaded by scrolling)
        def handle_response(response):
            nonlocal enriched_count
            if "sonyliv.com" not in response.url:
                return
            if response.request.resource_type not in ["fetch", "xhr"]:
                return
            try:
                data = response.json()
                enriched_count += try_enrich(data, db, missing_set)
                if enriched_count > 0:
                
    save_db(db)

    # AUTO-PUSH TO GITHUB
    import subprocess
    if enriched_count > 0:
        print('Pushing new SonyLIV data to GitHub...')
        try:
            subprocess.run(['git', 'add', 'data/episodes.json'], check=True)
            subprocess.run(['git', 'commit', '-m', f'Auto-enrich: Added SonyLIV metadata for {enriched_count} missing episodes'], check=True)
            subprocess.run(['git', 'push', 'origin', 'main'], check=True)
            print('Successfully pushed to GitHub!')
        except Exception as e:
            print(f"Failed to push to GitHub: {e}")
    else:
        print('No new data to push.')

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

            # PHASE 1: Extract __NEXT_DATA__ from the initial page HTML
            # SonyLIV is a Next.js app — the first batch of episodes is embedded
            # in a <script id="__NEXT_DATA__"> tag, not sent as XHR.
            before = enriched_count
            try:
                next_data = page.evaluate("""() => {
                    const el = document.getElementById('__NEXT_DATA__');
                    if (el) return JSON.parse(el.textContent);
                    return null;
                }""")
                if next_data:
                    enriched_count += try_enrich(next_data, db, missing_set)
                    if enriched_count > before:
                    
    save_db(db)

    # AUTO-PUSH TO GITHUB
    import subprocess
    if enriched_count > 0:
        print('Pushing new SonyLIV data to GitHub...')
        try:
            subprocess.run(['git', 'add', 'data/episodes.json'], check=True)
            subprocess.run(['git', 'commit', '-m', f'Auto-enrich: Added SonyLIV metadata for {enriched_count} missing episodes'], check=True)
            subprocess.run(['git', 'push', 'origin', 'main'], check=True)
            print('Successfully pushed to GitHub!')
        except Exception as e:
            print(f"Failed to push to GitHub: {e}")
    else:
        print('No new data to push.')

                        print(f"  Extracted {enriched_count - before} episodes from initial page data")
            except Exception as e:
                print(f"  Could not extract __NEXT_DATA__: {e}")

            # Figure out exactly which episodes we are still missing on THIS specific page
            chunk_missing = {ep for ep in missing_set if chunk_start <= ep <= chunk_end}
            if not chunk_missing:
                print("  All missing episodes for this page found instantly. Moving to next page.")
                continue

            # PHASE 2: Scroll to trigger lazy-loaded XHR responses for remaining episodes
            stuck = 0
            last_count = enriched_count
            while chunk_missing:
                for _ in range(3):
                    page.keyboard.press("End")
                    time.sleep(1)
                time.sleep(2)

                for selector in ["text=View More", "text=Load More", "text=VIEW MORE", "text=LOAD MORE"]:
                    try:
                        btn = page.locator(selector).first
                        if btn.is_visible(timeout=500):
                            btn.click()
                            time.sleep(2)
                    except:
                        pass

                # Update our list of what's still missing on this page
                chunk_missing = {ep for ep in missing_set if chunk_start <= ep <= chunk_end}

                if enriched_count > last_count:
                    last_count = enriched_count
                    stuck = 0
                else:
                    stuck += 1

                if stuck > 8:
                    break

        browser.close()


    save_db(db)

    # AUTO-PUSH TO GITHUB
    import subprocess
    if enriched_count > 0:
        print('Pushing new SonyLIV data to GitHub...')
        try:
            subprocess.run(['git', 'add', 'data/episodes.json'], check=True)
            subprocess.run(['git', 'commit', '-m', f'Auto-enrich: Added SonyLIV metadata for {enriched_count} missing episodes'], check=True)
            subprocess.run(['git', 'push', 'origin', 'main'], check=True)
            print('Successfully pushed to GitHub!')
        except Exception as e:
            print(f"Failed to push to GitHub: {e}")
    else:
        print('No new data to push.')


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
