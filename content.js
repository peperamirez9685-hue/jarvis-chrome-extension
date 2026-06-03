// JARVIS Memory Sync — Content Script
console.log('JARVIS content script cargado en:', location.hostname);

function extractConversation() {
  const host = location.hostname;
  let messages = [];

  if (host.includes('claude.ai')) {
    const userMsgs = document.querySelectorAll('[data-testid="user-message"]');
    const allText  = document.querySelectorAll('.whitespace-pre-wrap');

    // Estrategia principal: user-message + whitespace-pre-wrap alternados
    userMsgs.forEach((el, i) => {
      const userText = el.innerText.trim();
      if (userText) messages.push('USUARIO: ' + userText);

      const nextText = allText[i * 2 + 1];
      if (nextText) {
        const aiText = nextText.innerText.trim();
        if (aiText) messages.push('JARVIS: ' + aiText);
      }
    });

    // Fallback: todos los whitespace-pre-wrap en orden
    if (messages.length === 0) {
      allText.forEach((el, i) => {
        const text = el.innerText.trim();
        if (text.length > 10) {
          const role = i % 2 === 0 ? 'USUARIO' : 'JARVIS';
          messages.push(role + ': ' + text);
        }
      });
    }

  } else {
    // ── ChatGPT ──────────────────────────────────────────────────────────
    const msgs = document.querySelectorAll(
      '[data-message-author-role="user"], [data-message-author-role="assistant"]'
    );
    msgs.forEach(el => {
      const role = el.getAttribute('data-message-author-role') === 'user'
        ? 'USUARIO' : 'CHATGPT';
      const txt = el.innerText?.trim();
      if (txt) messages.push(role + ': ' + txt);
    });

    if (messages.length === 0) {
      document.querySelectorAll('[class*="text-message"], .markdown, .prose').forEach((el, i) => {
        const txt = el.innerText?.trim();
        if (txt && txt.length > 20)
          messages.push((i % 2 === 0 ? 'USUARIO' : 'CHATGPT') + ': ' + txt);
      });
    }
  }

  if (messages.length === 0) {
    console.warn('JARVIS: no se encontraron mensajes en la página');
    return null;
  }

  console.log('JARVIS: mensajes encontrados:', messages.length);
  return messages.slice(-40).join('\n\n');
}

window.jarvisExtractConversation = extractConversation;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'extract') {
    const text = extractConversation();
    sendResponse({ text, url: location.href, host: location.hostname });
  }
  return true;
});
