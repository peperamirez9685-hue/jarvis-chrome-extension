// JARVIS Memory Sync — Content Script
console.log('JARVIS content script cargado en:', location.hostname);

function extractConversation() {
  const host = location.hostname;
  const pairs = [];

  if (host.includes('claude.ai')) {
    // ── Estrategia 1: selectores 2026 — data-testid de mensajes ────────
    let humans = document.querySelectorAll('[data-testid="user-message"]');
    let ais    = document.querySelectorAll('[data-testid="assistant-message"]');

    // ── Estrategia 2: data-testid parciales ─────────────────────────────
    if (!humans.length)
      humans = document.querySelectorAll('[data-testid*="human"], [data-testid*="user"]');
    if (!ais.length)
      ais = document.querySelectorAll('[data-testid*="assistant"], [data-testid*="claude"]');

    // ── Estrategia 3: clases conocidas 2025-2026 ────────────────────────
    if (!humans.length)
      humans = document.querySelectorAll(
        '.font-user-message, [class*="HumanTurn"], [class*="human-turn"], [class*="UserMessage"], [class*="user-message"]'
      );
    if (!ais.length)
      ais = document.querySelectorAll(
        '.font-claude-message, [class*="AssistantTurn"], [class*="ClaudeMessage"], [class*="ai-turn"], [class*="assistant-message"]'
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

    // ── Estrategia 4: article tags (layout 2026) ────────────────────────
    if (!pairs.length) {
      const articles = document.querySelectorAll('article');
      articles.forEach((el, i) => {
        const txt = el.innerText?.trim();
        if (txt && txt.length > 5)
          pairs.push({ role: i % 2 === 0 ? 'USUARIO' : 'CLAUDE', text: txt });
      });
    }

    // ── Estrategia 5: prose divs (respuestas markdown de Claude) ────────
    if (!pairs.length) {
      const proseEls = document.querySelectorAll(
        'div[class*="prose"], .whitespace-pre-wrap, [class*="message-content"]'
      );
      proseEls.forEach((el, i) => {
        const txt = el.innerText?.trim();
        if (txt && txt.length > 10)
          pairs.push({ role: i % 2 === 0 ? 'USUARIO' : 'CLAUDE', text: txt });
      });
    }

    // ── Estrategia 6: todos los mensajes en orden del DOM ───────────────
    if (!pairs.length) {
      const allMsg = document.querySelectorAll(
        '[data-testid*="turn"], [class*="Turn"], [class*="Message"], .prose, article'
      );
      allMsg.forEach((el, i) => {
        const txt = el.innerText?.trim();
        if (txt && txt.length > 5)
          pairs.push({ role: i % 2 === 0 ? 'USUARIO' : 'CLAUDE', text: txt });
      });
    }

    // ── Estrategia 7: volcar todo el área de conversación ───────────────
    if (!pairs.length) {
      const container = document.querySelector(
        'main, [role="main"], .flex-1.overflow-y-auto, [class*="conversation"]'
      );
      const txt = container?.innerText?.trim();
      if (txt && txt.length > 30) pairs.push({ role: 'CONVERSACION', text: txt });
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
      if (txt) pairs.push({ role, text: txt });
    });

    // ── Fallback ChatGPT: text-message class 2025-2026 ───────────────────
    if (!pairs.length) {
      document.querySelectorAll('[class*="text-message"], .markdown, .prose').forEach((el, i) => {
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
