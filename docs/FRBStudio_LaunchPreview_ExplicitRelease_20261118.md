# FRB Studio NativeShell / Launch第3列外出し（2026-11-18）

基準: `FRBStudio_App20261118_152437.zip`。Launch と同時に適用する差分。

`NativeShell/NativeShellForm.cs` に Launch が発行する専用パイプ命令 `@FRB_LAUNCH_RELEASE@` を追加。Studio自身が所有関係の解除を承認した場合にだけ `OK` を返し、その後は Launch が終了しても Studio を閉じない。これにより、Launch側が `AttachedStudioWindow.detach(foreground=True, show_window=True)` で単独ウィンドウに復元した編集セッションを維持できる。

- 保存済みファイルやアプリのユーザー設定は変更しない。
- 既存の `@FRB_LAUNCH_CLOSE@`、未保存確認、異常終了時のDirty保護は維持。
- Studioの編集中の内容は外出し時には保存しない（WebView2セッションを保持）。

## 適用と再ビルド（必須）

Studioの対応する相対パスへ差分ZIPを上書きしたあと、Studioルートで:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build/Build-NativeShell.ps1
```

成果物は `NativeShell/_publish/FRBStudio.NativeShell.exe`。Launchはこのパスの実行ファイルを使う。Launch側差分も必ず同時に適用すること。

Node静的契約テストは7件PASS。C#コンパイル・Windows実機動作は未確認。
