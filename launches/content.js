/**
 * LeetMask - Universal Content Script
 * Disguises usernames, display names, followers, and code submissions with dots (••••••).
 * Works for ANY LeetCode account - auto-detects identity from URL, Next.js data, and DOM.
 */

(function () {
  'use strict';

  let currentPasscode = '';
  const DOTS_MASK = '••••••';
  const DOTS_SMALL = '•';

  // Starts empty – identity auto-detected universally for any logged-in account
  const targetNames = new Set();
  const pendingNodes = new Set();
  let isProcessing = false;

  const EXCLUDED_WORDS = new Set([
    'leetcode', 'problems', 'contest', 'discuss', 'interview', 'store',
    'explore', 'premium', 'solutions', 'submissions', 'rank', 'following',
    'followers', 'edit', 'profile', 'anonymous', 'accepted', 'wrong',
    'answer', 'runtime', 'memory', 'language', 'status', 'difficulty',
    'easy', 'medium', 'hard', 'code', 'description', 'editorial',
    'null', 'undefined', 'true', 'false', 'view', 'views', 'solution',
    'reputation', 'languages', 'skills', 'global', 'ranking', 'attended',
    'solved', 'attempting', 'recent', 'badge', 'badges', 'community', 'stats'
  ]);

  const DEFAULT_SETTINGS = {
    enabled: true,
    maskFollowers: true,
    maskSubmissions: true,
    maskAvatar: true,
    maskTitle: true
  };

  let currentSettings = { ...DEFAULT_SETTINGS };
  let isUnlocked = sessionStorage.getItem('lc_unlocked') === 'true';

  /**
   * Add a detected username or display name to target list
   */
  function addMaskTarget(name) {
    if (!name || typeof name !== 'string') return;
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 35) return;
    if (EXCLUDED_WORDS.has(clean.toLowerCase())) return;
    if (/^(https?:\/\/|\/)/.test(clean)) return;

    if (!targetNames.has(clean)) {
      targetNames.add(clean);
      saveTargetsToCache();
      if (!isUnlocked && document.body) {
        scanTree(document.body);
      }
    }
  }

  function saveTargetsToCache() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ cachedTargets: Array.from(targetNames) });
    }
  }

  function loadTargetsFromCache() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['cachedTargets'], (res) => {
        if (res && Array.isArray(res.cachedTargets)) {
          res.cachedTargets.forEach((t) => targetNames.add(t));
          if (!isUnlocked && document.body) {
            scanTree(document.body);
          }
        }
      });
    }
  }

/**
    * Detect username from URL without modifying browser history
    * Only runs on NON-profile pages (so we don't mask other users' profiles)
    */
   function detectFromUrl() {
     try {
       const path = window.location.pathname;
       // Skip profile pages (/u/username/) - we want to see other users' real names
       if (/^\/u\/[^/]+\/?$/i.test(path)) return;
       
       const match = path.match(/^(\/u\/)([^/]+)(\/.*)?$/i);
       if (match && match[2]) {
         const detectedHandle = match[2];
         if (!detectedHandle.startsWith('••') && !detectedHandle.startsWith('..')) {
           addMaskTarget(detectedHandle);
         }
       }
     } catch (e) {}
   }

  /**
   * Mask the browser's native address bar URL using history.replaceState.
   * Replaces /u/actualUsername/ → /u/user/ so even ESC from fullscreen
   * cannot reveal the real username in the address bar.
   */
  let _lastMaskedHref = '';
  function maskAddressBarUrl() {
    if (isUnlocked) return;
    if (!currentSettings.enabled) return;
    try {
      const href = window.location.href;
      if (href === _lastMaskedHref) return; // already masked this URL

      // Replace /u/<username> segment with /u/user
      const maskedPath = href.replace(
        /((?:https?:\/\/[^/]+)?)((?:\/u\/)[^/?#]+)/i,
        '$1/u/user'
      );
      if (maskedPath !== href) {
        _lastMaskedHref = maskedPath;
        history.replaceState(history.state, document.title, maskedPath);
      }
    } catch (e) {}
  }

  /**
   * Watch for SPA URL changes (Next.js doesn't fire popstate on pushState).
   * Uses title MutationObserver + popstate to detect navigation and re-mask.
   */
  let _urlWatcherLastPath = '';
  function startUrlWatcher() {
    // Re-apply on every popstate (back/forward)
    window.addEventListener('popstate', () => {
      setTimeout(maskAddressBarUrl, 50);
    });

    // Poll for path changes caused by Next.js client-side navigation
    setInterval(() => {
      const currentPath = window.location.pathname;
      if (currentPath !== _urlWatcherLastPath) {
        _urlWatcherLastPath = currentPath;
        maskAddressBarUrl();
      }
    }, 500);
  }

/**
    * Detect username & realName from Next.js Data
    * Only runs on NON-profile pages (so we don't mask other users' profiles)
    */
   function extractFromNextData() {
     // Skip profile pages (/u/username/) - we want to see other users' real names
     if (/^\/u\/[^/]+\/?$/i.test(window.location.pathname)) return;
     
     const nextScript = document.getElementById('__NEXT_DATA__');
    if (!nextScript) return;
    try {
      const data = JSON.parse(nextScript.textContent || '{}');
      function deepScan(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 8) return;
        for (const [k, v] of Object.entries(obj)) {
          const lk = k.toLowerCase();
          if (typeof v === 'string' && (lk === 'username' || lk === 'userslug' || lk === 'realname' || lk === 'userhandle')) {
            addMaskTarget(v);
          } else if (typeof v === 'object' && v !== null) {
            deepScan(v, depth + 1);
          }
        }
      }
      deepScan(data);
    } catch (e) {}
  }

/**
    * Detect display name from profile header DOM
    * Only runs on NON-profile pages (so we don't mask other users' profiles)
    */
   function extractFromProfileDom() {
     // Skip profile pages (/u/username/) - we want to see other users' real names
     if (/^\/u\/[^/]+\/?$/i.test(window.location.pathname)) return;
     
     const rankEl = Array.from(document.querySelectorAll('*')).find(el =>
       el.children.length === 0 && /^Rank\s+[\d,]+/i.test(el.textContent.trim())
     );

    if (rankEl) {
      const profileCard = rankEl.closest('div[class*="flex"], div');
      if (profileCard && profileCard.parentElement) {
        const headings = profileCard.parentElement.querySelectorAll('h1, h2, div, span');
        for (const h of headings) {
          const text = h.textContent.trim();
          if (text && h.children.length <= 1 && text.length >= 2 && text.length <= 35) {
            if (!text.startsWith('Rank') && !text.includes('Following') && !text.includes('Followers') && text !== 'Edit Profile') {
              addMaskTarget(text);
            }
          }
        }
      }
    }

    const navItems = document.querySelectorAll('.text-label-3, [class*="text-label-3"]');
    navItems.forEach(item => {
      const text = item.textContent.trim();
      if (text && text.length >= 2 && text.length <= 30 && !text.includes('\n')) {
        addMaskTarget(text);
      }
    });
  }

  /**
   * Mask title
   */
  function updateDocumentTitle() {
    if (!currentSettings.enabled || !currentSettings.maskTitle) return;
    if (isUnlocked) return;

    let title = document.title;
    targetNames.forEach(name => {
      if (name && title.includes(name)) {
        const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        title = title.replace(re, DOTS_MASK);
      }
    });
    title = title.replace(/^[^-]+(\s*-\s*LeetCode Profile)/i, `${DOTS_MASK}$1`);
    if (document.title !== title) {
      document.title = title;
    }
  }

/**
    * Mask Followers & Social Stats
    */
   function maskFollowers(root) {
     if (!currentSettings.enabled || !currentSettings.maskFollowers) return;
     if (isUnlocked) return;

     const candidates = root.querySelectorAll ?
       root.querySelectorAll('a[href*="following"], a[href*="followers"], [class*="follower"], [class*="following"], span, div, p, li, strong, b') : [];

     for (let i = 0; i < candidates.length; i++) {
       const el = candidates[i];
       if (el.children.length > 3) continue;
       const text = el.textContent || '';

       if (/\b\d+[\d,]*\s*(Following|Followers?)\b/i.test(text)) {
         if (!el.getAttribute('data-lc-follower-masked')) {
           el.setAttribute('data-lc-follower-orig', text);
           el.setAttribute('data-lc-follower-masked', 'true');
           el.innerHTML = text.replace(/(\d+[\d,]*)\s*(Following|Followers?)/gi, `${DOTS_SMALL} $2`);
         }
       }
     }
   }

  function shouldSkip(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return true;
    if (el.id === 'lc-codebar-host' || el.closest('#lc-codebar-host')) return true;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'TEXTAREA' || tag === 'INPUT') {
      return true;
    }
    if (el.classList && (el.classList.contains('monaco-editor') || el.classList.contains('view-lines'))) {
      return true;
    }
    return false;
  }

  /**
   * Process individual element against all detected targets
   */
  function processElement(el) {
    if (shouldSkip(el)) return;

    if (isUnlocked) return;

    // Mask Avatar (universal: any /u/<username> link)
    if (currentSettings.maskAvatar) {
      if (el.tagName === 'A') {
        const href = el.getAttribute('href') || '';
        // Check if link points to any user profile (/u/<anything>)
        const isUserLink = /^\/u\/[^/]+/i.test(href);
        if (isUserLink) {
          const img = el.querySelector('img, svg');
          if (img) img.classList.add('lc-masked-avatar');
        }
      }
      if (el.classList && (el.classList.contains('rounded-full') || el.getAttribute('data-placeholder') === 'avatar')) {
        if (el.closest('header, nav, [class*="profile"]')) {
          el.classList.add('lc-masked-avatar');
        }
      }
    }

    // Mask Links
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      targetNames.forEach(name => {
        if (href.toLowerCase().includes(`/u/${name.toLowerCase()}`)) {
          el.classList.add('lc-masked-link');
          el.setAttribute('title', '');
        }
      });
    }

    // Exact text match on leaf elements (like profile heading or navbar username)
    const trimmed = el.textContent ? el.textContent.trim() : '';
    targetNames.forEach(name => {
      if (trimmed.toLowerCase() === name.toLowerCase() && el.children.length === 0) {
        if (!el.getAttribute('data-lc-masked')) {
          el.setAttribute('data-lc-orig', el.textContent);
          el.setAttribute('data-lc-masked', 'true');
          el.classList.add('lc-masked-dots');
          el.textContent = DOTS_MASK;
        }
      }
    });

    // Submissions and composite text nodes
    if (el.childNodes && el.childNodes.length > 0) {
      for (let i = 0; i < el.childNodes.length; i++) {
        const node = el.childNodes[i];
        if (node.nodeType === Node.TEXT_NODE) {
          const val = node.nodeValue;
          if (!val) continue;

          targetNames.forEach(name => {
            if (val.toLowerCase().includes(name.toLowerCase())) {
              const safeRegex = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
              const parent = el;
              if (parent && !parent.classList.contains('lc-masked-dots')) {
                node.nodeValue = val.replace(safeRegex, DOTS_MASK);
              }
            }
          });
        }
      }
    }
  }

  /**
   * Unmask all elements when unlocked
   */
  function unmaskAll() {
    const maskedElements = document.querySelectorAll('[data-lc-masked="true"]');
    maskedElements.forEach(el => {
      const orig = el.getAttribute('data-lc-orig');
      if (orig !== null) {
        el.textContent = orig;
      }
      el.removeAttribute('data-lc-masked');
      el.classList.remove('lc-masked-dots');
    });

    const followerMasked = document.querySelectorAll('[data-lc-follower-masked="true"]');
    followerMasked.forEach(el => {
      const orig = el.getAttribute('data-lc-follower-orig');
      if (orig !== null) {
        el.innerHTML = orig;
      }
      el.removeAttribute('data-lc-follower-masked');
    });

    const avatars = document.querySelectorAll('.lc-masked-avatar');
    avatars.forEach(el => el.classList.remove('lc-masked-avatar'));
  }

  function scanSubmissions(root) {
    if (!currentSettings.enabled || !currentSettings.maskSubmissions) return;
    if (isUnlocked) return;

    const submissionNodes = root.querySelectorAll ?
      root.querySelectorAll('[class*="submission"], [data-row-key], [class*="result"], tr, [class*="Submission"], [class*="status"], td[data-label], [class*="history"]') : [];

    for (let i = 0; i < submissionNodes.length; i++) {
      processElement(submissionNodes[i]);
    }
  }

  function scanTree(root) {
    if (!root || shouldSkip(root)) return;
    
    detectFromUrl();
    extractFromProfileDom();
    extractFromNextData();

    if (!isUnlocked) {
      maskFollowers(root);
      scanSubmissions(root);
      processElement(root);

      if (root.querySelectorAll) {
        const candidates = root.querySelectorAll('div, span, p, h1, h2, h3, h4, a, td, th');
        for (let i = 0; i < candidates.length; i++) {
          processElement(candidates[i]);
        }
      }
      updateDocumentTitle();
      maskAddressBarUrl();
    }
  }

  function processQueue() {
    if (pendingNodes.size === 0) {
      isProcessing = false;
      return;
    }

    const nodes = Array.from(pendingNodes);
    pendingNodes.clear();

    for (const node of nodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        scanTree(node);
      } else if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
        processElement(node.parentNode);
      }
    }

    isProcessing = false;
  }

  function enqueueNodes(nodes) {
    for (const node of nodes) {
      pendingNodes.add(node);
    }
    if (!isProcessing) {
      isProcessing = true;
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(processQueue);
      } else {
        setTimeout(processQueue, 16);
      }
    }
  }

  function initObserver() {
    const observer = new MutationObserver(mutations => {
      const added = [];
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'childList' && m.addedNodes.length > 0) {
          for (let j = 0; j < m.addedNodes.length; j++) {
            added.push(m.addedNodes[j]);
          }
        } else if (m.type === 'characterData') {
          added.push(m.target);
        }
      }
      if (added.length > 0) {
        enqueueNodes(added);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // =========================================================================
  // Top Simulated URL & Access Code Bar (seno)
  // =========================================================================
  function createCodeBar() {
    if (document.getElementById('lc-top-bar-host')) return;

    document.documentElement.classList.add('lc-bar-active');

    const host = document.createElement('div');
    host.id = 'lc-top-bar-host';

    function renderBar() {
      const displayUrl = isUnlocked ?
        (window.location.origin + window.location.pathname) :
        'https://leetcode.com/u/••••••/';

      if (isUnlocked) {
        host.innerHTML = `
          <div class="lc-top-url-box">
            <svg class="lc-lock-icon" style="color: #10b981;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
            </svg>
            <span class="lc-url-text">${displayUrl}</span>
            <span class="lc-f11-hint">F11: Fullscreen</span>
          </div>
          <div class="lc-top-code-box">
            <span class="lc-status-label lc-unlocked">🔓 Unlocked</span>
            <button class="lc-top-btn lc-btn-lock" id="lc-lock-btn">Lock 🔒</button>
          </div>
        `;
        const lockBtn = host.querySelector('#lc-lock-btn');
        if (lockBtn) {
          lockBtn.addEventListener('click', () => {
            isUnlocked = false;
            sessionStorage.removeItem('lc_unlocked');
            renderBar();
            if (document.body) scanTree(document.body);
          });
        }
      } else {
        host.innerHTML = `
          <div class="lc-top-url-box">
            <svg class="lc-lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span class="lc-url-text">
              <span class="lc-url-protocol">https://</span><span class="lc-url-domain">leetcode.com</span>/u/<span class="lc-url-dots">••••••</span>/
            </span>
            <span class="lc-f11-hint" title="Press F11 to hide browser address bar">F11: Fullscreen</span>
          </div>
          <div class="lc-top-code-box">
            <span class="lc-status-label">🔒 Protected</span>
            <input type="password" class="lc-top-input" id="lc-code-input" placeholder="Enter access code..." autocomplete="off" />
            <button class="lc-top-btn" id="lc-unlock-btn">Unlock</button>
          </div>
        `;

        const input = host.querySelector('#lc-code-input');
        const unlockBtn = host.querySelector('#lc-unlock-btn');

        function attemptUnlock() {
          if (!input) return;
          const val = input.value.trim().toLowerCase();
          if (val === currentPasscode.toLowerCase()) {
            isUnlocked = true;
            sessionStorage.setItem('lc_unlocked', 'true');
            unmaskAll();
            renderBar();
          } else {
            input.classList.add('error');
            input.value = '';
            input.placeholder = 'Incorrect code!';
            setTimeout(() => {
              input.classList.remove('error');
              input.placeholder = 'Enter access code...';
            }, 1500);
          }
        }

        if (unlockBtn) unlockBtn.addEventListener('click', attemptUnlock);
        if (input) {
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') attemptUnlock();
          });
        }
      }
    }

    renderBar();
    (document.body || document.documentElement).appendChild(host);
  }

  function initMessageListener() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg && msg.type === 'SETTINGS_UPDATED') {
          currentSettings = { ...currentSettings, ...msg.settings };
          if (msg.settings && msg.settings.accessCode) {
            currentPasscode = msg.settings.accessCode.trim();
          }
          if (!isUnlocked && document.body) {
            scanTree(document.body);
          }
          sendResponse({ status: 'ok' });
        }
      });
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.accessCode && changes.accessCode.newValue) {
          currentPasscode = changes.accessCode.newValue.trim();
        }
      });
    }
  }

  function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['accessCode', ...Object.keys(DEFAULT_SETTINGS)], items => {
        currentSettings = { ...DEFAULT_SETTINGS, ...items };
        if (items && items.accessCode) {
          currentPasscode = items.accessCode.trim();
        }
        if (!isUnlocked && document.body) {
          scanTree(document.body);
        }
      });
    }
  }

  // --- Startup Execution ---
  loadTargetsFromCache();
  loadSettings();
  initObserver();
  initMessageListener();
  startUrlWatcher();

  detectFromUrl();
  maskAddressBarUrl();   // Mask address bar immediately on inject
  extractFromNextData();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createCodeBar();
      detectFromUrl();
      maskAddressBarUrl();
      extractFromProfileDom();
      scanTree(document.body);
    });
  } else {
    createCodeBar();
    detectFromUrl();
    maskAddressBarUrl();
    extractFromProfileDom();
    scanTree(document.body);
  }
})();
