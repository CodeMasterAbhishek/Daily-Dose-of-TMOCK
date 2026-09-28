import urllib.request
import re

html = urllib.request.urlopen('https://www.youtube.com/watch?v=ImfsDT4rJ00').read().decode('utf-8')
match = re.search(r'"publishDate":"(.*?)"', html)
if match:
    print(match.group(1))
else:
    print("Not found")
