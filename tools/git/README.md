# FRB Commander 初号機 — サンプル

`Export-DiffToJson.ps1` が実際に配置されているフォルダーに、
`Export-DiffToJson.viewdef` をコピーしてください。PowerShell本体を移動・改造する必要はありません。
**このフォルダーのサンプルだけでは起動しません。**

例：

```text
FRBStudio_App/tools/git/
  Export-DiffToJson.ps1
  Export-DiffToJson.viewdef
```

LaunchのFiles Listで `.ps1` を選択し、コンテキストメニューから
`FRB Commanderで実行` を選びます。

キー操作：

- `← →` : パンくず間のフォーカス移動
- `↓` または `/` : フォーカス中の項目の選択開始
- 候補表示中は `↑ ↓` : 候補間移動
- 候補表示中は `→ / Enter` : 候補確定
- 候補表示中は `← / Esc` : 選択キャンセル
- Keyboard Exでは既存の検索・左右・Enter操作を利用（ファイルはEnter/→で選択のみ）
- `Ctrl+Enter` : 実行内容を確認して起動

2ファイル比較の場合：1つ目はLaunchに登録したFilesルートから開始
（そのスクリプトを含むルートがなければスクリプトの配置フォルダー）、
2つ目は1つ目で選んだファイルの親フォルダーから開始します。

※ `.viewdef` はJSON形式のUTF-8ファイルです。v0.1では選択経路を定義し、
スクリプトは右クリックされたPowerShell（`.ps1`）に限定します。
