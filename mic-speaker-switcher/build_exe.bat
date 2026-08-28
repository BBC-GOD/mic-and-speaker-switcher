@echo off
setlocal

echo ============================================
echo  Headset Switch - build EXE
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

REM --- 2. Install app + build dependencies -------------------------------
echo [1/3] Installing dependencies (pywebview, pyinstaller)...
pip install -r requirements.txt pyinstaller
if errorlevel 1 (
    echo [!] pip install failed. See the message above.
    pause
    exit /b 1
)

REM --- 3. Build the EXE ---------------------------------------------------
REM   --onefile        single .exe, no loose files next to it
REM   --windowed       no console window behind the app
REM   --icon           taskbar / file icon
REM   --add-data       bundles web/ (HTML+JS+CSS UI) inside the exe;
REM                    "web;web" -> unpacked to a "web" folder at runtime
echo.
echo [2/3] Building headset_switcher.exe (this can take a minute)...
pyinstaller --noconfirm --onefile --windowed ^
  --name "Headset Switch" ^
  --icon "app.ico" ^
  --add-data "web;web" ^
  --add-data "app.ico;." ^
  headset_switcher.py
if errorlevel 1 (
    echo [!] Build failed. See the message above.
    pause
    exit /b 1
)

REM --- 4. Done -------------------------------------------------------------
echo.
echo [3/3] Done!
echo Your EXE is at: dist\Headset Switch.exe
echo (You can delete the "build" folder and the .spec file - only "dist" matters.)
echo.
pause

endlocal
