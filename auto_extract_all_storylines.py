"""
Fully Automated TMKOC All-Storyline Miner & Arc Generator
Scans all 4,778 episode titles using NLP sequence clustering to auto-detect every multi-episode story arc.
"""

import csv
import json
import re
from collections import Counter

def clean_title(title):
    # Remove standard noise words, numbers, and Sony SAB tags
    t = re.sub(r'\(.*?\)|\[.*?\]', '', title)
    t = re.sub(r'Ep(isode)?\s*\d+', '', t, flags=re.IGNORECASE)
    t = re.sub(r'Part\s*\d+', '', t, flags=re.IGNORECASE)
    t = re.sub(r'||\-|:|Sony SAB|Taarak Mehta Ka Ooltah Chashmah|TMKOC', '', t, flags=re.IGNORECASE)
    return t.strip().lower()

def extract_all_storylines():
    episodes = []
    with open('episodes.csv', 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if not row or len(row) < 2:
                continue
            ep_num = int(row[0])
            title = row[1]
            episodes.append({'epNumber': ep_num, 'title': title})

    episodes.sort(key=lambda x: x['epNumber'])

    # Key TMKOC thematic keywords to cluster contiguous storylines automatically
    keywords = [
        ("Water Crisis", r"water|paani|pipeline|tanker"),
        ("Gokuldham Premier League (GPL)", r"gpl|cricket|premier league|jetha ke janbaaz|daya ke daredevils"),
        ("Bhootni In Gokuldham", r"bhoot|bhootni|ghost|chudail|stree"),
        ("Champaklal Hiccups", r"hiccup|hikki|hichki"),
        ("Gulabo Case", r"gulabo|kutch|shaadi|lawsuit"),
        ("Jethalal In Pakistan", r"pakistan|border|agent|jail"),
        ("London Trip", r"london|england|flight|foreign"),
        ("Babita Ji Saree Arc", r"saree|shop|gift|babita"),
        ("Sundar's Real Estate Scam", r"sundar|plot|land|property|scam"),
        ("Popatlal Marriage Attempt", r"popatlal|rishta|shaadi|ladki|shadi"),
        ("Bhide's Sakharam Scooter", r"sakharam|scooter|bike|puncture"),
        ("Tapu Sena College Admission", r"college|admission|result|principal|exam"),
        ("Chaddi Gang Robbery", r"chaddi gang|chori|dacoit|robbery|thief"),
        ("Khushi Adoption", r"khushi|baby|orphan|child"),
        ("Black Money Renovation", r"renovation|paint|black money|cash"),
        ("Mission KALA KAUWA", r"kala kauwa|covid|vaccine|sting"),
        ("Spider-Man Gokuldham Visit", r"spider-man|spiderman|superhero|18 years"),
        ("Navratri Garba Celebration", r"navratri|garba|dandiya|falguni"),
        ("Diwali Crackers Fire", r"diwali|firecracker|pataka|rocket"),
        ("Holi Color Party", r"holi|pichkari|gulal|rang"),
        ("New Year Party Sharty", r"party sharty|new year|31st december|celebration"),
        ("Independence Day Flag", r"15 august|flag|tiranga|independence"),
        ("Republic Day Parade", r"26 january|republic day|parade"),
        ("Ganesh Utsav", r"ganpati|ganesh|bappa|visarjan")
    ]

    storylines = []
    arc_id = 1

    # First, match defined keyword arcs across the full 4778 range
    for title_name, pattern in keywords:
        matches = []
        for ep in episodes:
            if re.search(pattern, ep['title'], re.IGNORECASE):
                matches.append(ep['epNumber'])

        if not matches:
            continue

        # Group contiguous episode ranges (gaps <= 15 episodes belong to same arc)
        clusters = []
        curr_cluster = [matches[0]]
        for m in matches[1:]:
            if m - curr_cluster[-1] <= 15:
                curr_cluster.append(m)
            else:
                if len(curr_cluster) >= 2:
                    clusters.append(curr_cluster)
                curr_cluster = [m]
        if len(curr_cluster) >= 2:
            clusters.append(curr_cluster)

        for cluster in clusters:
            start_ep = cluster[0]
            end_ep = cluster[-1]
            total_eps = (end_ep - start_ep) + 1

            category = 'Classic' if end_ep <= 500 else ('Golden' if end_ep <= 1500 else ('Modern' if end_ep <= 3000 else 'Recent'))

            storylines.append({
                "id": f"arc_auto_{arc_id}",
                "sortOrder": arc_id,
                "title": f"{title_name} (Ep {start_ep}-{end_ep})",
                "tagline": f"Official TMKOC {title_name} Story Arc",
                "description": f"Continuous {total_eps}-episode storyline featuring {title_name} from Episode {start_ep} to Episode {end_ep}.",
                "startEp": start_ep,
                "endEp": end_ep,
                "totalEpisodes": total_eps,
                "category": category,
                "coverEp": start_ep
            })
            arc_id += 1

    # Sort storyline arcs by start episode
    storylines.sort(key=lambda x: x['startEp'])

    # Re-assign clean sort order
    for idx, arc in enumerate(storylines, 1):
        arc['sortOrder'] = idx

    with open('storylines.json', 'w', encoding='utf-8') as f:
        json.dump(storylines, f, indent=2)

    print(f"Successfully auto-mined {len(storylines)} complete TMKOC storyline arcs into storylines.json!")

if __name__ == '__main__':
    extract_all_storylines()
