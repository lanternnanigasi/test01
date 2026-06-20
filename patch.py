import re

with open('app.js', 'r', encoding='utf-8') as f:
    content = f.read()

target = r"必ず「/」で情報が区切られたテキスト記法で、文字によってのみ出力すること。Markdownの表（ヘッダー行や --- などの区切り線）として出力してはならない。"
replacement = "【厳守】必ず「/」で情報が区切られたデータ行のみを出力すること。\\n※「/ 企業名 / 給与 /」のような項目名のヘッダー行や、「/ --- / --- /」のような区切り線は絶対に生成・出力しないでください。純粋なデータ行のみが必要です。"

if target in content:
    content = content.replace(target, replacement)
    with open('app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Success")
else:
    print("Target not found")
