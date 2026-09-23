import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_FILE = os.path.join(BASE_DIR, 'data', 'episodes.csv')
STATE_FILE = os.path.join(BASE_DIR, 'data', 'state.json')
DATES_CACHE_FILE = os.path.join(BASE_DIR, 'data', 'dates_cache.json')

VALID_CHANNELS = [
    'sony sab', 
    'sony pal', 
    'taarak mehta ka ooltah chashmah', 
    'taarak mehta ka ooltah chashmah episodes',
    'taarak mehta ka ooltah chashmah movies',
    'liv comedy'
]
