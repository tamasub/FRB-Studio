# Studio Family / Option Settings — 初期実装 v0.1

## 目的

FRB Launch の **System標準設定** と **Userが保存で引き受けた設定** を物理的に分離する。
Generic Editorは、合成データかどうか、どのファイルに保存するかを知らない。
**Editorの描画ロジックは `web/editor.js` の GenericEditor 1実装のみ**。設定カテゴリ別の分岐は持たず、Studio ViewDefのフィールド定義を利用する。

Studio本体の既存詳細Editorとは**一時的に二実装が共存**する。これは短期独立実証段階であり、Studio本体への共通コードの統合（養育費終了）は未実施。Studio本体に今回の画面用Editorをコピーしないこと。

## Data / ViewDef / 保存責務

| 層 | 物理配置 | 責務 |
|---|---|---|
| System設定 | `FRB_Launch/config/*.json` | 製品標準値・内部設定。既存Launcherの読み込み互換は保持 |
| System ViewDef | `FRB_Launch/defs/launch/options/*_view_def_v0_1.json` | 編集公開項目の宣言。追加すると自動で表示 |
| Options Registry | `FRB_Launch/defs/launch/options/options_registry.json` | 表示するカテゴリと対象ファイル・ViewDefの対応 |
| 合成くん | `options_core.mjs` | 公開項目だけをSystem→User優先で合成。読込のみ、書込禁止 |
| Generic Editor | `web/editor.js` | ViewDef準拠のHTML/CSS/JS編集UI。データの出所を知らない |
| 保存くん | `options_core.mjs` の `saveOptions` | 公開された項目**すべて**をUser JSONへ保存。Systemは書換禁止 |
| User設定 | `%LOCALAPPDATA%/FRBLaunch/UserConfig/*.json` | 保存成功時に初めて存在する。Updaterの置換対象外 |
| 実行時合成 | `%LOCALAPPDATA%/FRBLaunch/EffectiveOptions/*.json` | 一時生成物。ソースオブトゥルースではなく、削除しても再生成可能 |

### 所有権の境界

- ViewDefに存在しない項目は画面に表示されない。Userファイルにも保存されない。
- **ViewDefへ項目を追加しただけではUser JSONは変更しない**。System標準値を合成して表示する。
- **保存成功＝画面に表示された全項目の値をUser責任として確定**。System値と一致していても保存する。
- 非公開項目が古いUser JSONに残っていても、合成処理では採用しない。次回の保存で公開項目だけに正規化する。
- Editorの確定操作をせず画面を閉じてもUser JSONは作成されない。

## 初期公開範囲（意図的に2カテゴリだけ）

1. ブラウザー (`webview_settings.json`): `remember_login`, `new_tab_url`
2. ファイル検索 (`file_index_options.json`): `enabled`, `index_mode`, `index_folders`, `extensions`, `search_limit`, `update_mode`

`context_menu_options.json`, `expanded_view_options.json`, `log_retention_options.json` はSystem側のみ。`git_commit_options.json` は配布先のパス設定と既存Git選択UIの責務を整理するまで見送り。

## Windows起動

- Launchメニューの既存「メニュー設定 (FRB Studio)」の下に「オプション設定...」が追加される。
- 新しいオプション画面は Launch Qt Dialog に WebEngine を配置する。Node.jsサーバーはローカルの `127.0.0.1` の動的ポートにだけバインドし、画面を閉じると終了。
- `node.exe` は開発PCのPATH上、または `FRB_Launch/runtime/node/node.exe` に配置。
- 配布時は `launch/scripts/Prepare-OptionNodeRuntime.ps1 -NodeExecutable ... -NodeLicenseFile ...` を利用し、Node.js LICENSEも同梱。
- User保存済み項目は次回Launch起動時に、同じNode `options_core.mjs` を `cli.mjs` 経由で使用して合成する。Python側にJSONの独自合成ルールは持たない。
- Systemの標準ファイルは今回**書き換えていない**。現存する利用者固有のパス値をSystemファイルから将来の配布標準へ移す際は、明示的な移行とバックアップが必要。

## Nodeによるテスト

```powershell
cd F:\FRB_Apps\FRB_Studio
node --test tests/option_settings/*.test.mjs
```

Windows GUI（Qt／WebEngine）、Node未インストールの配布PC、Setup/UpdaterおよびStudio本体への統合は別途実機確認が必要。

## 2026-11-13 ViewDef所有権修正・ヘルプ

- ViewDefとOptions RegistryはLaunchが所有し、Studio Familyは共通Editor/Node Engineのコードだけを提供。
- `index_mode` の日本語ラベルは表示名のみ。保存する内部値は `registered` / `configured` / `off` のまま。
- 説明はStudio既存ViewDefの `type: textarea` + `readonly: true` + `edit.readonly: true` + `defaultValue` を使用。直前のselectの右に「？」を出し、開閉できる。
- 説明テキストは読み取り専用のViewDefデータで、System設定JSONにもUser JSONにも保存しない。
- 旧 `FRB_Studio/defs/launch/options/` と `tools/option_settings/options_registry.json` のコピーは参照しない。新配置が確認できたら旧コピーを削除する。
