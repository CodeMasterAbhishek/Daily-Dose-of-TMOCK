def get_minutes(duration_str: str) -> int:
    """Parse a duration string like '21:45' or '1:02:30' and return total minutes.
    Returns 0 for any unparseable format (e.g. 'N/A', 'LIVE', '')."""
    try:
        parts = duration_str.split(':')
        if len(parts) == 3: # H:M:S
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 2: # M:S
            return int(parts[0])
    except (ValueError, TypeError, AttributeError):
        pass
    return 0

def is_compilation(title: str) -> bool:
    """Smart detection for compilation/movie videos based on title patterns instead of just duration."""
    import re
    # Match multiple episode numbers like 'Ep 120 - 125' or 'Ep 120 To 125'
    if re.search(r'\b(?:ep|episode|episodes)\s*\d+\s*(?:-|to|&|and)\s*\d+\b', title, re.IGNORECASE):
        return True
    # Match keywords heavily associated with merged compilations
    if re.search(r'\bmarathon\b|\bnon[\s-]*stop\b|\bcompilation\b|\brewind\b', title, re.IGNORECASE):
        return True
    # Match "FULL MOVIE" Parts
    if re.search(r'\bpart\s*\d+\b', title, re.IGNORECASE) and re.search(r'\bmovie\b', title, re.IGNORECASE):
        return True
    return False
