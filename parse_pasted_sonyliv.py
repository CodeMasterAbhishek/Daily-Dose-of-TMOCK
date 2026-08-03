"""
Parser for Sony LIV Raw Text Pasted by User
Extracts episode numbers, title, date, duration, and full plot description.
"""

import re
import json
import os

def parse_sonyliv_text(raw_text):
    scratch_dir = os.path.join(os.path.dirname(__file__), 'scratch')
    os.makedirs(scratch_dir, exist_ok=True)
    
    # Save raw paste to scratch file
    raw_file = os.path.join(scratch_dir, 'sonyliv_raw_scraped_text.txt')
    with open(raw_file, 'a', encoding='utf-8') as f:
        f.write("\n=== NEW BATCH PASTED ===\n" + raw_text)

    # Extract episode blocks
    pattern = r'E(\d+)\.\s*([^\n]+)\nE\1\s*•\s*([^\n•]+)\s*•\s*([^\n]+)\n([^\n]+)'
    matches = re.findall(pattern, raw_text)

    parsed_eps = {}
    for ep_str, title, air_date, duration, desc in matches:
        ep_num = int(ep_str)
        if ep_num not in parsed_eps:
            parsed_eps[ep_num] = {
                'epNumber': ep_num,
                'title': title.strip(),
                'airDate': air_date.strip(),
                'duration': duration.strip(),
                'synopsis': desc.strip()
            }

    parsed_list = sorted(parsed_eps.values(), key=lambda x: x['epNumber'])

    print(f"Successfully extracted {len(parsed_list)} Sony LIV episodes!")
    for item in parsed_list:
        print(f"  Ep {item['epNumber']}: {item['title']} -> {item['synopsis'][:80]}...")

    return parsed_list

if __name__ == '__main__':
    sample_text = """
E4778. Celebrating Memories Together
E4778 • 01 Aug 2026 • 24m
Gokuldham relives some of the most memorable moments from Taarak Mehta Ka Ooltah Chashmah, bringing back old memories and special emotions.
E4777. Spider-Man In Gokuldham
E4777 • 31 Jul 2026 • 22m
The residents of Gokuldham Society warmly welcome Spider-Man. His presence fills everyone with joy as he interact with each member.
E4776. Gokuldham Gets A Surprise Guest
E4776 • 30 Jul 2026 • 21m
As Taarak Mehta Ka Ooltah Chashmah celebrates 18 glorious years, everyone shares their heartfelt thoughts. Just then, Asit Modi announces a special guest, leaving everyone excited to find out who it is.
E4775. One More Surprise From Bhide
E4775 • 29 Jul 2026 • 20m
The renovation work is finally complete, and everyone is happy to see the new Gokuldham Society. But Bhide has one more surprise waiting for everyone.
E4774. Veer & Bansari Take Center Stage
E4774 • 28 Jul 2026 • 24m
Champak Chacha entrusts Veer and Bansari with the honor of performing the Mukh Dikhayi ceremony, declaring that they represent the future of Gokuldham Society.
E4773. Bhide’s Surprise For Gokuldham
E4773 • 27 Jul 2026 • 22m
The members of Gokuldham Society are excited about the Muh Dikhayi ceremony and eager to discover Bhide's surprise. What special surprise has Bhide planned?
E4772. Chachaji’s Special Selection
E4772 • 25 Jul 2026 • 22m
Everyone in Gokuldham is curious to know who Chachaji will choose for the Muh Dikhayi ceremony.
E4771. Bhide’s Important Meeting
E4771 • 24 Jul 2026 • 23m
The Mahila Mandal wonders what Bhide is going to say in the meeting, and even Madhvi has no idea. As all the Gokuldham members gather, everyone eagerly waits to see what happens in the meeting.
E4770. Gokuldham Waits For Bhide
E4770 • 23 Jul 2026 • 20m
Bhide stays at his uncle's house due to an unexpected dispute, while Madhvi and Sonu return to Gokuldham. As the renovation work remains pending, everyone in Gokuldham eagerly waits for Bhide to return.
E4769. Popatlal Searches For The Bhide Family
E4769 • 22 Jul 2026 • 21m
Bhide leaves overnight with his family. The next morning, Popatlal finds their house empty and their phones switched off, leaving the Gokuldham family wondering where the Bhide family has gone.
"""
    parse_sonyliv_text(sample_text)
