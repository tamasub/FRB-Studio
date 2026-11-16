# FRB Studio Family / Generic Editor — 実験差分 v0.1

適用先: `F:\FRB_Apps\FRB_Studio` (Studioの独立リポジトリのルート)

## 今回の差分
- 新規 Studio ViewDef: webviewの2項目、file_indexの公開6項目
- 新規オプション設定の唯一の実験Generic Editor（HTML + CSS + JavaScript）
- Node.jsによる合成・保存Core（CLIおよび127.0.0.1専用の画面用ホスト）
- User JSONは、保存成功までは作成されない
- ViewDefを公開拡張した場合、Systemの標準値を自動で表示し、保存後Userに確定
- 8件のNodeテスト

## 注意
Studio本体の既存詳細Editorはまだ切り替えていません。今回の実験Editorとの二実装は**一時的**で、早期統合が次工程です。
Node.js実行環境本体（node.exe）はZIPに含まれません。Launch側のポータブル準備スクリプトを使用してください。
詳細は `tools/option_settings/README_JA.md`。
