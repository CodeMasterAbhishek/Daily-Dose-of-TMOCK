import re
import os

with open('scripts/enrich_from_sonyliv.py', 'r', encoding='utf-8') as f:
    content = f.read()

# We want to replace the last save_db(db) and print statements with our logging logic
# The original end of main() looks like:
"""
    save_db(db)

    remaining = len(missing_set)
    print("\\n==================================================")
    print(f"  Enrichment Complete!")
    print(f"  Episodes enriched: {enriched_count}")
    if remaining > 0:
        print(f"  Still missing: {remaining} (SonyLIV may have removed them)")
    else:
        print(f"  All episodes now have full SonyLIV data!")
    print("==================================================")

if __name__ == "__main__":
"""

new_end = """
    save_db(db)

    remaining = len(missing_set)
    print("\\n==================================================")
    print(f"  Enrichment Complete!")
    print(f"  Episodes enriched: {enriched_count}")
    if remaining > 0:
        print(f"  Still missing: {remaining} (SonyLIV may have removed them)")
    else:
        print(f"  All episodes now have full SonyLIV data!")
    print("==================================================")

    # AUTO-PUSH TO GITHUB AND LOGGING
    import subprocess
    from datetime import datetime
    import os

    # 1. Create/Update the log file
    log_path = 'data/scraper_log.md'
    now = datetime.now().strftime('%Y-%m-%d %I:%M %p')
    log_entry = f'- **{now}**: Scraper ran successfully. Enriched: **{enriched_count}**. Still Missing: **{remaining}**.\\n'
    
    existing_logs = []
    if os.path.exists(log_path):
        with open(log_path, 'r', encoding='utf-8') as lf:
            existing_logs = lf.readlines()
            if existing_logs and existing_logs[0].startswith('# '):
                existing_logs = existing_logs[2:] # skip title and blank line
    
    existing_logs.insert(0, log_entry)
    existing_logs = existing_logs[:50]
    
    with open(log_path, 'w', encoding='utf-8') as lf:
        lf.write('# SonyLIV Scraper Activity Log\\n\\n')
        lf.writelines(existing_logs)

    # 2. Push to GitHub
    print('Pushing logs and data to GitHub...')
    try:
        subprocess.run(['git', 'add', 'data/episodes.json', 'data/scraper_log.md'], check=True)
        commit_msg = 'chore: Daily SonyLIV Scraper Log (No new episodes)'
        if enriched_count > 0:
            commit_msg = f'Auto-enrich: Added SonyLIV metadata for {enriched_count} missing episodes'
        subprocess.run(['git', 'commit', '-m', commit_msg], check=True)
        subprocess.run(['git', 'push', 'origin', 'main'], check=True)
        print('Successfully pushed to GitHub!')
    except Exception as e:
        print(f"Failed to push to GitHub: {e}")

if __name__ == "__main__":
"""

# Replace the specific block
content = content.replace(
    '    save_db(db)\n\n    remaining = len(missing_set)\n    print("\\n==================================================")\n    print(f"  Enrichment Complete!")\n    print(f"  Episodes enriched: {enriched_count}")\n    if remaining > 0:\n        print(f"  Still missing: {remaining} (SonyLIV may have removed them)")\n    else:\n        print(f"  All episodes now have full SonyLIV data!")\n    print("==================================================")\n\nif __name__ == "__main__":',
    new_end.strip('\n')
)

with open('scripts/enrich_from_sonyliv.py', 'w', encoding='utf-8') as f:
    f.write(content)
