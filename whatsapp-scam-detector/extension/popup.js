// popup.js
const API_URL = 'https://YOUR-APP-NAME.onrender.com/health';

async function checkBackend() {
  const pill  = document.getElementById('api-status');
  const dot   = document.getElementById('api-dot');
  const text  = document.getElementById('api-text');

  try {
    const res  = await fetch(API_URL, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();

    pill.className  = 'status-pill online';
    dot.className   = 'dot pulse';
    text.textContent = `Online — ${data.model}`;
  } catch {
    pill.className  = 'status-pill offline';
    dot.className   = 'dot';
    text.textContent = 'Offline';
  }
}

// Pull scan stats stored by content.js via chrome.storage.session
function loadStats() {
  chrome.storage.session.get(['scamCount', 'totalCount'], (res) => {
    document.getElementById('scam-count').textContent  = res.scamCount  ?? 0;
    document.getElementById('total-count').textContent = res.totalCount ?? 0;
  });
}

document.getElementById('refresh-btn').addEventListener('click', checkBackend);

checkBackend();
loadStats();
