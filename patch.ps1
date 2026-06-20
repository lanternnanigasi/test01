$content = Get-Content app.js -Raw -Encoding UTF8
$target = "必ず「/」で情報が区切られたテキスト記法で、文字によってのみ出力すること。Markdownの表（ヘッダー行や --- などの区切り線）として出力してはならない。"
$replacement = "【厳守】必ず「/」で情報が区切られたデータ行のみを出力すること。`n※「/ 企業名 / 給与 /」のような項目名のヘッダー行や、「/ --- / --- /」のような区切り線は絶対に生成・出力しないでください。純粋なデータ行のみが必要です。"
$newContent = $content.Replace($target, $replacement)
[IO.File]::WriteAllText("$(Get-Location)\app.js", $newContent, [System.Text.Encoding]::UTF8)
Write-Output "Done"
