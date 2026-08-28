@echo off
setlocal

echo ============================================
echo  Headset Switch - one-time setup + launch
echo ============================================
echo.

REM --- 1. Check Python is installed -----------------------------------
where python >nul 2>nul
if errorlevel 1 (
    echo [!] Python was not found on PATH.
    echo     Install it from https://www.python.org/downloads/
    echo     and check "Add python.exe to PATH" during install, then re-run this file.
    pause
    exit /b 1
)

REM --- 2. Install Python dependencies ----------------------------------
echo [1/3] Installing Python dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo [!] pip install failed. See the message above.
    pause
    exit /b 1
)

REM --- 3. Install the AudioDeviceCmdlets PowerShell module -------------
echo.
echo [2/3] Checking Windows audio helper module...
powershell -NoProfile -Command ^
  "if (-not (Get-Module -ListAvailable -Name AudioDeviceCmdlets)) { Install-Module -Name AudioDeviceCmdlets -Scope CurrentUser -Force -AllowClobber }"
if errorlevel 1 (
    echo [!] Could not install AudioDeviceCmdlets automatically.
    echo     Run this once yourself in PowerShell, then re-run this file:
    echo     Install-Module -Name AudioDeviceCmdlets -Scope CurrentUser -Force -AllowClobber
    pause
    exit /b 1
)

REM --- 4. Launch the app -------------------------------------------------
echo.
echo [3/3] Launching Headset Switch...
start "" pythonw headset_switcher.py

endlocal
