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
EXCEL_PATH = "/Users/sonodakeisuke/Desktop/アプリ開発/01単語帳/スペイン語単語　完成版.xlsx"
JS_PATH = "/Users/sonodakeisuke/Desktop/アプリ開発/日本語→スペイン語/spanish_app_v2/js/data.js"

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
        name_lower = sheet_name.lower().strip()
        
        # カテゴリ振り分け
        key = None
        if "名詞" in name_lower:
            key = "nouns"
        elif "形容詞" in name_lower:
            key = "adjectives"
        elif "副詞" in name_lower:
            key = "adverbs"
        elif "その他" in name_lower:
            key = "prepositions"
        elif "動詞" in name_lower and not any(kw in name_lower for kw in ["分詞", "presente", "indefinido", "imperfecto", "futuro", "subjuntivo", "現在", "過去", "未来", "接続"]):
            key = "verbs"
            
        if key:
            print(f"単語シート解析中: {sheet_name} -> {key}")
            for row in range(2, sheet.max_row + 1):
                es = sheet.cell(row=row, column=2).value
                en = sheet.cell(row=row, column=3).value
                ja = sheet.cell(row=row, column=4).value
                cat = sheet.cell(row=row, column=5).value or "その他"
                
                if es and ja:
                    es_str = str(es).strip()
                    ja_str = str(ja).strip()
                    if es_str in ["スペイン語", "動詞", "名詞", "形容詞", "副詞"] or ja_str in ["日本語"]:
                        continue
                    
                    word_obj = {
                        "category": str(cat).strip(),
                        "es": es_str,
                        "ja": ja_str,
                        "en": str(en).strip() if en else ""
                    }
                    if key == "verbs":
                        word_obj["conjugations"] = {}
                    db[key].append(word_obj)
                    if key == "verbs":
                        verbs_dict[es_str.lower()] = word_obj
                        
        # 動詞の活用
        elif "動詞" in name_lower or "過去" in name_lower or "未来" in name_lower or "現在" in name_lower or "接続" in name_lower or "命令" in name_lower:
            tense_name = sheet_name.replace("動詞", "").replace("5-", "").strip() # 見出し用に少し整形
            print(f"活用表シート解析中: {sheet_name} -> {tense_name}")
            for row in range(2, sheet.max_row + 1):
                v_base = sheet.cell(row=row, column=2).value
                if v_base:
                    v_base = str(v_base).strip().lower()
                    if v_base in verbs_dict:
                        if "分詞" in name_lower:
                            verbs_dict[v_base]["conjugations"][tense_name] = {
                                "yo": str(sheet.cell(row=row, column=3).value or "-").strip(),
                                "tu": str(sheet.cell(row=row, column=4).value or "-").strip(),
                                "el/ella": "-",
                                "nosotros": "-",
                                "ellos": "-"
                            }
                        elif "命令" in name_lower:
                            verbs_dict[v_base]["conjugations"][tense_name] = {
                                "tu": str(sheet.cell(row=row, column=3).value or "-").strip(),
                                "usted": str(sheet.cell(row=row, column=4).value or "-").strip(),
                                "nosotros": str(sheet.cell(row=row, column=5).value or "-").strip(),
                                "ustedes": str(sheet.cell(row=row, column=6).value or "-").strip(),
                                "negativo_tu": str(sheet.cell(row=row, column=7).value or "-").strip()
                            }
                        else:
                            verbs_dict[v_base]["conjugations"][tense_name] = {
                                "yo": str(sheet.cell(row=row, column=3).value or "-").strip(),
                                "tu": str(sheet.cell(row=row, column=4).value or "-").strip(),
                                "el/ella": str(sheet.cell(row=row, column=5).value or "-").strip(),
                                "nosotros": str(sheet.cell(row=row, column=6).value or "-").strip(),
                                "ellos": str(sheet.cell(row=row, column=7).value or "-").strip()
                            }

    # JSデータの生成
    print("データをアプリ用に変換中...")
    js_content = f"const db = {json.dumps(db, ensure_ascii=False, indent=2)};\n\n"
    js_content += """const genresInfo = [
  { id: "nouns", label: "名詞", enLabel: "Nouns", icon: "🏷️", color: "#FF6B6B" },
  { id: "verbs", label: "動詞", enLabel: "Verbs", icon: "🏃", color: "#3B82F6" },
  { id: "adjectives", label: "形容詞", enLabel: "Adjectives", icon: "✨", color: "#4ECDC4" },
  { id: "adverbs", label: "副詞", enLabel: "Adverbs", icon: "⏱️", color: "#FFD166" },
  { id: "prepositions", label: "その他", enLabel: "Others", icon: "🔗", color: "#8B5CF6" }
];"""
    
    with open(JS_PATH, "w", encoding="utf-8") as f:
        f.write(js_content)
        
    print("="*50)
    print("🎉 抽出完了！すべての単語をアプリに取り込みました！")
    print(f"👉 ブラウザでアプリをリロード（更新）してデータを確認してください！")
    print("="*50)

if __name__ == "__main__":
    extract_data()
