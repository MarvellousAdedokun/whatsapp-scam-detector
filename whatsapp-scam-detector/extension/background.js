const API_URL      = 'https://whatsapp-scam-detector.onrender.com/predict';
const FEEDBACK_URL = 'https://whatsapp-scam-detector.onrender.com/feedback';
const ATTR_DONE    = 'data-scam-checked';
const tabIntervals = {};

async function getTesterID() {
  const r = await chrome.storage.local.get(['testerID']);
  if (r.testerID) return r.testerID;
  const id = 'tester_' + Math.random().toString(36).substring(2, 10);
  await chrome.storage.local.set({ testerID: id });
  return id;
}

async function getUnscannedMessages(tabId) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (attr) => {
      const tailIns = document.querySelectorAll('[data-testid="tail-in"]');
      const found = [];
      tailIns.forEach(tail => {
        const bubble = tail.closest('[data-testid^="conv-msg-"]');
        if (!bubble || bubble.hasAttribute(attr)) return;
        const spans = bubble.querySelectorAll('span[data-testid="selectable-text"]');
        const textSpans = Array.from(spans).filter(s => !s.classList.contains('quoted-mention'));
        const textEl = textSpans[textSpans.length - 1];
        if (!textEl) { bubble.setAttribute(attr, 'skip'); return; }
        const text = textEl.innerText.trim();
        if (!text || text.length < 5) { bubble.setAttribute(attr, 'skip'); return; }
        bubble.setAttribute(attr, 'pending');
        found.push({ id: bubble.getAttribute('data-testid'), text });
      });
      return found;
    },
    args: [ATTR_DONE]
  });
  return results[0]?.result || [];
}

async function injectResult(tabId, msgTestId, isScam, confidence, predId, message, testerID) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (testId, isScam, confidence, predId, message, testerID, attr, feedbackUrl) => {
      const bubble = document.querySelector(`[data-testid="${testId}"]`);
      if (!bubble) return;
      bubble.setAttribute(attr, 'done');

      const pct = confidence ? Math.round(confidence * 100) : null;
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'margin:4px 0 4px 10px;font-family:sans-serif;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';

      if (isScam) {
        const badge = document.createElement('div');
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:4px 12px;background:#fff0f0;color:#c0392b;border:1.5px solid #e74c3c;border-radius:12px;font-size:12px;font-weight:700;';
        badge.innerHTML = `⚠️ Scam detected${pct ? ` · ${pct}%` : ''}`;
        wrapper.appendChild(badge);
        bubble.style.outline = '2px solid #e74c3c';
        bubble.style.borderRadius = '8px';
      } else {
        const badge = document.createElement('div');
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:#f0fff4;color:#27ae60;border:1px solid #27ae60;border-radius:10px;font-size:11px;';
        badge.innerHTML = '✅ Safe';
        wrapper.appendChild(badge);
      }

      // Feedback buttons
      const fb = document.createElement('div');
      fb.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';
      fb.innerHTML = `
        <span style="font-size:11px;color:#8b949e;">Correct?</span>
        <button data-fb="yes" style="background:#e8f5e9;border:1px solid #27ae60;border-radius:8px;padding:2px 8px;font-size:11px;cursor:pointer;color:#27ae60;">👍 Yes</button>
        <button data-fb="no" style="background:#fff0f0;border:1px solid #e74c3c;border-radius:8px;padding:2px 8px;font-size:11px;cursor:pointer;color:#c0392b;">👎 No</button>
      `;

      fb.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const wasCorrect   = btn.dataset.fb === 'yes';
          const correctLabel = wasCorrect ? (isScam ? 'scam' : 'not_scam') : (isScam ? 'not_scam' : 'scam');
          fetch(feedbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: predId, tester_id: testerID, message, correct_label: correctLabel, was_correct: wasCorrect })
          });
          fb.innerHTML = '<span style="font-size:11px;color:#8b949e;">Thanks! 🙏</span>';
        });
      });

      wrapper.appendChild(fb);
      bubble.parentNode.insertBefore(wrapper, bubble.nextSibling);
    },
    args: [msgTestId, isScam, confidence, predId, message, testerID, ATTR_DONE, FEEDBACK_URL]
  });
}

async function scanTab(tabId) {
  try {
    const testerID = await getTesterID();
    const messages = await getUnscannedMessages(tabId);
    for (const { id, text } of messages) {
      try {
        const res  = await fetch(API_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, tester_id: testerID })
        });
        const data = await res.json();
        await injectResult(tabId, id, data.is_scam, data.confidence, data.id, text, testerID);
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
