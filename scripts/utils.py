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
