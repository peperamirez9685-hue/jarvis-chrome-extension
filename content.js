// JARVIS Memory Sync — Content Script
console.log('JARVIS content script cargado en:', location.hostname);

function extractConversation() {
  const host = location.hostname;
  const pairs = [];

  if (host.includes('claude.ai')) {
    // ── Estrategia 1: data-testid exactos (UI clásico) ──────────────
    let humans = document.querySelectorAll('[data-testid="human-turn"]');
    let ais    = document.querySelectorAll('[data-testid="ai-turn"]');

    // ── Estrategia 2: data-testid parciales ─────────────────────────
    if (!humans.length)
      humans = document.querySelectorAll('[data-testid*="human"]');
    if (!ais.length)
      ais = document.querySelectorAll(
        '[data-testid*="assistant"], [data-testid*="claude-response"]'
      );

    // ── Estrategia 3: clases conocidas ──────────────────────────────
    if (!humans.length)
      humans = document.querySelectorAll(
        '.font-user-message, [class*="HumanTurn"], [class*="human-turn"], [class*="UserMessage"]'
      );
    if (!ais.length)
      ais = document.querySelectorAll(
        '.font-claude-message, [class*="AssistantTurn"], [class*="ClaudeMessage"], [class*="ai-turn"]'
      );

    if (humans.length || ais.length) {
      const len = Math.max(humans.length, ais.length);
      for (let i = 0; i < len; i++) {
        const h = humans[i]?.innerText?.trim();
        const a = ais[i]?.innerText?.trim();
        if (h) pairs.push({ role: 'USUARIO', text: h });
        if (a) pairs.push({ role: 'CLAUDE',  text: a });
      }
    }

    // ── Estrategia 4: todos los mensajes en orden del DOM ────────────
    if (!pairs.length) {
      const allMsg = document.querySelectorAll(
        '[data-testid*="turn"], [class*="Turn"], [class*="Message"], .prose'
      );
      allMsg.forEach((el, i) => {
        const txt = el.innerText?.trim();
        if (txt && txt.length > 5)
          pairs.push({ role: i % 2 === 0 ? 'USUARIO' : 'CLAUDE', text: txt });
      });
    }

    // ── Estrategia 5: volcar todo el área de conversación ───────────
    if (!pairs.length) {
      const container = document.querySelector(
        'main, [role="main"], .flex-1.overflow-y-auto, [class*="conversation"]'
      );
      const txt = container?.innerText?.trim();
      if (txt && txt.length > 30) pairs.push({ role: 'CONVERSACION', text: txt });
    }

  } else {
    // ── ChatGPT ──────────────────────────────────────────────────────
    const msgs = document.querySelectorAll(
      '[data-message-author-role="user"], [data-message-author-role="assistant"]'
    );
    msgs.forEach(el => {
      const role = el.getAttribute('data-message-author-role') === 'user'
        ? 'USUARIO' : 'CHATGPT';
      const txt = el.innerText?.trim();
      if (txt) pairs.push({ role, text: txt });
    });

    // Fallback ChatGPT
    if (!pairs.length) {
      document.querySelectorAll('.markdown, .prose, [class*="message"]').forEach((el, i) => {
        const txt = el.innerText?.trim();
        if (txt && txt.length > 20)
          pairs.push({ role: i % 2 === 0 ? 'USUARIO' : 'CHATGPT', text: txt });
      });
    }
  }

  if (!pairs.length) {
    console.warn('JARVIS: no se encontraron mensajes en la página');
    return null;
  }

  console.log('JARVIS: mensajes encontrados:', pairs.length);
  const recent = pairs.slice(-40);
  return recent.map(p => `${p.role}: ${p.text}`).join('\n\n');
}

window.jarvisExtractConversation = extractConversation;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action === 'extract') {
    const text = extractConversation();
    sendResponse({ text, url: location.href, host: location.hostname });
  }
  return true;
});
