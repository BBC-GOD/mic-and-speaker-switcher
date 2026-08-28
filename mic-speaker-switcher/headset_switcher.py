"""
Headset Switch
--------------
A one-click Windows utility for people juggling two headsets: it flips the
default playback (speaker) AND recording (microphone) device at once, so you
never have to dig through Windows Sound settings again.

How device switching works:
  Windows itself has no supported command-line way to change the default
  audio device. This app shells out to the well-established, open-source
  PowerShell module "AudioDeviceCmdlets" (by frgnca), which wraps the
  underlying Windows Core Audio APIs safely. See README.md for install steps.

Run:
    pip install -r requirements.txt
    python headset_switcher.py
"""

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import webview

# APP_DIR: folder next to the script/exe, used for config.json (must stay
# writable and next to the real exe, not the PyInstaller temp folder).
APP_DIR = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))
# RES_DIR: where bundled resources (web/, app.ico) actually live. When
# running as a normal script this is the same as APP_DIR. When frozen by
# PyInstaller (--onefile), bundled --add-data files are unpacked to a temp
# dir at sys._MEIPASS instead, so we need to look there.
RES_DIR = getattr(sys, "_MEIPASS", APP_DIR)

CONFIG_PATH = os.path.join(APP_DIR, "config.json")
WEB_DIR = os.path.join(RES_DIR, "web")

# Local API the Chrome extension talks to. Fixed port so the extension's
# manifest can whitelist it as a host permission. Only bound to localhost.
API_PORT = 47811

NO_WINDOW = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0


def run_ps(command_text, timeout=15):
    """Run a single PowerShell -Command string. Returns (ok, stdout, stderr)."""
    try:
        result = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command_text],
            capture_output=True,
            text=True,
            timeout=timeout,
            creationflags=NO_WINDOW,
        )
        return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
    except FileNotFoundError:
        return False, "", "PowerShell was not found on this system."
    except subprocess.TimeoutExpired:
        return False, "", "PowerShell command timed out."
    except Exception as exc:  # pragma: no cover - defensive
        return False, "", str(exc)


def module_installed():
    ok, out, _ = run_ps(
        "if (Get-Module -ListAvailable -Name AudioDeviceCmdlets) { Write-Output 'yes' } "
        "else { Write-Output 'no' }"
    )
    return ok and out == "yes"


def list_devices():
    """Returns every playback + recording endpoint as a list of dicts."""
    ok, out, _ = run_ps(
        "Get-AudioDevice -List | Select-Object Index,Type,Name,Default,DefaultCommunication "
        "| ConvertTo-Json -Compress"
    )
    if not ok or not out:
        return []
    try:
        data = json.loads(out)
    except json.JSONDecodeError:
        return []
    if isinstance(data, dict):
        data = [data]
    return data


def find_by_name(devices, name, device_type):
    if not name:
        return None
    name_l = name.strip().lower()
    for d in devices:
        if d.get("Type") == device_type and (d.get("Name") or "").strip().lower() == name_l:
            return d
    return None


def set_default_pair(playback_index, recording_index):
    """Sets playback + recording as default for BOTH the regular
    (Console/Multimedia) role and the Communications role in a SINGLE
    PowerShell process. Browsers and call apps (Chrome, Teams, Discord,
    etc.) grab the mic/speaker via the Communications role during a call,
    so both roles must be set or they won't follow along.

    Batching every Set-AudioDevice call into one PowerShell invocation
    (instead of launching a new powershell.exe per call) is what removes
    the click-to-switch lag - each process launch has real startup cost."""
    commands = [f"Set-AudioDevice -Index {playback_index}",
                f"Set-AudioDevice -Index {playback_index} -CommunicationOnly"]
    if recording_index is not None:
        commands.append(f"Set-AudioDevice -Index {recording_index}")
        commands.append(f"Set-AudioDevice -Index {recording_index} -CommunicationOnly")
    ok, _, err = run_ps("; ".join(commands))
    return ok, err


def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def save_config_to_disk(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2)


def migrate_config(cfg):
    """Old config used a fixed headset_a/headset_b pair. Convert that to
    the new "headsets": [ {id,label,playback,recording}, ... ] list format
    so people upgrading don't lose their setup."""
    if "headsets" in cfg:
        for h in cfg["headsets"]:
            h.setdefault("icon", "letter")
        return cfg
    headsets = []
    for old_key, new_id in (("headset_a", "h1"), ("headset_b", "h2")):
        h = cfg.get(old_key)
        if h and h.get("playback") and h.get("recording"):
            headsets.append({
                "id": new_id,
                "label": h.get("label") or new_id,
                "playback": h["playback"],
                "recording": h["recording"],
                "icon": "letter",
            })
    if headsets:
        cfg["headsets"] = headsets
        last = cfg.get("last_active")
        if last == "a":
            cfg["last_active"] = "h1"
        elif last == "b":
            cfg["last_active"] = "h2"
    return cfg


def config_is_complete(cfg):
    headsets = cfg.get("headsets") or []
    if len(headsets) < 2:
        return False
    return all(h.get("playback") and h.get("recording") for h in headsets)


def current_active_id(cfg, devices):
    """Which configured headset (if any) is the current OS default."""
    current = next((d for d in devices if d.get("Type") == "Playback" and d.get("Default")), None)
    current_name = (current.get("Name") or "").strip().lower() if current else ""
    for h in cfg.get("headsets", []):
        if current_name == h["playback"].strip().lower():
            return h["id"]
    return None


def remember_active(headset_id):
    cfg = load_config()
    cfg["last_active"] = headset_id
    save_config_to_disk(cfg)


def restore_last_used():
    """Runs once at startup. Windows normally keeps whatever default device
    was set last, but if it ever falls back to something else (a driver
    reinstall, a new device appearing), silently re-apply whichever headset
    this app last switched to - so opening the app always shows, and is on,
    the headset you left it on."""
    cfg = migrate_config(load_config())
    if not config_is_complete(cfg):
        return
    last = cfg.get("last_active")
    headsets = cfg.get("headsets", [])
    target = next((h for h in headsets if h["id"] == last), None)
    if not target:
        return

    devices = list_devices()
    if current_active_id(cfg, devices) == last:
        return  # already correct, nothing to do

    target_playback = find_by_name(devices, target["playback"], "Playback")
    target_recording = find_by_name(devices, target["recording"], "Recording")
    if target_playback:
        set_default_pair(target_playback["Index"], target_recording["Index"] if target_recording else None)


class Api:
    """Exposed to the web UI as `window.pywebview.api.*`."""

    def __init__(self):
        self.window = None  # set by main() right after the window is created

    # ---- setup / onboarding -------------------------------------------------
    def module_status(self):
        return {"installed": module_installed()}

    def install_module(self):
        ok, out, err = run_ps(
            "Install-Module -Name AudioDeviceCmdlets -Scope CurrentUser -Force -AllowClobber",
            timeout=60,
        )
        return {"success": ok, "output": out, "error": err}

    def get_devices(self):
        devices = list_devices()
        return {
            "playback": [d for d in devices if d.get("Type") == "Playback"],
            "recording": [d for d in devices if d.get("Type") == "Recording"],
        }

    def get_config(self):
        return migrate_config(load_config())

    def save_setup(self, cfg):
        try:
            # cfg["headsets"] arrives from the JS side as a plain list of
            # {id?, label, playback, recording, icon}. Keep each headset's
            # id STABLE across saves (only assign a fresh one to entries
            # that don't already have one) - reassigning ids purely by
            # list position on every save was the bug that made a pill
            # sometimes point at the wrong headset after adding/reordering.
            existing_ids = {h.get("id") for h in load_config().get("headsets", [])}
            headsets = cfg.get("headsets", [])
            next_n = 1
            for i, h in enumerate(headsets, start=1):
                if not h.get("id"):
                    # find an id that isn't already used by another headset
                    while f"h{next_n}" in existing_ids or any(hh.get("id") == f"h{next_n}" for hh in headsets):
                        next_n += 1
                    h["id"] = f"h{next_n}"
                    next_n += 1
                h["label"] = (h.get("label") or "").strip() or f"Headset {i}"
                h["icon"] = h.get("icon") or "letter"
            save_config_to_disk({"headsets": headsets, "last_active": load_config().get("last_active")})
            return {"success": True}
        except OSError as exc:
            return {"success": False, "error": str(exc)}

    # ---- main screen ----------------------------------------------------
    def get_status(self):
        cfg = migrate_config(load_config())
        if not config_is_complete(cfg):
            return {"configured": False}

        devices = list_devices()
        active = current_active_id(cfg, devices)
        if active:
            remember_active(active)

        headsets = []
        for h in cfg["headsets"]:
            headsets.append({
                **h,
                "present": find_by_name(devices, h["playback"], "Playback") is not None,
            })

        return {
            "configured": True,
            "active": active,
            "headsets": headsets,
        }

    def switch(self):
        cfg = migrate_config(load_config())
        if not config_is_complete(cfg):
            return {"success": False, "error": "not_configured"}

        devices = list_devices()
        headsets = cfg["headsets"]
        active = current_active_id(cfg, devices)

        # Cycle to the next headset in the list (wraps around); if none is
        # currently recognized as active, just go to the first one.
        ids = [h["id"] for h in headsets]
        if active in ids:
            next_index = (ids.index(active) + 1) % len(headsets)
        else:
            next_index = 0
        target = headsets[next_index]
        return self._apply_switch(target)

    def switch_to(self, headset_id):
        """Switch directly to a specific headset (used when the user taps
        a specific pill instead of just cycling with the dial)."""
        cfg = migrate_config(load_config())
        if not config_is_complete(cfg):
            return {"success": False, "error": "not_configured"}

        target = next((h for h in cfg["headsets"] if h["id"] == headset_id), None)
        if not target:
            return {"success": False, "error": "not_found", "device": headset_id}
        return self._apply_switch(target)

    def _apply_switch(self, target):
        devices = list_devices()
        target_playback = find_by_name(devices, target["playback"], "Playback")
        target_recording = find_by_name(devices, target["recording"], "Recording")

        if not target_playback:
            return {"success": False, "error": "not_found", "device": target.get("label") or target["playback"]}

        ok, err = set_default_pair(
            target_playback["Index"],
            target_recording["Index"] if target_recording else None,
        )
        if not ok:
            return {"success": False, "error": "switch_failed", "detail": err}

        remember_active(target["id"])
        return {"success": True, "active": target["id"]}

    # ---- custom window chrome (the app is frameless; these replace the
    # OS titlebar buttons so the whole window is themed, no white OS bar) --
    def minimize_window(self):
        if self.window:
            self.window.minimize()

    def close_window(self):
        if self.window:
            self.window.destroy()


def api_status():
    """Same shape as Api.get_status(), usable from the HTTP server thread
    (no pywebview window object needed)."""
    cfg = migrate_config(load_config())
    if not config_is_complete(cfg):
        return {"configured": False}
    devices = list_devices()
    active = current_active_id(cfg, devices)
    if active:
        remember_active(active)
    return {
        "configured": True,
        "active": active,
        "headsets": cfg["headsets"],
    }


def api_switch(headset_id=None):
    """Same logic as Api.switch()/switch_to(), usable from the HTTP server
    thread. If headset_id is given, switches directly to it; otherwise
    cycles to the next headset after whichever is currently active."""
    cfg = migrate_config(load_config())
    if not config_is_complete(cfg):
        return {"success": False, "error": "not_configured"}

    headsets = cfg["headsets"]
    if headset_id:
        target = next((h for h in headsets if h["id"] == headset_id), None)
        if not target:
            return {"success": False, "error": "not_found", "device": headset_id}
    else:
        devices = list_devices()
        active = current_active_id(cfg, devices)
        ids = [h["id"] for h in headsets]
        next_index = (ids.index(active) + 1) % len(headsets) if active in ids else 0
        target = headsets[next_index]

    devices = list_devices()
    target_playback = find_by_name(devices, target["playback"], "Playback")
    target_recording = find_by_name(devices, target["recording"], "Recording")
    if not target_playback:
        return {"success": False, "error": "not_found", "device": target.get("label") or target["playback"]}

    ok, err = set_default_pair(target_playback["Index"], target_recording["Index"] if target_recording else None)
    if not ok:
        return {"success": False, "error": "switch_failed", "detail": err}

    remember_active(target["id"])
    return {"success": True, "active": target["id"]}


class _ApiRequestHandler(BaseHTTPRequestHandler):
    """Minimal local HTTP bridge for the Chrome extension. Bound to
    127.0.0.1 only - never reachable from the network. CORS is opened to
    chrome-extension:// origins so the extension's background script and
    popup can call it directly with fetch()."""

    def _send(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path == "/status":
            self._send(200, api_status())
        else:
            self._send(404, {"error": "not_found"})

    def do_POST(self):
        if self.path == "/switch":
            self._send(200, api_switch())
        elif self.path.startswith("/switch/"):
            headset_id = self.path[len("/switch/"):]
            self._send(200, api_switch(headset_id))
        else:
            self._send(404, {"error": "not_found"})

    def log_message(self, fmt, *args):  # silence default stderr logging
        pass


def start_api_server():
    server = ThreadingHTTPServer(("127.0.0.1", API_PORT), _ApiRequestHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return server


def main():
    # If we already know which headset was active last session, silently
    # re-apply it before the window even opens (handles Windows sometimes
    # falling back to a different default after a reboot or driver update).
    if module_installed():
        restore_last_used()

    start_api_server()

    api = Api()
    window = webview.create_window(
        "Headset Switch",
        os.path.join(WEB_DIR, "index.html"),
        js_api=api,
        width=380,
        height=580,
        resizable=False,
        background_color="#8F4A48",
        frameless=True,      # no OS titlebar - the app draws its own themed one
        easy_drag=True,      # Windows' WebView2 backend ignores the CSS
                              # `-webkit-app-region: drag` on .titlebar (that's
                              # a Chromium/GTK-webkit-only feature), so without
                              # this the frameless window can't be dragged at
                              # all on Windows. easy_drag uses pywebview's own
                              # native move handling instead.
    )
    api.window = window
    icon_path = os.path.join(RES_DIR, "app.ico")
    try:
        webview.start(icon=icon_path if os.path.exists(icon_path) else None)
    except TypeError:
        # Older pywebview versions don't accept `icon=` here - the exe's own
        # icon (set via PyInstaller --icon) still covers the taskbar/window.
        webview.start()


if __name__ == "__main__":
    main()
