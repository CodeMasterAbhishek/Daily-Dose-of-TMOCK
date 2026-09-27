import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'scripts'))
from update_website import get_video_score

videos = [
    {"vid_id": "V_SHORT", "title": "NEW Episode 4823 - Did Baba steal...", "duration": "10:02", "channel": "Taarak Mehta Ka Ooltah Chashmah", "mins": 10},
    {"vid_id": "V_TEASER", "title": "NEW! Taarak Mehta Ka Ooltah Chashmah | Ep 4823 | 23 Sept 2026 | Teaser", "duration": "10:24", "channel": "Sony SAB", "mins": 10},
    {"vid_id": "V_FULL", "title": "The Missing Mannequin | Taarak Mehta Ka Ooltah Chashmah | Full Ep 4823 | 23 Sep 2026 | New Episode", "duration": "21:51", "channel": "Sony SAB", "mins": 21},
]

best_match = None
best_score = -1
best_mins = -1
fallback_url = ""
short_url = ""

for v in videos:
    score = get_video_score(v["mins"], v["channel"])
    url = f"https://youtube.com/watch?v={v['vid_id']}"
    
    if score > best_score:
        if best_match and best_match[2] != url:
            if best_mins >= 15:
                fallback_url = best_match[2]
            elif best_mins >= 8 and not short_url:
                short_url = best_match[2]
        best_score = score
        best_mins = v["mins"]
        best_match = (v["vid_id"], v["title"], url, "Date", v["duration"], v["channel"])
    elif best_match and url != best_match[2]:
        if not fallback_url and v["mins"] >= 15:
            fallback_url = url
        elif not short_url and 8 <= v["mins"] < 15:
            short_url = url

print(f"Main: {best_match[2] if best_match else None}")
print(f"Fallback: {fallback_url}")
print(f"Short: {short_url}")
