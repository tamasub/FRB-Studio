# FRB Studio — Smart Search データ値候補／50件上限（2026-11-17）

## 対象と目的

Studio 標準の全文検索で `/` または右クリック → 項目候補選択後に、既存の Combo / Boolean に加えて通常のテキスト・数値・日付などの値も選択できるようにする。

## 仕様

- 値は **今読み込んでいるメイングリッドの全行 `currentRows`** からその項目の値を集める。現在の検索結果 `filteredRows` に限定しない。
- **値の重複を除去**。null、空文字、オブジェクトは候補に入れず、配列の要素がスカラー値なら候補にできる。元データの変更は行わない。
- **一覧は最大50種類**。例：全128種類なら「候補は50件まで表示（該当128件、残り78件は省略）。候補検索で省略分も探せます。」を表示する。
- **候補専用の検索入力で、50件より後ろの値も検索できる**。全候補から絞り込んでから50件で区切る。絞り込んだ結果が50件以下なら省略の表示は消える。
- 項目選択時、値候補が存在すれば候補一覧を表示して絞り込み欄にフォーカスする。既存の `↑↓`、`Tab` / `Enter` / `→`、`Esc`、候補クリックは継続使用。
- Combo の表示名/内部値・Boolean の従来候補を維持。自由入力も引き続き可能。既存のSmartSearch構文（例 `=` はテキスト部分一致、`==` は完全一致）は変更しない。
- `searchSection` に専用表示要素を作成。`wwwroot/index.html` のCSS・JSリソースのクエリを更新し、古いWebViewキャッシュを避ける。

## 実データによる検証

`data/json/01_main/_studio_work_incident_data_v2.json` 内 `work_items` 257件を使用。

| 項目 | 重複除去後の候補数 | 一覧表示 | 省略 |
|---|---:|---:|---:|
| title | 256 | 50 | 206 |
| category | 137 | 50 | 87 |
| work_item_id | 257 | 50 | 207 |
| status | 8 | 8 | 0 |
| priority | 3 | 3 | 0 |

## テスト

- `node --test tests/qa/static/studio_smart_search_*.test.mjs tests/qa/static/full_text_and_keywords.test.mjs tests/qa/static/full_text_search_single_row.test.mjs` → **54/54 PASS**（変更前テスト含む）。
- `node --test tests/qa/static/*.test.mjs` → **627/634 PASS、7件 FAIL**。7件は添付元ZIPの無改修状態でも同様に失敗し、今回の差分が原因ではないことを照合済み。うち複数は元ZIPに `defs/launch/frb_launch_maintenance_view_def_v0_1.json` が含まれないことによるもの。
- Windows 実機での GUI 表示・操作は未確認。

## 適用

ZIP 内のファイルを FRBStudio_App のルートにフォルダー構造を維持して上書き展開。データJSON・ViewDefの改変なし。
