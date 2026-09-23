import sys
sys.path.append(r'e:\GitHub projects\TMOCK\scripts')
from update_website import find_episode
from config import CSV_FILE
import csv
import tempfile
import os

res = find_episode(1968)
if res:
    print("Found best match for 1968:", res)
    rows = list(csv.reader(open(CSV_FILE, 'r', encoding='utf-8')))
    new_rows = []
    found = False
    for r in rows:
        if len(r) >= 6 and r[0] == '1968':
            new_rows.append([1968, res[1], res[2], 'Found', res[3] if res[3] else r[4], res[4], res[5], res[6]])
            found = True
        else:
            new_rows.append(r)
    if found:
        f = tempfile.NamedTemporaryFile(mode='w', newline='', encoding='utf-8', delete=False, dir=os.path.dirname(CSV_FILE))
        csv.writer(f).writerows(new_rows)
        f.close()
        os.replace(f.name, CSV_FILE)
        print('Updated EP 1968 in DB!')
    else:
        print('1968 not found in CSV.')
else:
    print('No good episode found.')
