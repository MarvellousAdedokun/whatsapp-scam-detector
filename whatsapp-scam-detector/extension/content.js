// content.js — runs in ISOLATED world, chrome.runtime IS available here
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

async function scanBubble(bubble) {
  bubble.setAttribute(ATTR_DONE, 'pending');

  const spans  = bubble.querySelectorAll('span[data-testid="selectable-text"]');
  const textEl = spans[spans.length - 1];

  if (!textEl) { bubble.setAttribute(ATTR_DONE, 'skip'); return; }

  const message = textEl.innerText.trim();
  if (!message || message.length < 5) { bubble.setAttribute(ATTR_DONE, 'skip'); return; }

  // Check chrome.runtime is still valid before using it
  if (!chrome?.runtime?.id) {
    bubble.setAttribute(ATTR_DONE, 'error');
    return;
  }

  chrome.runtime.sendMessage({ type: 'PREDICT', message }, (response) => {
    if (chrome.runtime.lastError) {
      bubble.setAttribute(ATTR_DONE, 'error');
      console.warn('[ScamDetector]', chrome.runtime.lastError.message);
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
  // Only scan if extension context is still valid
  if (!chrome?.runtime?.id) return;
  document.querySelectorAll(`div.message-in:not([${ATTR_DONE}])`).forEach(scanBubble);
}

let observer = null;

function startObserving() {
  observer = new MutationObserver(scanAll);
  observer.observe(document.querySelector('#main') || document.body, { childList: true, subtree: true });
  scanAll();
}

function waitForApp() {
  const check = setInterval(() => {
    if (!chrome?.runtime?.id) { clearInterval(check); return; }
    if (document.querySelector('div.message-in')) {
      clearInterval(check);
      startObserving();
    }
  }, 1000);
}

waitForApp();
