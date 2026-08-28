const statusLine = document.getElementById("status-line");
const buttonsEl = document.getElementById("headset-buttons");
const offlineMsg = document.getElementById("offline-msg");

function render(status, online) {
  offlineMsg.style.display = online ? "none" : "block";
  buttonsEl.innerHTML = "";

  if (!online) {
    statusLine.textContent = "Offline";
    return;
  }
  if (!status || !status.configured) {
    statusLine.textContent = "Not set up yet";
    return;
  }

  const active = status.headsets.find((h) => h.id === status.active);
  statusLine.textContent = active ? `Active: ${active.label}` : "Active: unknown device";

  status.headsets.forEach((h) => {
    const btn = document.createElement("button");
    btn.textContent = h.label;
    btn.classList.toggle("active", h.id === status.active);
    if (h.id === status.active) {
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => doSwitch(h.id));
    }
    buttonsEl.appendChild(btn);
  });
}

async function refresh() {
  const { headsetStatus, appOnline } = await chrome.storage.local.get(["headsetStatus", "appOnline"]);
  render(headsetStatus, !!appOnline);
}

async function doSwitch(headsetId) {
  statusLine.textContent = "Switching…";
  [...buttonsEl.children].forEach((b) => (b.disabled = true));
  const res = await chrome.runtime.sendMessage({ type: "switch", headsetId });
  if (res && res.ok && res.data && res.data.success) {
    await refresh();
  } else {
    statusLine.textContent = "Switch failed";
    await refresh();
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.headsetStatus || changes.appOnline) refresh();
});

refresh();
