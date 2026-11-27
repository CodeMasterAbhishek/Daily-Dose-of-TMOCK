"""
Fetch current total registered users from Supabase and write to gitignored total_users.txt.
Can be run standalone or imported by sync scripts.
"""
import os
import urllib.request
import datetime

SUPABASE_URL = "https://rxubsmawvuigofveqyza.supabase.co"
SUPABASE_ANON_KEY = "sb_publishable_xbOMi4flq-JXLJNzkkoypA_ADaz12T0"
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(BASE_DIR, "total_users.txt")

def update_total_users_file():
    try:
        url = f"{SUPABASE_URL}/rest/v1/leaderboard?select=user_id&limit=1"
        req = urllib.request.Request(
            url,
            headers={
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                "Prefer": "count=exact"
            }
        )
        with urllib.request.urlopen(req, timeout=10) as res:
            content_range = res.headers.get("Content-Range")
            if content_range and "/" in content_range:
                total_users = int(content_range.split("/")[1])
                now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                content = f"Total Users: {total_users}\nLast Updated: {now_str}\n"
                with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                    f.write(content)
                print(f"[OK] Total Users: {total_users} written to {OUTPUT_FILE}")
                return total_users
    except Exception as e:
        print(f"[WARN] Failed to fetch total users from Supabase: {e}")
        return None

if __name__ == "__main__":
    update_total_users_file()
