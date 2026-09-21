/**
 * LeetMask - Background Service Worker
 * Automatically sets Chrome window to fullscreen when LeetCode is active,
 * hiding the native browser address bar so only our custom masked URL bar is visible.
 */

const LEETCODE_PATTERNS = [
  'leetcode.com',
  'leetcode.cn'
];

/**
 * Check if a URL belongs to LeetCode
 */
function isLeetCode(url) {
  if (!url) return false;
  return LEETCODE_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * Set window to fullscreen mode to hide native address bar
 */
function enterFullscreen(windowId) {
  chrome.windows.update(windowId, { state: 'fullscreen' }, () => {
    if (chrome.runtime.lastError) {
      console.warn('[LeetMask] Could not set fullscreen:', chrome.runtime.lastError.message);
    }
  });
}

/**
 * Restore window to normal mode
 */
function exitFullscreen(windowId) {
  chrome.windows.update(windowId, { state: 'maximized' }, () => {
    if (chrome.runtime.lastError) {
      chrome.windows.update(windowId, { state: 'normal' });
    }
  });
}

/**
 * Check if current window has a LeetCode tab as the active tab
 * and toggle fullscreen accordingly
 */
function handleTabChange(tabId, windowId, url) {
  chrome.storage.sync.get({ autoFullscreen: false }, (settings) => {
    if (!settings.autoFullscreen) return;

    if (isLeetCode(url)) {
      // Going to LeetCode → enter fullscreen
      chrome.windows.get(windowId, (win) => {
        if (chrome.runtime.lastError) return;
        if (win && win.state !== 'fullscreen') {
          enterFullscreen(windowId);
        }
      });
    } else {
      // Leaving LeetCode → restore normal window
      chrome.windows.get(windowId, (win) => {
        if (chrome.runtime.lastError) return;
        if (win && win.state === 'fullscreen') {
          // Only restore if no other LeetCode tab is active
          chrome.tabs.query({ windowId: windowId, active: true }, (activeTabs) => {
            const activeTab = activeTabs && activeTabs[0];
            if (!activeTab || !isLeetCode(activeTab.url || '')) {
              exitFullscreen(windowId);
            }
          });
        }
      });
    }
  });
}

// Listen for tab activation (user switches tabs)
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) return;
    handleTabChange(tab.id, tab.windowId, tab.url || tab.pendingUrl || '');
  });
});

// Listen for tab URL updates (navigation within same tab)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'loading') return;
  if (!tab.active) return;
  handleTabChange(tabId, tab.windowId, changeInfo.url || tab.url || '');
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'EXIT_FULLSCREEN') {
    chrome.windows.getCurrent((win) => {
      if (win) exitFullscreen(win.id);
    });
    sendResponse({ status: 'ok' });
  }

  if (msg && msg.type === 'ENTER_FULLSCREEN') {
    chrome.windows.getCurrent((win) => {
      if (win) enterFullscreen(win.id);
    });
    sendResponse({ status: 'ok' });
  }
});




