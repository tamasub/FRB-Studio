# v0.3 追加：独立 Table Editor

- `experiment.html` → 「テーブル実験」から起動。表をクリックして選択、ダブルクリック / F2 / Enter でセル編集、Enter / Tab / Shift+Tab で確定・移動、Escape でキャンセル。
- Shift+矢印 / マウスドラッグで範囲選択、Ctrl+C/X/V で TSV 操作。複数セル貼り付けは必要に応じて行・列を拡張。右クリックで行列追加・削除・移動・列単位揃え・クリア。
- `原文` ボタンで Markdown ソースを編集。表の編集は CodeMirror の一回の変更として反映され、Ctrl+Z/Y で原文に戻せる。閲覧・選択では原文を変更しない。
- `../table_editor/` に独立実装。Markdown Editor は行列への変換と変更反映を担当する。ホストは table_editor.css / table_editor.js を先に読み込む。Generic Editor・既存 Studio/Launch には未接続。
- 一般的な整形済みの矩形パイプ表が対象。構造変更では対象表内の空白や区切りを再整形する場合がある。セルは単一行の Markdown 原文、リッチな装飾表示・セル結合・引用符付き複数行 TSV は未対応。全列削除は不可、ヘッダー行は保持。
- Windows実機・ExcelとのOSクリップボード・日本語IME未確認。ブラウザのクリップボード権限によって右クリック貼り付けが拒否される場合は Ctrl+V を使う。Chromium のローカルファイル直接アクセスは環境ポリシーで禁止のため、テストはローカル資産をHTMLへインライン化して実行。

# FRB Markdown Editor — 実験 v0.2

## 起動
`experiment.html` を Chrome / Edge で開く。HTML / JS / CSS / vendor を同じフォルダー構成で配置する。npm、Node、CDN、サーバーは不要。既存 Generic Editor や Studio、Launch とは未接続。保存処理はない。編集した内容は閉じると失われるので必要なら右側の原文をコピーする。

## 主文脈・判断軸・制約
- 複数行テキストボックスの標準編集コンポーネントを目指す。普通の文章もそのまま扱う。
- Obsidian の再現そのものではなく、自然な編集操作感を優先する。文字位置の変化は必要最小限にするがゼロを強制しない。
- 表示・フォーカス・カーソル・テーマ・モードの変更では原文を変更しない。
- 正本は Markdown 文字列。ViewDef / FieldDef / JSON保存 / 呼出元固有の仕様は扱わない。
- 実験 HTML は呼出元のサンプル。コンポーネント本体は markdown_editor.js / css に分離する。

## 実験用インターフェース（確定前）
```js
const editor = new FRBMarkdownEditor({ value: '# 見出し\n本文' });
editor.mount(document.getElementById('editor'));
const unsubscribe = editor.on('change', value => console.log(value));
const raw = editor.getValue();
editor.setValue(raw);  // ユーザー変更イベントを出さない
editor.setReadOnly(true);
unsubscribe();
editor.destroy();
```
共通候補: mount, destroy, getValue, setValue, setReadOnly, setEnabled, focus, blur, resize, setTheme, on/off (change/focus/blur)。固有候補: setMode('live-preview' | 'source')。Field Contract、Validation、Registry、Factory は未実装。共通契約の確定は Text Editor との比較後に行う。内部 cm は試験からのみ使用し、ホストの契約には含めない。

## 今回の対応範囲
- v0.1 の機能（見出し・太字・斜体・箇条書き・引用・インラインコード・フェンスコードブロック、原文表示・Source・Undo/Redo・読み取り専用・テーマ）を維持。
- 取り消し線の判定ミスを修正。`__太字__` / `_斜体_` と、記号そのものを説明する文章も試験。
- リンクはラベルを表示して編集時に原文を露出。外部URLの自動オープンはしない。
- タスクリストは非編集中にチェックボックスを表示。クリックは原文の `[ ]` / `[x]` のみを変更し、通常の change イベントと Undo に対応。読み取り専用では変更不可。
- 水平線、番号付きリスト、インラインコード内の CSS 色見本（HEX/RGB/RGBA/HSL/HSLA）。
- 単純な Qiita `:::note info/warn/alert` を色付き表示（閉じられたブロックのみ）。
- GFM風テーブル：非編集中は表を表示、セルクリックで対応する原文位置を開き、その場で原文編集。列数が揃った単純な表、配置指定、エスケープされたパイプに対応。セル内のMarkdown装飾、直接セル編集、行列の編集操作は未実装。
- 限定された `<details><summary>…</summary>` / `<details open>` と `<dl>`（各行に dt/dd、単純な strong）の安全な表示。details の開閉は表示状態だけを変更する。「原文」ボタンで編集。任意の HTML は実行せずテキストとして扱う。
- 実験HTMLに「Qiita構文サンプル」「基本サンプル」を追加。ユーザー提示の例を元に、コードフェンスの改行を整え、表・Mermaidの例を追加した試験データ。現在のサンプルへの復元が可能。

## 未確定・制限
- CodeMirror 5.58.3 は手元の既存ライブラリを用いたオフライン実験用。6 系は未取得（ネットワーク不可）。製品採用の判断は未実施。
- 構文処理は限定的で完全な CommonMark パーサーではない。複雑な入れ子・完全な GFM / CommonMark / Qiita 互換、一般的なHTML描画、言語別コードハイライト、Mermaid描画は未対応。Mermaidは通常のフェンスブロックとして編集・保持する。長文性能・IME実機・WebView2/Qt WebEngine は未検証。
- 表示更新で全文の装飾を再構築する。長文最適化、厳密なマーカー単位の露出、スクロール位置保証は今後。
- 改行が混在する原文は無編集なら完全保持するが、実際に編集すると LF に正規化する。均一な CRLF/LF/CR は維持する設計。実運用前に混在改行方針を確定する。
- 外部ライブラリを含むため配布時は vendor のライセンス表示を維持する。実験用 HTML は既存の保存/配布動作を変更しない。

## 検証
`python tests/browser_smoke.py` および `python tests/extended_smoke.py`（Python Playwright + Chromium が別途必要。環境変数 CHROMIUM_PATH でブラウザを指定可能）。検証環境のブラウザは file:// および localhost ナビゲーションを制限していたため、同一の HTML とローカル資産をインライン化して実行した。実際の Windows ファイル直接起動は未検証。

## v0.4 実験：リッチ表
- 標準Markdown表を読み込んだだけでは原文を変換しない。既存の単純な値編集も従来形式を保持。書式を設定した時点で、その表だけを `frb-table` フェンス（バージョン1のJSON）に変換する。変換後は書式を解除しても同じブロック形式を維持。一般的なHTML表の編集は今回の範囲外。
- 保存形式は暫定。`getValue()` は書式込みの正本文字列。リッチ表を `setValue()` に渡せば再現できる。未知・不正な構造は原文のコードブロックとして残し、任意HTML/JavaScriptは実行しない。表示時には文字列と許可済み書式属性だけを使う。
- `exportStandardMarkdown()` は正本を変更せず、リッチ表だけを通常のGFM風パイプ表へ変換する。色、背景、セル固有の揃えなど標準表で表現できない情報は出力時に省略。列全体で揃えが一致するときは反映し、太字等は簡易Markdown装飾へ変換。他のQiita拡張やHTMLは今回変換対象外。実験HTMLの「標準Markdownをコピー」で取得できる（権限に依存）。
- 共通契約、既存Studio/Launch連携、正式なFRB Markdown規格は未確定。
