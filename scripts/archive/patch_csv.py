import csv
rows = []
with open('data/episodes.csv', 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    for r in reader:
        if r and r[0] == '4823':
            rows.append(['4823', 'The Missing Mannequin | Taarak Mehta Ka Ooltah Chashmah | Full Ep 4823 | 23 Sep 2026 | New Episode', 'https://www.youtube.com/watch?v=WGlcKgAxjB4', 'Found', '23 Sep 2026', '21:51', '', ''])
        else:
            rows.append(r)

with open('data/episodes.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerows(rows)
