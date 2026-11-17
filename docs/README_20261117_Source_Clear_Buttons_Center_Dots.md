# FRB Studio 改修差分 — 2026-11-17 11:53版ベース

## 対象

- DATA JSON / 画面定義JSONの選択をクリアする「×」ボタンが、ショートカットやURLから起動した直後に表示されない現象の修正
- ViewDefメンテナンス「…」ボタンの点を縦・横中央に整える

## 原因と対応

`HTMLInputElement.value = ...` という代入では `input` / `change` イベントが自動的に起きません。従来はこれらのイベントにだけ「×」の表示更新が紐づいていたため、NativeShellの起動引数やURL指定で読み込んだ際、ファイル名が表示されても×が隠れたままでした。

- `syncComboClearButtonStates()` を追加。DATA・ViewDefの入力欄の現在値から両方の×表示を再評価
- フォルダーボタン状態更新時と、JSON読み込み成功時に再評価
- 手入力・選択変更・クリア後の従来操作も維持
- ViewDef「…」文字の字形依存をやめ、CSS疑似要素で横一列の3点を中央描画（ARIAラベルと操作イベントは保持）
- CSS/JSのURLクエリを更新してキャッシュの旧版混入を避ける

## テスト

```powershell
node --test tests/test_studio_source_clear_buttons_20261117.mjs
python -m unittest discover -s tests -p 'test_studio_compact_source_buttons_and_spacing_20261117.py' -v
node --test tests/qa/static/native_startup_json.test.mjs tests/qa/static/studio_native_startup_splash_v03.test.mjs
```

- 新規テスト5件 PASS
- 既存ボタン配置テスト6件 PASS
- NativeShell起動系テスト6件 PASS
- 変更JSの構文検査 PASS

## 反映

Studioのルートフォルダーに差分ZIPをフォルダー構造ごと上書き。NativeShell（C#）の再ビルド不要。アプリを終了してから適用し再起動してください。

**未確認**：Windows 11実機のNativeShellでの目視確認とマウスクリック操作。
