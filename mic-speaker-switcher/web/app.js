const screens = {
  install: document.getElementById("install-screen"),
  setup: document.getElementById("setup-screen"),
  main: document.getElementById("main-screen"),
};

function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function api() {
  return window.pywebview.api;
}

function fillSelect(select, devices, selectedName) {
  select.innerHTML = "";
  if (!devices.length) {
    const opt = document.createElement("option");
    opt.textContent = "No devices found";
    select.appendChild(opt);
    return;
  }
  devices.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.Name;
    opt.textContent = d.Name;
    if (selectedName && d.Name.toLowerCase() === selectedName.toLowerCase()) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });
}

// ---- icon picker --------------------------------------------------------
// "letter" keeps the old A/B/C behavior; everything else shows an SVG icon
// on the pill instead. Kept as small inline SVGs (theme-colored via
// currentColor) so no image assets are needed.
const ICONS = {
  letter:   { name: "Letter (A, B, C…)", svg: null },
  headset:  { name: "Headset", svg: '<path d="M12 3a9 9 0 0 0-9 9v6a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5v-1a7 7 0 0 1 14 0v1h-2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1a3 3 0 0 0 3-3v-6a9 9 0 0 0-9-9Z"/>' },
  earbuds:  { name: "AirPods", svg: '<g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7.2 4.2c1.7 0 3 1.3 3 3v9.3a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2.1"/><ellipse cx="7.2" cy="7.2" rx="3" ry="3"/><path d="M16.8 4.2c-1.7 0-3 1.3-3 3v9.3a2 2 0 0 0 2 2 2 2 0 0 0 2-2v-2.1"/><ellipse cx="16.8" cy="7.2" rx="3" ry="3"/></g>' },
  gaming:   { name: "Gaming headset", svg: '<path d="M12 3a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5v-1a7 7 0 0 1 14 0v1h-2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h.5a5 5 0 0 1-3.9 1.9 1 1 0 1 0 0 2A7 7 0 0 0 20 17v-5a9 9 0 0 0-8-9Z"/>' },
  speaker:  { name: "Speaker", svg: '<rect x="6" y="2" width="12" height="20" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="8" r="2"/><circle cx="12" cy="16" r="3"/>' },
};

function fillIconSelect(select, selected) {
  select.innerHTML = "";
  Object.entries(ICONS).forEach(([key, def]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = def.name;
    if (key === selected) opt.selected = true;
    select.appendChild(opt);
  });
}

function pillContent(letter, iconKey) {
  const def = ICONS[iconKey];
  if (def && def.svg) {
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">${def.svg}</svg>`;
  }
  return letter;
}

// ---- setup screen: dynamic list of headsets --------------------------
let setupDevices = { playback: [], recording: [] };
const MIN_HEADSETS = 2;

function addHeadsetBlock(existing) {
  const list = document.getElementById("headset-list");
  const tpl = document.getElementById("headset-block-template");
  const node = tpl.content.firstElementChild.cloneNode(true);

  if (existing && existing.id) node.dataset.id = existing.id;
  node.querySelector(".block-label-text").textContent = `Headset ${list.children.length + 1}`;
  node.querySelector(".hs-label").value = (existing && existing.label) || "";
  fillSelect(node.querySelector(".hs-playback"), setupDevices.playback, existing && existing.playback);
  fillSelect(node.querySelector(".hs-recording"), setupDevices.recording, existing && existing.recording);
  fillIconSelect(node.querySelector(".hs-icon"), (existing && existing.icon) || "letter");

  node.querySelector(".remove-headset-btn").addEventListener("click", () => {
    node.remove();
    renumberHeadsetBlocks();
  });

  list.appendChild(node);
  renumberHeadsetBlocks();
}

function renumberHeadsetBlocks() {
  const list = document.getElementById("headset-list");
  const blocks = [...list.children];
  blocks.forEach((block, i) => {
    block.querySelector(".block-label-text").textContent = `Headset ${i + 1}`;
    block.querySelector(".remove-headset-btn").disabled = blocks.length <= MIN_HEADSETS;
  });
}

async function openSetup() {
  const [devices, cfg] = await Promise.all([api().get_devices(), api().get_config()]);
  setupDevices = devices;

  const list = document.getElementById("headset-list");
  list.innerHTML = "";
  const headsets = (cfg.headsets && cfg.headsets.length) ? cfg.headsets : [{}, {}];
  headsets.forEach((h) => addHeadsetBlock(h));

  document.getElementById("setup-status").textContent = "";
  showScreen("setup");
}

async function saveSetup() {
  const blocks = [...document.getElementById("headset-list").children];
  const headsets = blocks.map((block, i) => ({
    id: block.dataset.id || undefined,
    label: block.querySelector(".hs-label").value.trim() || `Headset ${i + 1}`,
    playback: block.querySelector(".hs-playback").value,
    recording: block.querySelector(".hs-recording").value,
    icon: block.querySelector(".hs-icon").value,
  }));

  const status = document.getElementById("setup-status");
  status.textContent = "Saving…";
  const res = await api().save_setup({ headsets });
  if (res.success) {
    await refreshMain();
    showScreen("main");
  } else {
    status.textContent = res.error || "Could not save.";
  }
}

function setToast(msg, isError) {
  const toast = document.getElementById("toast");
  if (!msg) {
    toast.classList.add("hidden");
    return;
  }
  toast.textContent = msg;
  toast.classList.toggle("error", !!isError);
  toast.classList.remove("hidden");
}

async function switchTo(headsetId) {
  // Kept for the Chrome extension bridge (Api.switch_to is still called
  // via the local HTTP API), but no longer wired to a click in the app's
  // own UI - only the dial switches now.
  const dial = document.getElementById("dial-btn");
  const icon = document.getElementById("dial-icon");
  icon.classList.add("spin");
  dial.classList.add("switching");
  setToast("");

  const res = await api().switch_to(headsetId);

  icon.classList.remove("spin");
  dial.classList.remove("switching");

  if (res.success) {
    await refreshMain();
  } else if (res.error === "not_found") {
    setToast(`${res.device} isn't connected right now.`, true);
  } else {
    setToast("Couldn't switch — try again.", true);
  }
}

async function refreshMain() {
  const status = await api().get_status();
  if (!status.configured) {
    return openSetup();
  }

  const nameEl = document.getElementById("active-name");
  const hintEl = document.getElementById("active-hint");
  const pills = document.getElementById("pills");

  const active = status.headsets.find((h) => h.id === status.active);
  nameEl.textContent = active ? active.label : "Unknown device active";
  hintEl.textContent = "Tap the dial to switch";

  pills.innerHTML = "";
  status.headsets.forEach((h, i) => {
    const pill = document.createElement("div");
    pill.className = "pill";
    pill.classList.toggle("active", h.id === status.active);
    pill.classList.toggle("missing", !h.present);
    pill.title = h.label;
    pill.innerHTML = pillContent(String.fromCharCode(65 + i), h.icon);
    pills.appendChild(pill);
  });

  setToast("");
  showScreen("main");
}

async function doSwitch() {
  const dial = document.getElementById("dial-btn");
  const icon = document.getElementById("dial-icon");
  icon.classList.add("spin");
  dial.classList.add("switching");
  setToast("");

  const res = await api().switch();

  // Hold the spin for the actual duration of the switch, not a guessed
  // timer, so the animation never looks like it "gave up" mid-call.
  icon.classList.remove("spin");
  dial.classList.remove("switching");

  if (res.success) {
    await refreshMain();
  } else if (res.error === "not_found") {
    setToast(`${res.device} isn't connected right now.`, true);
  } else {
    setToast("Couldn't switch — try again.", true);
  }
}

async function boot() {
  const modStatus = await api().module_status();
  if (!modStatus.installed) {
    showScreen("install");
    return;
  }
  await refreshMain();
}

window.addEventListener("pywebviewready", () => {
  document.getElementById("install-btn").addEventListener("click", async () => {
    const statusEl = document.getElementById("install-status");
    statusEl.textContent = "Installing… this can take a minute.";
    const res = await api().install_module();
    if (res.success) {
      statusEl.textContent = "Installed! Loading…";
      await refreshMain();
    } else {
      statusEl.textContent = "Install failed. See README for manual steps.";
    }
  });

  document.getElementById("save-setup-btn").addEventListener("click", saveSetup);
  document.getElementById("settings-btn").addEventListener("click", openSetup);
  document.getElementById("add-headset-btn").addEventListener("click", () => addHeadsetBlock());
  document.getElementById("dial-btn").addEventListener("click", doSwitch);
  document.getElementById("min-btn").addEventListener("click", () => api().minimize_window());
  document.getElementById("close-btn").addEventListener("click", () => api().close_window());

  boot();
});
