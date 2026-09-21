/**
 * LeetMask - Popup Script
 * Manages universal protection toggles and custom access code.
 */

document.addEventListener('DOMContentLoaded', () => {
  const toggleEnabled = document.getElementById('toggleEnabled');
  const toggleAutoFullscreen = document.getElementById('toggleAutoFullscreen');
  const toggleUrl = document.getElementById('toggleUrl');
  const toggleSubmissions = document.getElementById('toggleSubmissions');
  const toggleFollowers = document.getElementById('toggleFollowers');
  const toggleAvatar = document.getElementById('toggleAvatar');
  const statusPill = document.getElementById('statusPill');
  const featuresList = document.getElementById('featuresList');

  // Custom Access Code elements
  const inputCustomCode = document.getElementById('inputCustomCode');
  const btnToggleCode = document.getElementById('btnToggleCode');
  const btnSaveCode = document.getElementById('btnSaveCode');
  const codeSaveMsg = document.getElementById('codeSaveMsg');

  const DEFAULT_SETTINGS = {
    enabled: true,
    autoFullscreen: false,
    maskUrl: true,
    maskSubmissions: true,
    maskFollowers: true,
    maskAvatar: true,
    maskTitle: true,
    accessCode: 'seno'
  };

  /**
   * Update the status pill in the header and visual states
   */
  function updateStatusPill(isEnabled) {
    const textEl = statusPill.querySelector('.status-text');
    if (isEnabled) {
      if (textEl) textEl.textContent = 'Active';
      else statusPill.textContent = 'Active';
      statusPill.classList.add('active');
    } else {
      if (textEl) textEl.textContent = 'Disabled';
      else statusPill.textContent = 'Disabled';
      statusPill.classList.remove('active');
    }

    if (featuresList) {
      featuresList.style.opacity = isEnabled ? '1' : '0.45';
      featuresList.style.pointerEvents = isEnabled ? 'auto' : 'none';
    }
  }

  /**
   * Send updated settings to active LeetCode tabs
   */
  function broadcastSettings(settings) {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;

    chrome.tabs.query({ url: ['*://*.leetcode.com/*', '*://*.leetcode.cn/*'] }, (tabs) => {
      if (chrome.runtime.lastError || !tabs) return;
      tabs.forEach((tab) => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'SETTINGS_UPDATED',
            settings
          }).catch(() => {
            // Tab might not be active or content script not ready
          });
        }
      });
    });
  }

  /**
   * Save settings and notify tabs
   */
  function saveAndApply() {
    const currentCode = (inputCustomCode && inputCustomCode.value.trim()) || 'seno';
    const settings = {
      enabled: toggleEnabled.checked,
      autoFullscreen: toggleAutoFullscreen ? toggleAutoFullscreen.checked : true,
      maskUrl: toggleUrl.checked,
      maskSubmissions: toggleSubmissions.checked,
      maskFollowers: toggleFollowers.checked,
      maskAvatar: toggleAvatar.checked,
      maskTitle: true,
      accessCode: currentCode
    };

    // Notify background to enter/exit fullscreen right away
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      if (settings.autoFullscreen) {
        chrome.runtime.sendMessage({ type: 'ENTER_FULLSCREEN' });
      } else {
        chrome.runtime.sendMessage({ type: 'EXIT_FULLSCREEN' });
      }
    }

    updateStatusPill(settings.enabled);

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(settings, () => {
        broadcastSettings(settings);
      });
    } else {
      broadcastSettings(settings);
    }
  }

  /**
   * Save custom access code
   */
  function saveCustomCode() {
    let code = (inputCustomCode && inputCustomCode.value.trim()) || '';
    if (!code) {
      code = 'seno';
      if (inputCustomCode) inputCustomCode.value = 'seno';
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ accessCode: code }, () => {
        broadcastSettings({ accessCode: code });
        showSaveFeedback('✓ Access code saved successfully!');
      });
    } else {
      showSaveFeedback('✓ Access code saved!');
    }
  }

  function showSaveFeedback(text) {
    if (!codeSaveMsg) return;
    codeSaveMsg.textContent = text;
    codeSaveMsg.className = 'code-save-msg success';
    setTimeout(() => {
      codeSaveMsg.textContent = '';
    }, 2500);
  }

  /**
   * Load saved settings on popup open
   */
  function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
        const settings = { ...DEFAULT_SETTINGS, ...items };
        toggleEnabled.checked = !!settings.enabled;
        if (toggleAutoFullscreen) toggleAutoFullscreen.checked = settings.autoFullscreen !== false;
        toggleUrl.checked = settings.maskUrl !== false;
        toggleSubmissions.checked = settings.maskSubmissions !== false;
        toggleFollowers.checked = settings.maskFollowers !== false;
        toggleAvatar.checked = settings.maskAvatar !== false;
        if (inputCustomCode) {
          inputCustomCode.value = settings.accessCode || 'seno';
        }
        updateStatusPill(settings.enabled);
      });
    } else {
      if (inputCustomCode) inputCustomCode.value = 'seno';
      updateStatusPill(true);
    }
  }

  // Toggle eye visibility
  if (btnToggleCode && inputCustomCode) {
    btnToggleCode.addEventListener('click', () => {
      const isPass = inputCustomCode.type === 'password';
      inputCustomCode.type = isPass ? 'text' : 'password';
    });
  }

  if (btnSaveCode) {
    btnSaveCode.addEventListener('click', saveCustomCode);
  }

  if (inputCustomCode) {
    inputCustomCode.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveCustomCode();
      }
    });
  }

  // Bind change events
  toggleEnabled.addEventListener('change', saveAndApply);
  if (toggleAutoFullscreen) toggleAutoFullscreen.addEventListener('change', saveAndApply);
  toggleUrl.addEventListener('change', saveAndApply);
  toggleSubmissions.addEventListener('change', saveAndApply);
  toggleFollowers.addEventListener('change', saveAndApply);
  toggleAvatar.addEventListener('change', saveAndApply);

  loadSettings();
});
