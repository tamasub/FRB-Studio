# FRB Studio コンパクト化 / 独立幅管理 改修（2026-11-17）

## 適用元

`FRBStudio_App20261117_111344.zip` の内容を基準に作成した差分です。ZIP内の相対パスを維持して `FRBStudio_App` ルートに上書き展開してください。作業前に現在のフォルダーをバックアップしてください。

## 変更内容

### 1. 左サイドバーを省スペース化

- JSON Object Studio通常画面の左レールを非表示化し、メイン画面をフル幅利用します。
- `DATA JSON` / `画面定義JSON` / `読込` / `保存` を、上部のページバーへ移設しました。既存のinput/button IDを流用し、読み込み・保存・未保存警告・ファイルツリー選択の処理は継続利用します。
- ビジュアルのファイルDropエリアを撤去しました。下位のファイル入力は互換性のため非表示で保持します。
- JSONドキュメントメタの **文字数** を廃止。不要な全文JSON文字数計算も停止しました。
- **保存ファイル名** と **状態** は下部のコンパクトなステータス帯へ移設しました。
- `app.presentation.shell=minimal` の表示モードでは従来の専用表示/Save配置を維持します。
- Studio設定モードでは従来どおり変更不可のファイル選択やViewDefメンテ操作を抑止します。

### 2. ウィンドウサイズの記憶

- NativeShellの通常Studioの位置・サイズを `%LOCALAPPDATA%/FRBStudio/studio_window_bounds.json` に保存・復元します。
- Launch設定用の従来の `%LOCALAPPDATA%/FRBStudio/launcher_window_bounds.json` は独立したまま維持します。
- 画面外へ出てしまうウィンドウの復元防止、切断ディスプレイ/DPI変化へのクランプ処理を既存コードから再利用します。
- 最大化して閉じる場合は直前の通常サイズを保存します。今回の要求対象は**位置とサイズ**であり、最大化状態そのものは再現しません。
- **重要:** C#変更を反映させるため、Windows上で `cmd_compile_NativeShell.bat` を実行し、NativeShellを再ビルドしてください（net48対応の.NET SDKが必要です）。HTML/CSS/JSの上書きだけではウィンドウサイズ復元は反映されません。

### 3. 列幅を独立管理

| 対象 | ViewDef内の保存先 | 保存操作 |
| --- | --- | --- |
| Grid列幅 | `fields[].grid.width` | Grid列ヘッダードラッグ → 項目幅を保存 |
| Editor/Header/Detail幅 | `fields[].width` | Editor項目ドラッグ → 項目幅を保存 |
| Search | Studio標準幅 | 対象外 |

- どちらも数値px / `FULL` に対応します。
- 旧ViewDefで `fields[].width` しかない場合、Gridはそれを表示互換値として使用します。ただしGridを保存すると以降は `grid.width` に独立して保持します。
- 旧ViewDefで `grid.width` のみ存在するテキスト項目では、Grid幅保存時に旧Editor表示幅を `field.width` に退避し、編集画面が勝手に変わらないようにします。
- 2箇所を同時にドラッグした場合も変更案は別々に追跡し、保存時にそれぞれのViewDefプロパティへ記録します。
- ViewDefメンテ画面に `Editor項目幅(px/FULL)` と `Grid列幅(px/FULL)` を独立した編集可能項目として表示します。

## 回帰テスト

実行: `node --test tests/qa/static/*.test.mjs`

- 改修後: **639件中632件PASS / 7件FAIL**
- 添付元ZIP: **634件中627件PASS / 7件FAIL**
- 失敗7件の内容は添付元と同一で、今回の改修による新規失敗は検出していません。
- 追加の5件は、ツールバーIDとレイアウト/幅分離/旧ViewDef互換/標準とLaunchの境界を確認します。
- `node --check` で変更した JavaScript の構文検査済み。

## 実機での確認事項

1. DATA/画面定義をバーから選択 → 読込 → 詳細を開く → 保存。未保存警告、フォルダツリー選択が従来どおり動くか。
2. Grid列を大きく変更して保存しても、Editorの項目幅が変化しないこと。Editorで変更してもGrid幅が変わらないこと。再読込後も維持されること。
3. ウィンドウを好みのサイズ・位置へ変更 → 終了 → 再起動。通常Studio画面ではサイズ・位置が復元され、Launch設定画面側のサイズ履歴が変わらないこと。
4. 小型ウィンドウで候補ツリーが開き、上部バーのボタンが操作できること。

**未確認:** この実行環境ではWindows NativeShell（WinForms/WebView2）のコンパイルとGUI実機操作は行えません。実環境での最終確認が必要です。
