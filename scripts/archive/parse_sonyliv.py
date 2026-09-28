import re
import json

with open(r'C:\Users\perso\.gemini\antigravity\brain\a02060b8-ee26-4005-bd88-e7c9b43a32b7\.system_generated\steps\685\content.md', 'r', encoding='utf-8') as f:
    text = f.read()

# Try finding initial state
match = re.search(r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\});', text, re.DOTALL)
if match:
    data = json.loads(match.group(1))
    print(list(data.keys()))
    with open('sonyliv_state.json', 'w', encoding='utf-8') as f2:
        json.dump(data, f2, indent=2)
    print("Dumped to sonyliv_state.json")
else:
    print("No initial state found")
