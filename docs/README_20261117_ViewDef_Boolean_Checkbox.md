# FRB Studio / ViewDef boolean 直接チェック編集 (2026-11-17)

## 目的
ViewDef メンテナンス画面で `true` / `false` を選ぶたびにコンボを開く操作をなくす。

## 変更対象
- `defs/common/view_def_maint_fields_v0_2.json` の boolean 6項目のみ、`edit.control: "boolean-checkbox"` を設定。
- `wwwroot/js/renderers/field_controls.js` に `boolean-checkbox` 部品を追加。既存の `boolean` コンボは維持。
- `wwwroot/js/renderers/grid_detail.js` にチェック値の取得・行コピー貼り付け時の再表示同期を追加。
- `wwwroot/styles.css` に表示スタイル、`wwwroot/index.html` にキャッシュ識別子を追加。

## 操作・保存仕様

| 操作・表示 | JSON保存値 |
|---|---|
| チェックあり | `true` |
| チェックなし | `false` |
| 「未設定」ボタン | `null` |
| 元データにない項目を未操作のまま保存 | 項目を作らない |

- クリック／Spaceで `true` と `false` をワンクリック切替。`null` からはクリックで `true`。
- `null` はチェック内の横棒と「未設定」ラベルで表示。独立した「未設定」ボタンで戻す。
- ReadOnlyのチェックおよび未設定ボタンは操作できない。
- `edit.control: "boolean-checkbox"` がない従来の boolean コンボを変更しない。
- boolean の空文字を false へ誤変換せず null として保存する。

## テスト

```powershell
node --test tests/qa/static/viewdef_boolean_checkbox_20261117.test.mjs
```

- 追加5テスト：PASS
- 全体Nodeテスト：726件中718件PASS、8件失敗
- 元ZIP：721件中713件PASS、同じ8件失敗（新規失敗なし）
- Chromium DOMテスト：null→true→false→null、設定値の再反映、readonly制御PASS

Windows 11 NativeShell実機における画面確認とF12保存の操作確認は未実施。

## 適用

1. Studioを終了する。
2. 差分ZIPを `FRBStudio_App` のルートへ上書き展開する。
3. 再起動してViewDefメンテナンスを開き、6項目がチェックボックスになったことを確認する。
4. 必要に応じてF12、保存、再読込で値を確認する。

NativeShell再ビルド不要（Web資産とViewDefのみ）。
