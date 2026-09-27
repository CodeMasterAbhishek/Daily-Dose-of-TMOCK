import re
VALID_CHANNELS = ['sony sab', 'taarak mehta ka ooltah chashmah', 'taarak mehta ka ooltah chashmah - tarak mehta']
RE_EPISODE_RANGE = re.compile(r'\b(?:ep|episode|episodes|ep\.|??????)?\s*(\d{2,4})\s*(?:-|-|-|to|??)\s*(\d{2,4})\b')

def is_single_episode(title: str, description: str, channel: str, ep_num: int, require_full: bool = False) -> bool:
    if channel.lower() not in VALID_CHANNELS:
        return False

    title_lower = title.lower()
    desc_lower = description.lower()
    combined_text = title_lower + " " + desc_lower

    m = RE_EPISODE_RANGE.search(combined_text)
    if m and int(m.group(1)) != int(m.group(2)):
        n1, n2 = int(m.group(1)), int(m.group(2))
        if abs(n2 - n1) >= 2:
            return False

    if any(k in combined_text for k in ['compilation', 'best of', 'full movie', 'mega episode']):
        return False
        
    if require_full:
        if any(k in combined_text for k in ['teaser', 'promo', 'precap', 'coming up next']):
            return False

    if str(ep_num) not in combined_text:
        return False

    return True

print(is_single_episode("NEW! Taarak Mehta Ka Ooltah Chashmah | Ep 4823 | 23 Sept 2026 | Teaser", "...", "Sony SAB", 4823))
