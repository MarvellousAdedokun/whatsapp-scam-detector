const API_URL      = 'https://whatsapp-scam-detector.onrender.com/predict';
const ATTR_DONE    = 'data-scam-checked';
const tabIntervals = {};

async function getUnscannedMessages(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (attr) => {
      // Find incoming messages by looking for tail-in SVG (only present on received messages)
      const tailIns = document.querySelectorAll('[data-testid="tail-in"]');
      const found = [];

      tailIns.forEach(tail => {
        // Walk up to the main message container
        const bubble = tail.closest('[data-testid^="conv-msg-"]');
        if (!bubble || bubble.hasAttribute(attr)) return;

        // Get the actual text - last selectable-text span that's not a quoted message
        const spans = bubble.querySelectorAll('span[data-testid="selectable-text"]');
        // Filter out quoted-mention spans (those are previews of replied messages)
        const textSpans = Array.from(spans).filter(s => !s.classList.contains('quoted-mention'));
        const textEl = textSpans[textSpans.length - 1];

        if (!textEl) { bubble.setAttribute(attr, 'skip'); return; }

        const text = textEl.innerText.trim();
        if (!text || text.length < 5) { bubble.setAttribute(attr, 'skip'); return; }

        bubble.setAttribute(attr, 'pending');
        found.push({
          id: bubble.getAttribute('data-testid'),
          text
        });
      });

      return found;
    },
    args: [ATTR_DONE]
  });
  return results[0]?.result || [];
}

async function injectBadge(tabId, msgTestId, isScam, confidence) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (testId, isScam, confidence, attr) => {
      const bubble = document.querySelector(`[data-testid="${testId}"]`);
      if (!bubble) return;
      bubble.setAttribute(attr, 'done');

      if (isScam) {
        const pct = confidence ? Math.round(confidence * 100) : null;
        const badge = document.createElement('div');
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin:4px 0 4px 10px;padding:4px 12px;background:#fff0f0;color:#c0392b;border:1.5px solid #e74c3c;border-radius:12px;font-size:12px;font-weight:700;font-family:sans-serif;';
        badge.innerHTML = `⚠️ Scam detected${pct ? ` · ${pct}%` : ''}`;
        bubble.style.outline = '2px solid #e74c3c';
        bubble.style.borderRadius = '8px';
        bubble.parentNode.insertBefore(badge, bubble.nextSibling);
      }
    },
    args: [msgTestId, isScam, confidence, ATTR_DONE]
  });
}

async function scanTab(tabId) {
  try {
    const messages = await getUnscannedMessages(tabId);
    for (const { id, text } of messages) {
      try {
        const res  = await fetch(API_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ message: text })
        });
        const data = await res.json();
        await injectBadge(tabId, id, data.is_scam, data.confidence);

        const stats = await chrome.storage.session.get(['scamCount', 'totalCount']);
        await chrome.storage.session.set({
          totalCount: (stats.totalCount ?? 0) + 1,
          scamCount:  (stats.scamCount  ?? 0) + (data.is_scam ? 1 : 0)
        });
      } catch(e) {}
    }
  } catch(e) {}
}

function startPolling(tabId) {
  if (tabIntervals[tabId]) clearInterval(tabIntervals[tabId]);
  tabIntervals[tabId] = setInterval(() => scanTab(tabId), 3000);
  setTimeout(() => scanTab(tabId), 2000);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.includes('web.whatsapp.com')) {
    setTimeout(() => startPolling(tabId), 2000);
  }
});

chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
  tabs.forEach(tab => setTimeout(() => startPolling(tab.id), 2000));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabIntervals[tabId]) clearInterval(tabIntervals[tabId]);
  delete tabIntervals[tabId];
});
