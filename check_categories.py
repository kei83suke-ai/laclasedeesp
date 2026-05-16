import json

file_path = '/Users/sonodakeisuke/.gemini/antigravity/scratch/spanish_app_v2/js/data.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

parts = content.split('const genresInfo = ')
db_str = parts[0].replace('const db = ', '').strip()
if db_str.endswith(';'):
    db_str = db_str[:-1]

data = json.loads(db_str)

counts = {}
for pos, items in data.items():
    counts[pos] = {}
    for item in items:
        cat = item.get('category', 'None')
        counts[pos][cat] = counts[pos].get(cat, 0) + 1

for pos, cats in counts.items():
    print(f"--- {pos} ({sum(cats.values())} total) ---")
    sorted_cats = sorted(cats.items(), key=lambda x: x[1], reverse=True)
    for cat, count in sorted_cats:
        print(f"  {cat}: {count}")
