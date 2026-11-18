# FRB Studio NativeShell — Launchプレビューと単独起動のWebView2保存領域を分離

基準：`FRBStudio_App20261118_162102.zip`（2026-11-18）。

## 変更

NativeShellの既存単独起動プロファイル `%LOCALAPPDATA%/FRBStudio/WebView2` はそのまま保持。Launchの `--launch-preview` セッションのみ `WebView2_LaunchPreview` を使用する。

同時起動時に同じユーザーデータフォルダーを共有して初期化競合する可能性を減らす対策。単独起動時のエラー `HRESULT 0x8007139F` の原因は実機未検証につき確定していない。

C# NativeShellをビルドし直して適用すること。例：Studioルートから

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build/Build-NativeShell.ps1
```

`NativeShell/_publish` 内の成果物が実際の起動対象に反映されるようにする。従来のNativeShell.exeが残ったままでは今回のC#変更は反映されない。

## 維持条件

- メッセージパイプによる所有権の明示解放と未保存データ保護は変更なし。
- StudioデータJSON・画面定義・Obsidianには変更なし。
- エラー原因の確証とWin11上の再現検証は別途必要。
