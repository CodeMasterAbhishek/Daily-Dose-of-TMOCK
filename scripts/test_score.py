import sys
sys.path.append(r'e:\GitHub projects\TMOCK\scripts')
from update_website import *
import scrapetube

def get_video_score(mins: int, channel: str) -> int:
    channel_lower = channel.lower()
    c_score = 0
    if channel_lower == 'sony sab':
        c_score = 100
    elif 'taarak mehta ka ooltah chashmah' in channel_lower:
        c_score = 80
    elif channel_lower == 'sony pal':
        c_score = 20
        
    is_full = 1000 if mins >= 15 else 0
    is_double = 1000 if mins >= 35 else 0
    
    return is_full + is_double + c_score * 10 + mins

def test_find_episode(ep_num: int):
    search_queries = [
        f"Ep {ep_num} Taarak Mehta Ka Ooltah Chashmah",
        f"Taarak Mehta Ka Ooltah Chashmah Episode {ep_num}",
        f"Taarak Mehta Ka Ooltah Chashmah एपिसोड {ep_num}",
        f"TMKOC Episode {ep_num} Full Episode",
    ]

    best_match = None
    best_score = -1
    best_mins = -1
    fallback_url = ""
    short_url = ""

    for query in search_queries:
        try:
            videos = scrapetube.get_search(query, limit=10)
            for vid in videos:
                title_runs = vid.get('title', {}).get('runs', [])
                title = "".join([r.get('text', '') for r in title_runs]).strip()
                vid_id = vid.get('videoId', '')
                channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '')
                description = extract_description_text(vid)

                if vid_id and is_single_episode(title, description, channel, ep_num):
                    url = f"https://www.youtube.com/watch?v={vid_id}"
                    time_text = vid.get('publishedTimeText', {}).get('simpleText', '')
                    date_str = parse_relative_date(time_text)
                    duration_str = vid.get('lengthText', {}).get('simpleText', '21:45')
                    
                    mins = get_minutes(duration_str)
                    if mins > 55:
                        continue
                        
                    score = get_video_score(mins, channel)
                    print(f"Found: {title} | {channel} | {duration_str} | Score: {score}")
                        
                    if score > best_score:
                        if best_match and best_match[2] != url:
                            if best_mins >= 15:
                                fallback_url = best_match[2]
                            elif best_mins >= 8 and not short_url:
                                short_url = best_match[2]
                        best_score = score
                        best_mins = mins
                        best_match = (vid_id, title, url, date_str, duration_str, score, channel)
                    elif best_match and url != best_match[2]:
                        if not fallback_url and mins >= 15:
                            fallback_url = url
                        elif not short_url and 8 <= mins < 15:
                            short_url = url
        except Exception as e:
            print("Error:", e)
            continue
            
    if best_match:
        print(f"\nWINNER: {best_match[1]} | {best_match[6]} | {best_match[4]} | Score: {best_match[5]}")
    else:
        print("Not found")

test_find_episode(1968)
