/**
 * background.js — handles tab reload requests from popup
 */

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["enabled", "mode"], (res) => {
    if (res.enabled === undefined) chrome.storage.local.set({ enabled: true });
    if (!res.mode)                 chrome.storage.local.set({ mode: "hybrid" });
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  // Reload the active tab (called by popup)
  if (msg.type === "RELOAD_TAB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.reload(tabs[0].id, {}, () => {
          sendResponse({ ok: true });
        });
      }
    });
    return true; // keep channel open for async
  }

  // Badge update from content.js
  if (msg.type === "AGGRESSIVE_FOUND") {
    chrome.storage.local.get("stat_aggressive", (res) => {
      const count = (res.stat_aggressive || 0);
      if (sender.tab) {
        chrome.action.setBadgeText({ text: count > 0 ? String(count) : "", tabId: sender.tab.id });
        chrome.action.setBadgeBackgroundColor({ color: "#e74c3c" });
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  // Clear badge
  if (msg.type === "CLEAR_BADGE") {
    if (sender.tab) chrome.action.setBadgeText({ text: "", tabId: sender.tab.id });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ text: "", tabId });
  }
});