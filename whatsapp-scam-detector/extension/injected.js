// injected.js — dynamically injected by background.js
(function() {
  // Prevent double injection
  if (window.__scamDetectorRunning) return;
  window.__scamDetectorRunning = true;

  const ATTR_DONE = 'data-scam-checked';

  function createBadge(isScam, confidence) {
    const badge = document.createElement('div');
    badge.className = isScam ? 'wsd-badge wsd-scam' : 'wsd-badge wsd-safe';
    const pct = confidence ? Math.round(confidence * 100) : null;
    badge.innerHTML = isScam
      ? `<span class="wsd-icon">⚠️</span><span class="wsd-label">Scam detected</span>${pct ? `<span class="wsd-conf">${pct}%</span>` : ''}`
      : `<span class="wsd-icon">✅</span><span class="wsd-label">Safe</span>`;
    return badge;
  }

  function scanBubble(bubble) {
    bubble.setAttribute(ATTR_DONE, 'pending');

    const spans  = bubble.querySelectorAll('span[data-testid="selectable-text"]');
    const textEl = spans[spans.length - 1];

    if (!textEl) { bubble.setAttribute(ATTR_DONE, 'skip'); return; }

    const message = textEl.innerText.trim();
    if (!message || message.length < 5) { bubble.setAttribute(ATTR_DONE, 'skip'); return; }

    chrome.runtime.sendMessage({ type: 'PREDICT', message }, (response) => {
      if (chrome.runtime.lastError) {
        bubble.setAttribute(ATTR_DONE, 'error');
        return;
      }
      bubble.setAttribute(ATTR_DONE, 'done');
      if (response && response.is_scam) {
        const container = bubble.querySelector('div.copyable-text') || bubble;
        container.appendChild(createBadge(true, response.confidence));
        bubble.classList.add('wsd-scam-bubble');
      }
    });
  }

  function scanAll() {
    document.querySelectorAll(`div.message-in:not([${ATTR_DONE}])`).forEach(scanBubble);
  }

  function startObserving() {
    const observer = new MutationObserver(scanAll);
    observer.observe(document.querySelector('#main') || document.body, { childList: true, subtree: true });
    scanAll();
    console.log('[ScamDetector] Running ✅');
  }

  function waitForApp() {
    const check = setInterval(() => {
      if (document.querySelector('div.message-in')) {
        clearInterval(check);
        startObserving();
      }
    }, 1000);
  }

  waitForApp();
})();
