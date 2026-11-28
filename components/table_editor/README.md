# FRB Table Editor — experimental v0.2

## 責務
矩形の文字列行列と列揃えの編集操作を担当する。Markdown、ViewDef、FieldDef、JSON保存、CodeMirror、Studio/Launchには依存しない。先頭行はヘッダー。全列削除は不可。ホストは変更の永続化と履歴を担当する。

## 実験
`experiment.html` は単体実験。`../markdown_editor/experiment.html` は接続実験。ブラウザーで開く。外部ライブラリ・ネットワーク不要（Markdown側は既存同梱CodeMirror使用）。

## 暫定API
`new FRBTableEditor({model:{rows:string[][], align:string[]}, onChange, onSource, onUndo, onExit, onFocus, displayValue, readOnly, disabled, selection})` → `mount(host)`。`getValue()` と `getSelection()` はコピーを返す。`onChange(model,selection,restoreFocus)` は編集確定時のみ。`onUndo(redo,selection)` はホストの履歴処理へ委譲。`displayValue` は表示およびコピー用の変換（任意）。共通editor_contractは未確定のため本APIは暫定。今回は矩形・単一行文字列に限定。セル移動は単独行・列、選択範囲の削除・クリア・揃えに対応。

## テスト
`python tests/browser_smoke.py` (Python Playwright + Chromium; `CHROMIUM_PATH` で実行ファイルを指定)。単体とMarkdown連携を検証。ClipboardEventのTSVを検証するがWindows実機・Excel実機・IMEは未確認。実環境のclipboard権限によって右クリック貼り付けはCtrl+Vへフォールバックする。

## v0.2 書式と端の追加ボタン
- `model.styles` は省略可能。`{table: Style, rows: Style[], cells: Style[][]}`。Style は `align` (left/center/right), `bold`, `italic`, `strike` (boolean), `color`, `background` (6桁HEX)。空オブジェクトは継承。従来の列揃えは基底値とし、表全体 → 行 → セルの順で上書きする。OFF は false、継承は属性削除。適用範囲を変更してもデータは変更しない。
- 右クリックの直接揃えは選択セルのみ。「書式」から表全体・選択行・選択セルを指定。行列の追加・移動・削除に書式が追従。新しいセルは上位書式を継承。クリアは値のみ。
- 表の右端の＋は末尾に列追加、下端の＋は末尾に行追加。従来の選択位置前後の操作も維持。
- ポップアップはスクロール領域の外側に表示する。ホストがDOMを破棄する前に `closeMenu()` を呼ぶ。
- `tests/style_smoke.py` でスコープ・継承・移動・端ボタン・原文往復・読み取り専用・不正入力を検証。Windowsのネイティブ色選択、IME、Excel連携は未確認。書式付きコピー・セル内改行・セル結合・列幅・行高は未実装。
