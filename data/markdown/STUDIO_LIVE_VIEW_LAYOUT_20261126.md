# Live View Design — 改行・高さ調整 (2026-11-26)

## 操作
- Header（基本情報）とDetail（詳細Editor）: 項目ラベル右上の↵をクリックすると、項目の前で強制改行。もう一度押すと解除。既に行頭にある場合は見た目は変わらない。項目順序は変えない。
- 複数行入力（通常textarea・Markdown Reading View）: 項目にマウスを置き、下端のハンドルを上下へドラッグ。40〜1600px。既存の右端幅調整と同じく、ドラッグ中にpx表示。
- 「レイアウトを保存」でViewDefに幅・改行・高さをまとめて保存。本文の編集・F12・Data JSON保存とは別。画面を再描画しないことで未反映の本文を保持。

## 宣言仕様
```json
{
  "field": "description",
  "type": "textarea",
  "width": 320,
  "layout": { "breakBefore": true, "height": 180 }
}
```
`layout.breakBefore` は true/false、`layout.height` は固定表示高（px）。省略時は従来動作。従来の `edit.height` は最低高さとしてそのまま維持。Search・Grid本体は新仕様の対象外。Detail FieldSetは従来の3列を維持し、改行指定を列1開始として扱う。Footerは元から縦並びのため改行ボタンを出さない。子グリッド・会話欄の内部の高さ・複数項目一括高さ調整は対象外。既存のCore ViewDef直接保存制約を維持（解決済みFieldがrawに存在しない場合は保存エラー）。

## 確認結果
- 関連Nodeテスト: 42/42 PASS（Live View Designは17/17、うち新規4件）。
- 全静的Nodeテスト: 650 PASS / 21 FAIL、計671。添付ZIP未改修状態でも646 PASS / 21 FAIL、計667。同一失敗タイトルを照合、新規失敗なし。テスト実行で生成された無関係な証跡変更は差分ZIPから除外。
- Linux headless Chromium: 実際のHeader／Detail描画関数を最小DOMにロードし、Header改行・解除、通常textarea 30→130px、未保存本文の保持、モックViewDef GET/POSTによる保存・再読込、既存edit.heightの保持、DetailのMarkdown Reading Viewの改行・高さドラッグを確認。実際のWindows NativeShell/HTTP保存結合テストではない。
- 今回は対象インシデントIDの指定がないため既存台帳は変更せず、本メモに作業内容を記録。
