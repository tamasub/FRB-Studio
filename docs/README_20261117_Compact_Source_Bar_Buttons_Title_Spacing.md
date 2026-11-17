# FRB Studio — コンパクト上部バー微調整（2026-11-17）

## 基準

`FRBStudio_App20261117_113250.zip` を展開した状態を基準にした差分。

## 変更点

1. DATA JSON: ラベル行右端にフォルダー（📁）→クリア（×）を移設。ファイル名入力欄の右端から移動。
2. 画面定義JSON (ViewDef): ラベル行右端に **… → 📁 → ×** の順で配置。
3. `JSON Object Studio` 見出しを従来の **16px**、アイコンを **24px** に戻す。
4. ファイル名欄を拡幅：DATAは基準幅 **190px**、ViewDefは **215px**（ウィンドウが狭い場合は縮小）。
5. `JSON Object Studio` 見出しとファイル選択欄の間に余白（基本 **20px**／やや狭い幅では **14px**）。
6. 上部の横幅が足りない場合は、ページ右側のアクション群が次の段へ回る。項目が画面外に切れないようにする。

## 注意

- 元の各ボタンIDとイベント処理は変更していない。
- 既存のファイル選択・保存・ViewDefメンテナンスの処理は変更していない。
- JSON Object Studio の通常画面に限定。Launchから開くminimalモードや他のStudio画面には適用しない。
- 今回は HTML/CSS のみの変更で、NativeShellの再ビルドは不要。

## 検証

- `python -m unittest discover -s tests -p 'test_studio_compact_source_buttons_and_spacing_20261117.py' -v`
- Windows実機での最終動作は未確認。
