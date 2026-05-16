import json

file_path = '/Users/sonodakeisuke/.gemini/antigravity/scratch/spanish_app_v2/js/data.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

parts = content.split('const genresInfo = ')
db_str = parts[0].replace('const db = ', '').strip()
if db_str.endswith(';'):
    db_str = db_str[:-1]

genres_str = parts[1] if len(parts) > 1 else ""
data = json.loads(db_str)

cat_items = {}
for pos, items in data.items():
    cat_items[pos] = {}
    for item in items:
        # Base category without previous splits if any
        cat = item.get('category', 'その他')
        cat = cat.split(' 1 (')[0].split(' 2 (')[0].split(' 3 (')[0] # remove previous chunk suffixes if any
        if cat not in cat_items[pos]:
            cat_items[pos][cat] = []
        cat_items[pos][cat].append(item)

# Clear existing data items and reconstruct
for pos in data:
    data[pos] = []

for pos, categories_dict in cat_items.items():
    for cat, items in categories_dict.items():
        if len(items) > 30:
            # We need to split
            def get_sort_key(item):
                s = item.get('es', '').lower()
                for prefix in ['el/la ', 'los/las ', 'el ', 'la ', 'los ', 'las ', 'un ', 'una ', 'unos ', 'unas ']:
                    if s.startswith(prefix):
                        s = s[len(prefix):]
                return s.lstrip('¿¡')
                
            items.sort(key=get_sort_key)
            
            chunk_size = 30
            num_chunks = (len(items) + chunk_size - 1) // chunk_size
            
            for i in range(num_chunks):
                chunk = items[i*chunk_size : (i+1)*chunk_size]
                
                first_letter = get_sort_key(chunk[0])[0].upper() if get_sort_key(chunk[0]) else '?'
                last_letter = get_sort_key(chunk[-1])[0].upper() if get_sort_key(chunk[-1]) else '?'
                
                suffix = f"{first_letter}-{last_letter}" if first_letter != last_letter else first_letter
                
                new_cat = f"{cat} {i+1} ({suffix})"
                for item in chunk:
                    item['category'] = new_cat
                    data[pos].append(item)
        else:
            for item in items:
                item['category'] = cat
                data[pos].append(item)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(f"const db = {json.dumps(data, ensure_ascii=False, indent=2)};\n\n")
    if genres_str:
        f.write(f"const genresInfo = {genres_str}")

print("Chunking complete.")
