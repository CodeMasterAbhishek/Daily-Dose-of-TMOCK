import csv

def get_minutes(duration_str):
    parts = duration_str.split(':')
    if len(parts) == 3:
        return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 2:
        return int(parts[0])
    return 0

short_eps = []
long_eps = []

try:
    with open('data/episodes.csv', 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
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
    print("Could not find data/episodes.csv")
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
