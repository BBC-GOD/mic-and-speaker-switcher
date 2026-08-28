// Headset Switch - background service worker
//
// Links this extension to the desktop app via its local API
// (http://127.0.0.1:47811, bound to localhost only). Polls for the
// currently-active headset and caches it in chrome.storage.local so:
//   - content.js can read the *exact* active device label (not just rely
//     on the browser's generic "default" sink)
//   - popup.js can show current status and trigger a switch
//
// If the desktop app isn't running, fetches just fail silently and the
// extension falls back to its old "default"-only behavior in content.js.

const API_BASE = "http://127.0.0.1:47811";
const POLL_MS = 2000;

async function pollStatus() {
  try {
    const res = await fetch(`${API_BASE}/status`, { cache: "no-store" });
    if (!res.ok) throw new Error("bad status");
    const data = await res.json();
    await chrome.storage.local.set({ headsetStatus: data, appOnline: true });
  } catch (err) {
    await chrome.storage.local.set({ appOnline: false });
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "switch") {
    const url = msg.headsetId ? `${API_BASE}/switch/${encodeURIComponent(msg.headsetId)}` : `${API_BASE}/switch`;
    fetch(url, { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        pollStatus(); // refresh cached status immediately after a switch
        sendResponse({ ok: true, data });
      })
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true; // keep the message channel open for the async response
  }
  if (msg?.type === "get_status") {
    chrome.storage.local.get("headsetStatus").then((res) => sendResponse(res.headsetStatus || null));
    return true;
  }
});

pollStatus();
setInterval(pollStatus, POLL_MS);
