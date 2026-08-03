import csv
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

CSV_FILE = "episodes.csv"

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass


def get_video_duration_seconds(video_id: str) -> int | None:
    url = f"https://www.youtube.com/watch?v={video_id}"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, timeout=4) as response:
            html = response.read().decode("utf-8", errors="ignore")
            
            match = re.search(r'"approxDurationMs":"(\d+)"', html)
            if match:
                return int(match.group(1)) // 1000
                
            match_sec = re.search(r'"lengthSeconds":"(\d+)"', html)
            if match_sec:
                return int(match_sec.group(1))
    except Exception:
        pass
    return None


def format_time(seconds: int) -> str:
    mins = seconds // 60
    secs = seconds % 60
    return f"{mins}m {secs}s"


def main():
    print("=======================================================")
    print("  TMKOC Dataset Duration Analysis Tool")
    print("=======================================================")

    episodes = []
    with open(CSV_FILE, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            url = r.get("URL", "")
            match = re.search(r"v=([a-zA-Z0-9_-]{11})", url)
            if match:
                episodes.append({
                    "ep": int(r["Episode"]),
                    "title": r["Title"],
                    "url": url,
                    "vid_id": match.group(1)
                })

    total = len(episodes)
    print(f"Loaded {total} episodes from {CSV_FILE}.")
    print("Fetching video durations using 32 concurrent worker threads...\n")

    results = []
    durations = []

    with ThreadPoolExecutor(max_workers=32) as executor:
        future_to_ep = {
            executor.submit(get_video_duration_seconds, item["vid_id"]): item
            for item in episodes
        }

        completed = 0
        for future in as_completed(future_to_ep):
            item = future_to_ep[future]
            completed += 1
            dur_sec = future.result()

            if dur_sec:
                durations.append(dur_sec)
                results.append({
                    "ep": item["ep"],
                    "title": item["title"],
                    "url": item["url"],
                    "duration_sec": dur_sec
                })

            if completed % 500 == 0 or completed == total:
                print(f"Progress: {completed}/{total} videos analyzed...")

    if not durations:
        print("No durations could be fetched.")
        return

    min_dur = min(durations)
    max_dur = max(durations)
    avg_dur = sum(durations) // len(durations)

    min_item = min(results, key=lambda x: x["duration_sec"])
    max_item = max(results, key=lambda x: x["duration_sec"])

    under_10m = [x for x in results if x["duration_sec"] < 600]
    between_10_18m = [x for x in results if 600 <= x["duration_sec"] < 1080]
    between_18_25m = [x for x in results if 1080 <= x["duration_sec"] <= 1500]
    over_25m = [x for x in results if x["duration_sec"] > 1500]

    print("\n=======================================================")
    print("               DURATION ANALYSIS RESULTS               ")
    print("=======================================================")
    print(f"Total Videos Analyzed: {len(durations)} / {total}")
    print(f"Lowest Duration  : {format_time(min_dur)} (Ep {min_item['ep']}: {min_item['title'][:40]}...)")
    print(f"Highest Duration : {format_time(max_dur)} (Ep {max_item['ep']}: {max_item['title'][:40]}...)")
    print(f"Average Duration : {format_time(avg_dur)}")
    print("-------------------------------------------------------")
    print("Distribution Breakdown:")
    print(f"  • Short Snippets (< 10 mins)   : {len(under_10m)} videos ({len(under_10m)/len(results)*100:.1f}%)")
    print(f"  • Mid Clips (10 - 18 mins)     : {len(between_10_18m)} videos ({len(between_10_18m)/len(results)*100:.1f}%)")
    print(f"  • Standard Full (18 - 25 mins) : {len(between_18_25m)} videos ({len(between_18_25m)/len(results)*100:.1f}%)")
    print(f"  • Extended Specials (> 25 mins): {len(over_25m)} videos ({len(over_25m)/len(results)*100:.1f}%)")
    print("=======================================================\n")

    analysis_data = {
        "total_analyzed": len(results),
        "min_duration_seconds": min_dur,
        "min_duration_formatted": format_time(min_dur),
        "min_episode": min_item,
        "max_duration_seconds": max_dur,
        "max_duration_formatted": format_time(max_dur),
        "max_episode": max_item,
        "average_duration_formatted": format_time(avg_dur),
        "under_10_mins_count": len(under_10m),
        "between_10_18_mins_count": len(between_10_18m),
        "standard_full_18_25_mins_count": len(between_18_25m),
        "extended_over_25_mins_count": len(over_25m),
    }

    with open("duration_analysis.json", "w", encoding="utf-8") as f:
        json.dump(analysis_data, f, indent=2)

    print("Detailed analysis report saved to 'duration_analysis.json'.")


if __name__ == "__main__":
    main()
