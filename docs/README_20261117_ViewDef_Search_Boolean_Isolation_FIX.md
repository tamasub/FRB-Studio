# FRB Studio — ViewDefメンテナンスの項目一覧が0件になる不具合 修正

対象元ソース：`FRBStudio_App20261117_121214.zip`（2026/11/17 12:12版）

## 症状

ViewDefメンテナンス（「…」）を開くと、項目は存在するにもかかわらず、検索欄のboolean項目が意図せず絞り込み条件として扱われ、Gridが「表示 0 / 全 N 件」となる。

## 原因

boolean Fieldの `edit.control="boolean-checkbox"` （編集専用指定）が、標準検索UIのコントロール生成にも渡されていた。ブラウザのチェックボックスには、未選択・中間状態でも `input.value="on"` という既定値がある。この `on` が検索条件として認識され、booleanのtrue/falseデータのどちらにも一致せず全行が除外された。

## 修正

- `wwwroot/js/services/search_ui_controller.js`：検索UI生成時、boolean／selectでは編集専用コントロール指定を取り除く。boolean検索は、従来の空欄/true/falseコンボへ戻す。
- `wwwroot/index.html`：検索UI JavaScriptのキャッシュ識別子を変更してWebView2に最新版を読み込ませる。
- **詳細エディターのチェックボックスとViewDefは変更しない**。true/falseワンクリック、未設定ボタンを維持。
- `tests/qa/static/viewdef_boolean_search_isolation_20261117.test.mjs`：検索と編集の責務分離、未指定検索時に全行が残ること、明示指定の検索を回帰テスト。

## テスト

- boolean関連：8件PASS（前回の5件＋今回追加3件）。
- static suite：修正後647件中639件PASS・8件FAIL。元ZIPの644件中636件PASS・8件FAILと**失敗項目が一致**。新たな失敗なし。
- 修正前に新規テストだけを実行すると3件FAIL、修正後には3件PASS。
- Chromiumブラウザーの自動表示確認は環境アクセス制限のため未実施。Windows/WebView2での表示は要確認。

## 適用

1. Studioを終了する。
2. このZIPを **FRBStudio_App のルートへ展開し、同名ファイルを上書き**する（事前バックアップ推奨）。
3. NativeShellのC#ソースは変更していないため**再ビルド不要**。
4. ViewDef → 「…」を押し、検索欄のboolean項目が空欄のコンボになり、Gridに行が戻るかを確認。

## 対象外

データJSONとViewDef JSONの内容、保存処理、CSV機能、エディターUIは変更しない。
