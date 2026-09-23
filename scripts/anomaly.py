import csv
import sys
if sys.platform == 'win32':
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass

from config import CSV_FILE
from utils import get_minutes

short_eps = []
long_eps = []

try:
    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if len(row) >= 6:
                ep_num = row[0]
                duration_str = row[5]
                mins = get_minutes(duration_str)
                if mins < 15:
                    short_eps.append((ep_num, duration_str, row[1]))
                elif mins > 35:
                    long_eps.append((ep_num, duration_str, row[1]))
except FileNotFoundError:
    print(f"Could not find {CSV_FILE}")
    exit(1)

print("=== SHORT EPISODES (< 15 mins) ===")
for ep in short_eps[:20]:
    print(f"Ep {ep[0]}: {ep[1]} - {ep[2]}")
if len(short_eps) > 20:
    print(f"... and {len(short_eps) - 20} more.")
print(f"Total Short: {len(short_eps)}\n")

print("=== LONG EPISODES (> 35 mins) ===")
for ep in long_eps[:20]:
    print(f"Ep {ep[0]}: {ep[1]} - {ep[2]}")
if len(long_eps) > 20:
    print(f"... and {len(long_eps) - 20} more.")
print(f"Total Long: {len(long_eps)}\n")
