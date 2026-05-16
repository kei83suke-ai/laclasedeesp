import sys
import subprocess

# 必要なライブラリ（openpyxl）がない場合は自動インストール
try:
    import openpyxl
except ImportError:
    print("Excel読み込み用のライブラリをインストールしています...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl"])
    import openpyxl

import json
import random
import os

# パス設定
EXCEL_PATH = "/Users/sonodakeisuke/Library/CloudStorage/GoogleDrive-kei83suke@gmail.com/その他のパソコン/Windows PC/Desktop/★Spanish Textbook/Vocab/00スペイン語単語.xlsx"
JS_PATH = "/Users/sonodakeisuke/.gemini/antigravity/scratch/spanish_app_v2/js/data.js"

def get_image(genre):
    # アプリ上のデフォルト背景画像（ジャンルに関わらずランダムな綺麗な写真）
    images = [
        "https://images.unsplash.com/photo-1544145945-f90425340c7e?auto=format&fit=crop&w=500&q=80",
        "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=500&q=80",
        "https://images.unsplash.com/photo-1516223725307-6f76b9ec8742?auto=format&fit=crop&w=500&q=80",
        "https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=500&q=80"
    ]
    return random.choice(images)

def extract_data():
    print(f"Excelファイル ({EXCEL_PATH}) を解析中...")
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)
    
    db = {
        "nouns": [],
        "adjectives": [],
        "adverbs": [],
        "prepositions": [],
        "verbs": []
    }
    
    verbs_dict = {} # 活用表を紐付けるための辞書
    
    for sheet_name in wb.sheetnames:
        sheet = wb[sheet_name]
        name_lower = sheet_name.lower()
        
        # 名詞: C=スペイン語(3), D=英語(4), E=日本語(5), F=カテゴリ(6)
        if "名詞" in name_lower and not any(kw in name_lower for kw in ["形", "過去", "未来", "接続", "分詞"]):
            for row in range(2, sheet.max_row + 1):
                es = sheet.cell(row=row, column=3).value
                en = sheet.cell(row=row, column=4).value
                ja = sheet.cell(row=row, column=5).value
                cat = sheet.cell(row=row, column=6).value or "その他"
                if es and ja:
                    db["nouns"].append({"category": str(cat).strip(), "es": str(es).strip(), "ja": str(ja).strip(), "en": str(en).strip() if en else ""})
        
        # 形容詞: B=スペイン語(2), C=英語(3), D=日本語(4), E=カテゴリ(5)
        elif "形容詞" in name_lower:
            for row in range(2, sheet.max_row + 1):
                es = sheet.cell(row=row, column=2).value
                en = sheet.cell(row=row, column=3).value
                ja = sheet.cell(row=row, column=4).value
                cat = sheet.cell(row=row, column=5).value or "その他"
                if es and ja:
                    db["adjectives"].append({"category": str(cat).strip(), "es": str(es).strip(), "ja": str(ja).strip(), "en": str(en).strip() if en else ""})
                    
        # 副詞: B=スペイン語(2), C=英語(3), D=日本語(4), E=カテゴリ(5)
        elif "副詞" in name_lower:
            for row in range(2, sheet.max_row + 1):
                es = sheet.cell(row=row, column=2).value
                en = sheet.cell(row=row, column=3).value
                ja = sheet.cell(row=row, column=4).value
                cat = sheet.cell(row=row, column=5).value or "その他"
                if es and ja:
                    db["adverbs"].append({"category": str(cat).strip(), "es": str(es).strip(), "ja": str(ja).strip(), "en": str(en).strip() if en else ""})
                    
        # その他: A=スペイン語(1), B=英語(2), C=日本語(3), D=カテゴリ(4)
        elif "その他" in name_lower:
            for row in range(2, sheet.max_row + 1):
                es = sheet.cell(row=row, column=1).value
                en = sheet.cell(row=row, column=2).value
                ja = sheet.cell(row=row, column=3).value
                cat = sheet.cell(row=row, column=4).value or "その他"
                if es and ja:
                    db["prepositions"].append({"category": str(cat).strip(), "es": str(es).strip(), "ja": str(ja).strip(), "en": str(en).strip() if en else ""})
                    
        # 動詞: B=スペイン語(2), C=英語(3), D=日本語(4), E=カテゴリ(5)
        elif "動詞" in name_lower and not any(kw in name_lower for kw in ["形", "過去", "未来", "接続", "分詞"]):
            for row in range(2, sheet.max_row + 1):
                es = sheet.cell(row=row, column=2).value
                en = sheet.cell(row=row, column=3).value
                ja = sheet.cell(row=row, column=4).value
                cat = sheet.cell(row=row, column=5).value or "その他"
                if es and ja:
                    v_es = str(es).strip()
                    verb_obj = {"category": str(cat).strip(), "es": v_es, "ja": str(ja).strip(), "en": str(en).strip() if en else "", "conjugations": {}}
                    db["verbs"].append(verb_obj)
                    verbs_dict[v_es.lower()] = verb_obj
                    
        # 動詞の活用（残りのシート）
        elif "動詞" in name_lower or "過去" in name_lower or "未来" in name_lower or "現在" in name_lower or "接続" in name_lower:
            tense_name = sheet_name.replace("動詞", "").replace("5-", "").strip() # 見出し用に少し整形
            for row in range(2, sheet.max_row + 1):
                v_base = sheet.cell(row=row, column=2).value
                if v_base:
                    v_base = str(v_base).strip().lower()
                    if v_base in verbs_dict:
                        verbs_dict[v_base]["conjugations"][tense_name] = {
                            "yo": str(sheet.cell(row=row, column=3).value or "-"),
                            "tu": str(sheet.cell(row=row, column=4).value or "-"),
                            "el/ella": str(sheet.cell(row=row, column=5).value or "-"),
                            "nosotros": str(sheet.cell(row=row, column=6).value or "-"),
                            "ellos": str(sheet.cell(row=row, column=7).value or "-")
                        }

    # JSデータの生成
    print("データをアプリ用に変換中...")
    js_content = f"const db = {json.dumps(db, ensure_ascii=False, indent=2)};\n\n"
    js_content += """const genresInfo = [
  { id: "nouns", label: "名詞", enLabel: "Nouns", icon: "🏷️", color: "#FF6B6B" },
  { id: "adjectives", label: "形容詞", enLabel: "Adjectives", icon: "✨", color: "#4ECDC4" },
  { id: "adverbs", label: "副詞", enLabel: "Adverbs", icon: "⏱️", color: "#FFD166" },
  { id: "prepositions", label: "前置詞ほか", enLabel: "Prepositions", icon: "🔗", color: "#118AB2" },
  { id: "verbs", label: "動詞", enLabel: "Verbs", icon: "🏃", color: "#073B4C" }
];"""
    
    with open(JS_PATH, "w", encoding="utf-8") as f:
        f.write(js_content)
        
    print("="*50)
    print("🎉 抽出完了！すべての単語をアプリに取り込みました！")
    print(f"👉 ブラウザでアプリをリロード（更新）してデータを確認してください！")
    print("="*50)

if __name__ == "__main__":
    extract_data()
