@echo off
setlocal enabledelayedexpansion

set "HERE=%~dp0"
set "EXE_PATH=%HERE%dist\headset_switcher.exe"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP%\Headset Switch.lnk"

if "%1"=="remove" goto :remove

echo ============================================
echo  Add Headset Switch to Windows startup
echo ============================================
echo.

if exist "%EXE_PATH%" (
    set "TARGET=%EXE_PATH%"
    set "ARGS="
    set "ICONPATH=%EXE_PATH%"
) else (
    echo [!] dist\headset_switcher.exe not found - using the Python script instead.
    echo     (Build the .exe first for a cleaner startup entry - see README.)
    set "TARGET=pythonw.exe"
    set "ARGS=\"%HERE%headset_switcher.py\""
    set "ICONPATH=%HERE%app.ico"
)

powershell -NoProfile -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%SHORTCUT%');" ^
  "$s.TargetPath = '%TARGET%';" ^
  "$s.Arguments = '%ARGS%';" ^
  "$s.WorkingDirectory = '%HERE%';" ^
  "$s.IconLocation = '%ICONPATH%';" ^
  "$s.Save()"

if errorlevel 1 (
    echo [!] Could not create the startup shortcut.
    pause
    exit /b 1
)

echo Done. Headset Switch will now start automatically with Windows.
echo (Run "add_to_startup.bat remove" to undo this.)
pause
exit /b 0

:remove
if exist "%SHORTCUT%" (
    del "%SHORTCUT%"
    echo Removed from Windows startup.
) else (
    echo It wasn't set to start with Windows.
)
pause
