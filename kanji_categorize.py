import json
import re

file_path = '/Users/sonodakeisuke/.gemini/antigravity/scratch/spanish_app_v2/js/data.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

parts = content.split('const genresInfo = ')
db_str = parts[0].replace('const db = ', '').strip()
if db_str.endswith(';'):
    db_str = db_str[:-1]
genres_str = parts[1] if len(parts) > 1 else ""

data = json.loads(db_str)

def get_kanji_theme(ja_text, pos):
    if not ja_text: return None
    
    # Check kanji for Nouns
    if pos == "nouns":
        if any(k in ja_text for k in ["気","心","情","感","愛","怒","悲","喜","幸","望","念","思","考","意","理","精神","夢","恐怖"]): return "❤️ 心・感情・思考"
        if any(k in ja_text for k in ["人","者","員","手","達","族","民","友","客","婦","夫","供","男","女","師","士","仲間"]): return "👥 人物・社会・関係"
        if any(k in ja_text for k in ["家","室","具","機","器","物","品","服","衣","食","飲","水","肉","菓","車","靴","鍵"]): return "🏠 生活・身の回り・道具"
        if any(k in ja_text for k in ["動","植","然","景","宇","宙","星","空","天","海","山","川","林","森","虫","魚","鳥","獣","犬","猫","花"]): return "🌳 自然・環境・生き物"
        if any(k in ja_text for k in ["金","経","済","営","商","買","売","業","職","働","労","雇","産","価","費","財"]): return "💼 経済・ビジネス・職業"
        if any(k in ja_text for k in ["学","校","育","習","勉","研","究","験","試","科","理","数","文","史","芸","術","本","辞書","語"]): return "🎓 教育・学問・文化"
        if any(k in ja_text for k in ["病","医","薬","痛","健","康","体","血","骨","頭","顔","目","口","手","足","症状"]): return "🏥 体・健康・医療"
        if any(k in ja_text for k in ["時","間","刻","日","月","年","歳","期","代","昔","今","未","来","季","朝","昼","夜","夕"]): return "⏰ 時間・期間・季節"
        if any(k in ja_text for k in ["所","場","処","道","路","街","町","村","国","境","域","地","駅","港","市","府","県"]): return "📍 場所・地理・方向"
        if any(k in ja_text for k in ["政","法","律","規","則","警","察","戦","争","和","軍","権","義","務","選","挙","党"]): return "⚖️ 政治・法律・社会"
        if any(k in ja_text for k in ["数","量","計","測","度","割","倍","半","全","部","分","メートル","キロ","グラム","サイズ"]): return "🔢 数・量・割合"
        if any(k in ja_text for k in ["遊","戯","技","競","勝","負","楽","音","歌","踊","劇","祭","祝","絵","画"]): return "🎨 遊び・芸術・イベント"
        if any(k in ja_text for k in ["色","形","状","態","様","姿","影","光","闇","赤","青","黄","白","黒","緑"]): return "✨ 色・形・状態"
        return "🎯 実用名詞・一般概念"

    # Verbs
    elif pos == "verbs":
        if any(k in ja_text for k in ["思","考","知","覚","忘","信","疑","決","判","断","理解","想"]): return "🧠 思考・記憶・判断"
        if any(k in ja_text for k in ["言","話","語","聞","伝","教","答","問","呼","叫","論","説"]): return "💬 発言・伝達"
        if any(k in ja_text for k in ["感","喜","悲","怒","泣","笑","恐","愛","憎","好","嫌","驚","願","望","悩"]): return "❤️ 感情・心理"
        if any(k in ja_text for k in ["行","来","帰","歩","走","飛","泳","進","戻","去","出","入","乗","降","着","向"]): return "🏃 移動・進行・方向"
        if any(k in ja_text for k in ["見","視","観","探","見つける","読","書","描","示","現","隠"]): return "👀 視覚・認識・表現"
        if any(k in ja_text for k in ["持","得","受","取","与","送","借","貸","払","買","売","払","捨","残"]): return "🤲 所有・授受・移動"
        if any(k in ja_text for k in ["食","飲","味","料理","噛","舐","飢"]): return "🍽️ 食事・飲食"
        if any(k in ja_text for k in ["打","押","引","切","壊","開","閉","回","投","落","割","折","曲"]): return "🔨 物理的動作・操作"
        if any(k in ja_text for k in ["作","造","製","建","生","化","変","育","増","減","成","発","死"]): return "🌱 変化・生成・消滅"
        if any(k in ja_text for k in ["始","終","続","止","待","休","働","努","力","試","成","功","失","敗"]): return "⏱️ 開始・継続・労働"
        if any(k in ja_text for k in ["戦","争","闘","勝","負","競","防","守","攻","撃","殺","傷"]): return "⚔️ 闘争・競争"
        if any(k in ja_text for k in ["助","救","支","援","協","賛","許","求","要","必","頼","従"]): return "🤝 関係・支援・要求"
        if any(k in ja_text for k in ["有","在","居","住","立","座","寝","起","横","生","活"]): return "🏠 存在・状態・生活"
        return "⚡ 実用動詞・基本動作"

    # Adjectives
    elif pos == "adjectives":
        if any(k in ja_text for k in ["大","小","長","短","高","低","広","狭","深","浅","厚","薄","太","細","重","軽"]): return "📐 規模・寸法・重量"
        if any(k in ja_text for k in ["良","悪","優","劣","美","醜","綺","麗","素","晴","酷","汚","清","潔"]): return "✨ 評価・美醜・状態"
        if any(k in ja_text for k in ["新","旧","古","若","老","早","遅","速","急","昔","今","次","前","後"]): return "⏳ 時間・新旧・速度"
        if any(k in ja_text for k in ["赤","青","黄","白","黒","緑","茶","灰","色","明","暗","濃","淡"]): return "🎨 色彩・明暗"
        if any(k in ja_text for k in ["嬉","悲","楽","怒","怖","寂","好","嫌","幸","不幸","驚","退","屈","快","不快"]): return "😊 感情・気分"
        if any(k in ja_text for k in ["優","礼","儀","勇","親","切","真","面","目","賢","馬","鹿","怠","正","直","残","酷","厳"]): return "👤 性格・態度・人間性"
        if any(k in ja_text for k in ["簡","単","難","易","重","要","必","能","不","可","複","雑","純","便","利"]): return "⚠️ 難易度・重要性・可能性"
        if any(k in ja_text for k in ["甘","酸","苦","塩","辛","旨","味","匂","臭","香"]): return "👅 味覚・嗅覚"
        if any(k in ja_text for k in ["硬","軟","柔","暖","温","涼","冷","暑","寒","鋭","鈍","滑","痛"]): return "🌡️ 触覚・温度・痛み"
        if any(k in ja_text for k in ["満","空","壊","破","割","濡","乾","強","弱","固","液","気","静","動"]): return "📦 物理状態・性質"
        if any(k in ja_text for k in ["安","高","富","貧","価","値","豊","乏","無","料"]): return "💰 経済・価値"
        if any(k in ja_text for k in ["真","偽","実","虚","確","疑","正","誤","確","実","明"]): return "✅ 真偽・確実性・正確性"
        if any(k in ja_text for k in ["同","異","似","違","他","別","各","毎","全","一","多","少"]): return "⚖️ 同異・数量・比較"
        return "🏷️ 実用形容詞・その他"

    elif pos == "adverbs":
        if any(k in ja_text for k in ["常","時","決","未","既","再","最","近","今","後","直","ぐ","早","遅","昔","毎"]): return "⏱️ 頻度・時間副詞"
        if any(k in ja_text for k in ["非","常","極","少","多","十","分","最","全","完","全","全く","約","大","抵"]): return "📊 程度・強調副詞"
        if any(k in ja_text for k in ["所","処","近","遠","前","後","上","下","向","外","内","中","右","左"]): return "📍 場所・方向副詞"
        if any(k in ja_text for k in ["上手","下手","早","速","遅","注","意","静","大声","急","ゆっ","丁寧","確"]): return "🏃 様態・方法副詞"
        if any(k in ja_text for k in ["是","非","否","定","肯","能","確","勿","論","多分","恐","絶","対"]): return "✅ 肯定・否定・可能性副詞"
        if any(k in ja_text for k in ["比","較","同","異","代","特","一","緒","共"]): return "⚖️ 比較・関係副詞"
        return "✨ 実用副詞・その他"
        
    return None

# Process
for pos, items in data.items():
    for item in items:
        # If it was previously marked as "その他" (or chunked as "その他..."), recalculate
        if 'その他' in item.get('category', ''):
            new_theme = get_kanji_theme(item.get('ja', ''), pos)
            if new_theme:
                item['category'] = new_theme

# Re-chunk categories that have more than 30 items
cat_items = {}
for pos, items in data.items():
    cat_items[pos] = {}
    for item in items:
        cat = item.get('category', 'その他')
        # clean existing chunk suffixes
        cat = re.sub(r' \d+ \([A-Z?]-[A-Z?]\)$', '', cat)
        cat = re.sub(r' \d+ \([A-Z?]\)$', '', cat)
        if cat not in cat_items[pos]:
            cat_items[pos][cat] = []
        cat_items[pos][cat].append(item)

for pos in data:
    data[pos] = []

for pos, categories_dict in cat_items.items():
    for cat, items in categories_dict.items():
        if len(items) > 30:
            def get_sort_key(item):
                s = item.get('es', '').lower()
                for prefix in ['el/la ', 'los/las ', 'el ', 'la ', 'los ', 'las ', 'un ', 'una ', 'unos ', 'unas ']:
                    if s.startswith(prefix): s = s[len(prefix):]
                return s.lstrip('¿¡')
                
            items.sort(key=get_sort_key)
            chunk_size = 30
            num_chunks = (len(items) + chunk_size - 1) // chunk_size
            
            for i in range(num_chunks):
                chunk = items[i*chunk_size : (i+1)*chunk_size]
                first_letter = get_sort_key(chunk[0])[0].upper() if get_sort_key(chunk[0]) else '?'
                last_letter = get_sort_key(chunk[-1])[0].upper() if get_sort_key(chunk[-1]) else '?'
                suffix = f"{first_letter}-{last_letter}" if first_letter != last_letter else first_letter
                
                # Assign genre-like names instead of standard chunks if possible, but the user requested genre-like. 
                # Since we already heavily sub-categorized them, these are genres! We just append numbering.
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

print("Kanji thematic categorization complete.")
