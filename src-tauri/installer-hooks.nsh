; NSIS installer hooks for TodoFloat
; Handles migration from the old Electron version to the new Tauri version.

!macro NSIS_HOOK_PREINSTALL
  ; Ensure no running instance blocks the uninstall (old Electron or new Tauri share the same exe name).
  nsExec::ExecToLog 'taskkill /F /IM TodoFloat.exe'
  Pop $0

  ; electron-builder registered the uninstaller under the appId (com.todofloat.app),
  ; while Tauri NSIS uses the productName (TodoFloat). Check the old key and run its
  ; uninstaller silently so the new install can take over the same directory.
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.todofloat.app" "UninstallString"
  ${If} $0 == ""
    ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.todofloat.app" "UninstallString"
  ${EndIf}
  ${If} $0 != ""
    DetailPrint "Found previous Electron installation, uninstalling silently..."
    ; _? makes ExecWait block until the uninstaller fully finishes (no temp-copy fork).
    ExecWait '"$0" /S _?=$INSTDIR'
    ; The old uninstaller may have removed $INSTDIR — recreate it for the new files.
    CreateDirectory "$INSTDIR"
  ${EndIf}
!macroend
