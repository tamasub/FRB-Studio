# Studio NativeShell: Launch 第3列収容前の画面非表示（2026-11-18）

基準 `FRBStudio_App20261118_184326.zip`。`NativeShell/NativeShellForm.cs` のみに本体変更。

Launch から `--launch-preview` で起動されたときのみ、デスクトップ上の 1500×950 フォームを透明な状態で初期化する。Launch 第3列がウィンドウを引き取り親子関係を確立した後、既存の専用パイプ経由の `@FRB_LAUNCH_DOCKED@` を受け付けて表示する。

収容に失敗した場合は表示状態を復旧。独立起動、明示的外出し、Launch終了後の未保存確認は従来の契約を維持する。

**必須:** Studio ソースへ上書き後、`tools/build/Build-NativeShell.ps1` で NativeShell を再ビルドし、Launch の参照先へ反映する。

Linux 上の C# ソース静的契約テスト10件PASS。WindowsのC#ビルドおよび実UI確認は未実施。
