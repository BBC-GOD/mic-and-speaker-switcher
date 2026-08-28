# Headset Switch

A one-click desktop app for people who swap between two headsets. Tap one
button and Windows' default speaker + microphone flip together, and (with
the optional Chrome piece below) Chrome follows along too.

## 1. Install Python (one-time)

If you don't already have it: download Python 3.10+ from
https://www.python.org/downloads/ and check **"Add python.exe to PATH"**
during install.

## 2. Install the app's dependencies

Open PowerShell in this folder and run:

```powershell
pip install -r requirements.txt
```

## 3. Run it

```powershell
python headset_switcher.py
```

The first time it runs, it will ask to install a small, open-source helper
module called **AudioDeviceCmdlets** (this is what actually talks to
Windows' audio system — there's no other supported way to do this from a
script). Click **Install helper** and approve any PowerShell prompt. If the
automatic install fails, run this once yourself in PowerShell:

```powershell
Install-Module -Name AudioDeviceCmdlets -Scope CurrentUser -Force -AllowClobber
```

(If PowerShell blocks script execution, run
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` first.)

## 4. Set up your two headsets

On first launch, pick the speaker and microphone for **Headset A** and
**Headset B** from the dropdowns (both headsets should be plugged in so
Windows lists them). Give each a nickname if you like. Click **Save**.

## 5. Use it

Tap the big dial. It flips your default speaker + microphone to the other
headset and remembers your choice — reopen the app (or reboot) and it
shows, and silently re-applies, whichever headset you had active last. The
two dots at the bottom show which is active; a dot turns red if that
headset currently isn't connected. Click the gear icon any time to
reassign devices.

## Build the standalone .exe (with the custom icon)

```powershell
pip install pyinstaller
pyinstaller --noconsole --onefile --icon=app.ico --add-data "web;web" --add-data "app.ico;." headset_switcher.py
```

The finished app lands at `dist\headset_switcher.exe` — this is what gives
you the custom taskbar/window icon and lets you run it without Python
installed. Running via `python headset_switcher.py` directly won't show the
custom icon (it'll use Python's icon instead).

## Run automatically at Windows startup

Build the .exe first (previous step), then double-click:

```
add_to_startup.bat
```

This drops a shortcut into your Windows Startup folder so the app launches
in the background every time you log in. To undo it later, run
`add_to_startup.bat remove`.

## Optional: make Chrome follow along too

Windows itself has no API that lets an app reach into Chrome and change
which device a call is using — this is a browser security boundary, not
something any desktop app can bypass. The included `chrome-extension`
folder gets as close as the browser allows:

- **Speaker/output**: switches live, even mid-call, no refresh needed.
- **Microphone/input**: Chrome cannot swap the device on a mic stream
  that's already open (no browser exposes that). It *will* pick up the new
  default the next time you join or rejoin a call on that page.

To install it:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `chrome-extension` folder.

That's it — no further setup. (Chrome extensions can't be silently
auto-installed by a desktop app; this manual one-time step is a browser
security requirement, not something this app can skip.)

### How it's linked to the desktop app

The desktop app runs a tiny local API on `http://127.0.0.1:47811` (only
reachable from your own machine). The extension polls it every couple of
seconds so it always knows which headset is currently active. This gives
you two things:

- The extension's toolbar popup shows the active headset and has its own
  **Switch headset** button — you can switch without opening the app.
- The content script can target your active headset's exact output device
  by name (instead of just the browser's generic "default" device), so the
  match is more precise.

The desktop app must be running for the extension to know the current
state or to switch on your behalf; if it's closed, the popup shows
"Offline" and the extension falls back to its old default-only behavior.

## Optional: build a standalone .exe

If you'd rather not keep Python installed just to run this, `build_exe.bat`
packages the app into a single `Headset Switch.exe` (via PyInstaller) that
runs on its own:

1. Double-click `build_exe.bat`.
2. Wait for it to finish — it installs PyInstaller, then builds the exe.
3. Grab `dist\Headset Switch.exe`. You can move that one file anywhere
   (e.g. `C:\Program Files\Headset Switch\`) — it doesn't need the rest of
   the source folder next to it. `config.json` will be created beside
   wherever you put the exe.
4. Optional: point `add_to_startup.bat` at the exe instead of
   `pythonw headset_switcher.py` if you want it to autostart.

You still need the AudioDeviceCmdlets PowerShell module installed once
(the exe's first-run screen will offer to install it, same as the Python
version).

## Notes

- Works on Windows 10/11 only (this relies on Windows' audio APIs).
- If a headset is renamed by its driver after a firmware/driver update,
  reopen settings (gear icon) and reselect it.
- Nothing here touches the cloud — device names and your two picks are
  stored locally in `config.json` next to the app.
