import sys
import os

sys.path.append(os.path.abspath('scripts'))

import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from update_website import find_episode

print(find_episode(4799))
