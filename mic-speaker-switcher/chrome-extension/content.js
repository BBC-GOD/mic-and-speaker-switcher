// Headset Switch - Chrome companion
//
// What this can and can't do (browser platform limits, not a bug here):
//
// SPEAKER (output): real, live control. On every page we keep re-pointing
// every <audio>/<video> element to the OS default output device. When the
// desktop app is running and reachable (linked via background.js's local
// API poll), we target the *exact* active headset's output device by name
// so the match is precise; otherwise we fall back to setSinkId('default').
// This works even on a call that's already in progress - no refresh needed.
//
// MICROPHONE (input): Chrome has no API to swap the device on an already
//-open microphone stream. What we CAN do is make sure any *new*
// getUserMedia() call (i.e. the next time a site opens the mic - joining
// a call, refreshing, etc.) uses the current active input instead of
// whatever specific device the site asked for. So after switching
// headsets, output updates immediately; input updates the next time you
// (re)join a call.

(function () {
  "use strict";

  // ---- 0. Read the linked desktop app's status (label of active headset) --
  let activeLabel = null; // e.g. "Headset A" - matched against enumerateDevices() labels

  function refreshActiveLabel() {
    chrome.runtime.sendMessage({ type: "get_status" }, (status) => {
      if (chrome.runtime.lastError || !status || !status.configured) return;
      activeLabel = (status.headsets.find((h) => h.id === status.active) || {}).label || null;
    });
  }
  refreshActiveLabel();
  setInterval(refreshActiveLabel, 2000);

  async function resolveOutputDeviceId() {
    if (!activeLabel || !navigator.mediaDevices?.enumerateDevices) return "default";
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const match = devices.find(
        (d) => d.kind === "audiooutput" && d.label.toLowerCase().includes(activeLabel.toLowerCase())
      );
      return match ? match.deviceId : "default";
    } catch {
      return "default";
    }
  }

  // ---- 1. Force new mic requests toward the current OS default ----------
  const realGetUserMedia = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  if (realGetUserMedia) {
    navigator.mediaDevices.getUserMedia = function (constraints) {
      const patched = constraints ? { ...constraints } : {};
      if (patched.audio && typeof patched.audio === "object") {
        // Only override if the site pinned a specific device; leave other
        // audio constraints (echoCancellation, etc.) untouched.
        if (patched.audio.deviceId) {
          patched.audio = { ...patched.audio, deviceId: { ideal: "default" } };
        }
      } else if (patched.audio === true) {
        patched.audio = { deviceId: { ideal: "default" } };
      }
      return realGetUserMedia.call(navigator.mediaDevices, patched);
    };
  }

  // ---- 2. Keep existing/new audio+video elements on the active output -----
  async function routeToDefaultOutput(el) {
    if (typeof el.setSinkId !== "function") return; // not supported on this element/browser
    const targetId = await resolveOutputDeviceId();
    if (el.__headsetSwitchSinkApplied === targetId) return;
    el.setSinkId(targetId)
      .then(() => { el.__headsetSwitchSinkApplied = targetId; })
      .catch(() => { /* element not ready yet or permission not granted - retried on next pass */ });
  }

  function scan() {
    document.querySelectorAll("audio, video").forEach(routeToDefaultOutput);
  }

  const observer = new MutationObserver(scan);
  const start = () => {
    scan();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  // Re-check periodically too, in case the OS default changes while a call
  // is already open (i.e. you clicked the Headset Switch dial mid-call).
  setInterval(scan, 3000);
})();
