// JARVIS Memory Sync — Content Script
console.log('JARVIS content script cargado en:', location.hostname);
// Extrae conversaciones de Claude y ChatGPT

function extractConversation() {
  const host = location.hostname;
  const pairs = [];

  if (host.includes('claude.ai')) {
    const humans   = document.querySelectorAll('[data-testid="human-turn"]');
    const machines = document.querySelectorAll('[data-testid="ai-turn"]');
    const maxLen   = Math.max(humans.length, machines.length);

    for (let i = 0; i < maxLen; i++) {
      if (humans[i])   pairs.push({ role: 'USUARIO',  text: humans[i].innerText.trim() });
      if (machines[i]) pairs.push({ role: 'CLAUDE',   text: machines[i].innerText.trim() });
    }
  } else {
    // ChatGPT
    const msgs = document.querySelectorAll(
      '[data-message-author-role="user"], [data-message-author-role="assistant"]'
    );
    msgs.forEach(el => {
      const role = el.getAttribute('data-message-author-role');
      const label = role === 'user' ? 'USUARIO' : 'CHATGPT';
      const text = el.innerText.trim();
      if (text) pairs.push({ role: label, text });
    });
  }

  if (!pairs.length) return null;

  // Últimos 20 intercambios (40 mensajes)
  const recent = pairs.slice(-40);
  return recent.map(p => `${p.role}: ${p.text}`).join('\n\n');
}

// Exponer para usos externos
window.jarvisExtractConversation = extractConversation;

// Escuchar mensajes del popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'extract') {
    const text = extractConversation();
    sendResponse({ text, url: location.href, host: location.hostname });
  }
  return true; // necesario para async
});
