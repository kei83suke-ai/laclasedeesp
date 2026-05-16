import json
import random

file_path = '/Users/sonodakeisuke/.gemini/antigravity/scratch/spanish_app_v2/js/data.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

parts = content.split('const genresInfo = ')
db_str = parts[0].replace('const db = ', '').strip()
if db_str.endswith(';'):
    db_str = db_str[:-1]

data = json.loads(db_str)

others = []
for pos, items in data.items():
    for item in items:
        if 'その他' in item.get('category', ''):
            others.append(f"{pos} | {item['es']} | {item['ja']}")

print(f"Total others: {len(others)}")
print("Sample:")
for w in random.sample(others, min(50, len(others))):
    print(w)
