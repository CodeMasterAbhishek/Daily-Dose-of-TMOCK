import re

with open('js/ui.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace has fallback logic
content = re.sub(
    r'!article\.fallbackId && !article\.shortId',
    r'!(article.robustFallbacks && article.robustFallbacks.length) && !(article.robustShorts && article.robustShorts.length)',
    content
)

content = re.sub(
    r'!article\.fallbackId && article\.shortId',
    r'!(article.robustFallbacks && article.robustFallbacks.length) && (article.robustShorts && article.robustShorts.length)',
    content
)

# Bypass block
bypass_regex = r"if\s*\(cache\[article\.videoId\]\s*&&\s*cache\[article\.videoId\]\.isUnavailable\)\s*\{\s*if\s*\(article\.fallbackId\)\s*\{\s*videoIdToPlay\s*=\s*article\.fallbackId;[\s\S]*?\}\s*\}"
bypass_new = """if (cache[article.videoId] && cache[article.videoId].isUnavailable) {
                if (!window._playbackAttempts) window._playbackAttempts = {};
                const fallbacks = article.robustFallbacks || [];
                const shorts = article.robustShorts || [];
                
                if (fallbacks.length > 0) {
                    videoIdToPlay = fallbacks[0];
                    window._playbackAttempts[article.id] = 1;
                    initialMsg = `⚠️ <strong>Switched to Backup Stream</strong>: The main video was blocked in your region, so we automatically pre-loaded a backup full episode!`;
                } else if (shorts.length > 0) {
                    videoIdToPlay = shorts[0];
                    window._playbackAttempts[article.id] = fallbacks.length + 1;
                    initialMsg = `⚠️ <strong>Switched to Short Version</strong>: The full episode is geo-blocked, so we automatically pre-loaded the promo/short version instead!`;
                }
            }"""

content = re.sub(bypass_regex, bypass_new, content)

# Retry block
retry_regex = r"if\s*\(attempts\s*===\s*0\s*&&\s*article\.fallbackId\)\s*\{[\s\S]*?\}\s*else\s*if\s*\(attempts\s*<=\s*1\s*&&\s*article\.shortId\)\s*\{[\s\S]*?\}"
retry_new = """const fallbacks = article.robustFallbacks || [];
                            const shorts = article.robustShorts || [];
                            
                            if (attempts < fallbacks.length) {
                                nextVideoId = fallbacks[attempts];
                                msg = `⚠️ <strong>Switched to Backup Stream (${attempts + 1}/${fallbacks.length})</strong>: Attempting to load another backup full episode...`;
                            } else if (attempts < fallbacks.length + shorts.length) {
                                const shortIdx = attempts - fallbacks.length;
                                nextVideoId = shorts[shortIdx];
                                msg = `⚠️ <strong>Switched to Short Version (${shortIdx + 1}/${shorts.length})</strong>: The full episodes are blocked, attempting to load a promo/short version instead.`;
                            }"""

content = re.sub(retry_regex, retry_new, content)

with open('js/ui.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("ui.js updated!")
