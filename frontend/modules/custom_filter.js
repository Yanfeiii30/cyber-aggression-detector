/**
 * modules/custom_filter.js
 * Manages user-defined custom keywords.
 * Any text containing these words is immediately flagged as aggressive.
 */

const CustomFilter = (() => {
  let _keywords = [];

  async function load() {
    return new Promise((resolve) => {
      chrome.storage.local.get("custom_keywords", (result) => {
        _keywords = result.custom_keywords || [];
        resolve(_keywords);
      });
    });
  }

  /** Returns true if text contains any custom keyword */
  function matches(text) {
    const lower = text.toLowerCase();
    return _keywords.some(kw => lower.includes(kw.toLowerCase()));
  }

  async function add(keyword) {
    keyword = keyword.trim().toLowerCase();
    if (keyword && !_keywords.includes(keyword)) {
      _keywords.push(keyword);
      await _save();
    }
  }

  async function remove(keyword) {
    _keywords = _keywords.filter(k => k !== keyword.toLowerCase());
    await _save();
  }

  function getAll() {
    return [..._keywords];
  }

  function _save() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ custom_keywords: _keywords }, resolve);
    });
  }

  // Sync when changed from popup
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.custom_keywords) {
      _keywords = changes.custom_keywords.newValue || [];
    }
  });

  return { load, matches, add, remove, getAll };
})();