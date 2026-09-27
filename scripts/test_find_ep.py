import sys
import os

sys.path.append(os.path.abspath('scripts'))

from update_website import find_episode

print(find_episode(4799))
