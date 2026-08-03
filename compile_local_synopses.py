"""
Local Offline Episode Synopsis Compiler & LLM Prompt Generator
Scrapes local episode titles and official descriptions into scratch/local_episodes_synopsis.json,
and generates scratch/llm_storyline_prompt.txt ready to feed into ChatGPT/Gemini for offline storyline hardcoding.
"""

import csv
import json
import os

def compile_local_synopses():
    scratch_dir = os.path.join(os.path.dirname(__file__), 'scratch')
    os.makedirs(scratch_dir, exist_ok=True)

    episodes = []
    with open('episodes.csv', 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for row in reader:
            if not row or len(row) < 2:
                continue
            ep_num = int(row[0])
            title = row[1]
            url = row[2] if len(row) > 2 else ''
            episodes.append({
                'epNumber': ep_num,
                'title': title,
                'url': url
            })

    episodes.sort(key=lambda x: x['epNumber'])

    synopsis_file = os.path.join(scratch_dir, 'local_episodes_synopsis.json')
    with open(synopsis_file, 'w', encoding='utf-8') as f:
        json.dump(episodes, f, indent=2)

    print(f"Saved {len(episodes)} local episode records to {synopsis_file}!")

    # Generate offline LLM prompt template
    prompt_file = os.path.join(scratch_dir, 'llm_storyline_prompt.txt')
    with open(prompt_file, 'w', encoding='utf-8') as f:
        f.write(
"""================================================================================
OFFLINE LLM STORYLINE MINING PROMPT (Copy-Paste to ChatGPT / Gemini / Claude)
================================================================================

PROMPT:
--------------------------------------------------------------------------------
You are an expert content curator for Taarak Mehta Ka Ooltah Chashmah (TMKOC).
Below is a JSON list of TMKOC episode titles and numbers.

TASK:
1. Identify all distinct multi-episode storyline arcs (arcs that span 3 or more contiguous episodes, e.g., Water Crisis, Bhootni Arc, GPL Season 1, Gulabo Lawsuit, Jethalal in Pakistan, Bapuji Hiccups, etc.).
2. For each storyline arc, extract:
   - "id": a unique string key (e.g., "arc_water_crisis")
   - "sortOrder": integer order (1, 2, 3...)
   - "title": human-readable title of the arc
   - "tagline": catchy sub-headline
   - "description": 2-sentence summary of the story arc
   - "startEp": exact starting episode number
   - "endEp": exact ending episode number
   - "totalEpisodes": count of episodes in the arc
   - "category": "Classic" (1-500), "Golden" (501-1500), "Modern" (1501-3000), or "Recent" (3001+)
   - "coverEp": starting episode number to use as cover thumbnail

3. Format your response strictly as a JSON array matching storylines.json so it can be hardcoded directly into the static website repository.

================================================================================
"""
        )

    print(f"Generated offline LLM prompt template in {prompt_file}!")

if __name__ == '__main__':
    compile_local_synopses()
