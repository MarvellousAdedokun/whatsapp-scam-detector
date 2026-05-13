// WhatsApp Scam Detector — content.js
// Scans incoming messages on WhatsApp Web and flags scams inline

const API_URL   = 'https://YOUR-APP-NAME.onrender.com/predict';
const ATTR_DONE = 'data-scam-checked';   // prevent re-scanning same bubble

// ── Badge builder ──────────────────────────────────────────────
function createBadge(isScam, confidence) {
  const badge = document.createElement('div');
  badge.className = isScam ? 'wsd-badge wsd-scam' : 'wsd-badge wsd-safe';

  const pct = confidence ? Math.round(confidence * 100) : null;

  if (isScam) {
    badge.innerHTML = `
      <span class="wsd-icon">⚠️</span>
      <span class="wsd-label">Scam detected</span>
      ${pct ? `<span class="wsd-conf">${pct}% confidence</span>` : ''}
    `;
  } else {
    badge.innerHTML = `
      <span class="wsd-icon">✅</span>
      <span class="wsd-label">Safe</span>
      ${pct ? `<span class="wsd-conf">${pct}%</span>` : ''}
    `;
  }

  return badge;
}

// ── Scan a single message bubble ──────────────────────────────
async function scanBubble(bubble) {
  // Mark immediately so observer doesn't re-queue it
  bubble.setAttribute(ATTR_DONE, 'pending');

  // Extract visible text — WhatsApp stores it in a <span> with copyable text
  const textEl = bubble.querySelector('span.selectable-text span');
  if (!textEl) {
    bubble.setAttribute(ATTR_DONE, 'skip');
    return;
  }

  const message = textEl.innerText.trim();
  if (!message || message.length < 5) {
    bubble.setAttribute(ATTR_DONE, 'skip');
    return;
  }

  try {
    const res  = await fetch(API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ message })
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);
    const data = await res.json();

    bubble.setAttribute(ATTR_DONE, 'done');

    // Update stats in storage
    chrome.storage.session.get(['scamCount', 'totalCount'], (res) => {
      const total = (res.totalCount ?? 0) + 1;
      const scams = (res.scamCount  ?? 0) + (data.is_scam ? 1 : 0);
      chrome.storage.session.set({ totalCount: total, scamCount: scams });
    });

    // Only show badge for scams (or all messages if you want — toggle below)
    if (data.is_scam) {
      const badge = createBadge(true, data.confidence);
      bubble.appendChild(badge);
      bubble.classList.add('wsd-scam-bubble');
    }
    // Uncomment the lines below to also show a ✅ badge on safe messages:
    // else {
    //   bubble.appendChild(createBadge(false, data.confidence));
    // }

  } catch (err) {
    // Backend not reachable — mark as error so we don't loop
    bubble.setAttribute(ATTR_DONE, 'error');
    console.warn('[ScamDetector] API unreachable:', err.message);
  }
}

// ── Scan all unscanned bubbles currently in the DOM ───────────
function scanAll() {
  // WhatsApp message bubbles (incoming messages only — data-pre-plain-text
  // is present on incoming bubbles)
  const bubbles = document.querySelectorAll(
    `div.message-in:not([${ATTR_DONE}])`
  );
  bubbles.forEach(scanBubble);
}

// ── MutationObserver — watch for new messages ─────────────────
const observer = new MutationObserver(() => scanAll());

function startObserving() {
  // The chat pane — messages are rendered inside the main content area
  const target = document.querySelector('#main') || document.body;
  observer.observe(target, { childList: true, subtree: true });
  scanAll();   // scan whatever is already loaded
  console.log('[ScamDetector] Observing WhatsApp Web ✅');
}

// WhatsApp Web is a SPA and loads asynchronously — wait for the main panel
function waitForApp() {
  const check = setInterval(() => {
    if (document.querySelector('#main') || document.querySelector('[data-testid="conversation-panel-wrapper"]')) {
      clearInterval(check);
      startObserving();
    }
  }, 800);
}

waitForApp();
