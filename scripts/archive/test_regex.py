import sys
import os

sys.path.append(os.path.abspath('scripts'))

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from update_website import is_single_episode

print(is_single_episode("Bhide Calls A Night Meeting | Taarak Mehta Ka Ooltah Chashmah | Full Episode 4799 | 26 Aug 2026", "", "Sony SAB", 4799))
