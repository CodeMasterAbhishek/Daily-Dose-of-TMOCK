import csv
import re
from collections import defaultdict

def check_anomalies():
    with open('data/episodes.csv', 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
        
    print(f"Total Rows: {len(rows)}")
    print(f"Header: {header}")
    
    anomalies = defaultdict(list)
    
    prev_ep = 0
    
    for row in rows:
        # Ensure row has 6 columns
        if len(row) < 6:
            row.extend([""] * (6 - len(row)))
            
        ep_str, title, url, status, date, duration = row[:6]
        
        # 1. Episode Number Check
        try:
            ep = int(ep_str)
            if ep <= prev_ep:
                anomalies['Out of order Episode'].append(f"Row Ep: {ep} comes after {prev_ep}")
            prev_ep = ep
        except ValueError:
            anomalies['Non-integer Episode'].append(ep_str)
            
        # 2. Title Check
        if not title.strip():
            anomalies['Empty Title'].append(f"Episode {ep_str}")
            
        # 3. URL Check
        if status == 'Found':
            if not url.startswith('https://www.youtube.com/watch?v='):
                anomalies['Invalid URL'].append(f"Episode {ep_str}: {url}")
        
        # 4. Status Check
        if status not in ['Found', 'Missing', 'Unavailable']:
            anomalies['Unknown Status'].append(f"Episode {ep_str}: '{status}'")
            
        # 5. Duration Check
        if status == 'Found':
            if not re.match(r'^(\d+:)?\d{1,2}:\d{2}$', duration.strip()):
                anomalies['Invalid Duration Format'].append(f"Episode {ep_str}: '{duration}'")
                
    if not anomalies:
        print("No anomalies found! All data looks clean and correctly formatted.")
    else:
        print("\n--- ANOMALIES FOUND ---")
        for category, items in anomalies.items():
            print(f"\n{category} ({len(items)} issues):")
            for item in items[:10]: # Print up to 10
                print(f"  - {item}")
            if len(items) > 10:
                print(f"  ... and {len(items) - 10} more.")

if __name__ == "__main__":
    check_anomalies()
