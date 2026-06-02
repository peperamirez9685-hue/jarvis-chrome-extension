// JARVIS Memory Sync — Popup Script

const JARVIS_URL = 'https://jarvis-hud-production.up.railway.app';

const SUPPORTED = {
  'claude.ai':       'Claude AI',
  'chatgpt.com':     'ChatGPT',
  'chat.openai.com': 'ChatGPT'
};

function setState(type, txt) {
  const dot   = document.getElementById('st-dot');
  const label = document.getElementById('st-txt');
  dot.className   = 'status-dot '  + (type || '');
  label.className = 'status-txt '  + (type || '');
  label.textContent = txt;
}

function setBtn(disabled) {
  document.getElementById('sync-btn').disabled = disabled;
}

// ── Detectar sitio al abrir popup ────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;

  let host = '';
  try { host = new URL(tab.url).hostname; } catch (_) {}

  const match = Object.entries(SUPPORTED).find(([k]) => host.includes(k));
  const dot   = document.getElementById('site-dot');
  const site  = document.getElementById('site-name');

  if (match) {
    dot.style.background = '#00ff88';
    dot.style.boxShadow  = '0 0 6px #00ff88';
    site.textContent = match[1] + ' detectado';
  } else {
    site.textContent = 'Abre Claude o ChatGPT';
    setState('error', 'Sitio no compatible');
    setBtn(true);
  }

  chrome.storage.local.get(['lastSync', 'lastHechos', 'lastDecs'], data => {
    if (data.lastSync) {
      document.getElementById('last-sync').textContent =
        'Última sync: ' + new Date(data.lastSync).toLocaleString('es-MX');
    }
    if (data.lastHechos !== undefined) {
      document.getElementById('stats-row').style.display = 'flex';
      document.getElementById('st-hechos').textContent = data.lastHechos;
      document.getElementById('st-decs').textContent   = data.lastDecs || 0;
    }
  });
});

// ── Función de extracción inline (corre directo en la página) ────────
function extractFn() {
  const host = location.hostname;
  const pairs = [];

  if (host.includes('claude')) {
    const humans = document.querySelectorAll('[data-testid="human-turn"]');
    const ais    = document.querySelectorAll('[data-testid="ai-turn"]');
    const len    = Math.max(humans.length, ais.length);
    for (let i = 0; i < len; i++) {
      if (humans[i]) pairs.push('USUARIO: ' + humans[i].innerText.trim());
      if (ais[i])    pairs.push('CLAUDE: '  + ais[i].innerText.trim());
    }
  } else {
    // ChatGPT — selector por rol
    const msgs = document.querySelectorAll(
      '[data-message-author-role="user"], [data-message-author-role="assistant"]'
    );
    msgs.forEach(el => {
      const role = el.getAttribute('data-message-author-role') === 'user'
        ? 'USUARIO' : 'CHATGPT';
      const txt = el.innerText.trim();
      if (txt) pairs.push(role + ': ' + txt);
    });

    // Fallback: bloques de texto de conversación genéricos
    if (!pairs.length) {
      document.querySelectorAll('.markdown, .prose, [class*="message"]').forEach(el => {
        const txt = el.innerText.trim();
        if (txt.length > 20) pairs.push(txt);
      });
    }
  }

  if (!pairs.length) return null;
  return pairs.slice(-40).join('\n\n').substring(0, 5000);
}

// ── Click principal ──────────────────────────────────────────────────
async function syncNow() {
  console.log('Botón clickeado');
  setBtn(true);
  setState('busy', 'Extrayendo conversación...');

  // Obtener tab activa
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  console.log('Tab actual:', tab?.url, 'id:', tab?.id);

  if (!tab) {
    setState('error', 'No hay tab activa');
    setBtn(false);
    return;
  }

  let host = '';
  try { host = new URL(tab.url).hostname; } catch (_) {}

  const fuente = host.includes('claude')   ? 'claude'
               : host.includes('chatgpt') || host.includes('openai') ? 'chatgpt'
               : null;

  if (!fuente) {
    setState('error', 'Abre Claude o ChatGPT primero');
    setBtn(false);
    return;
  }

  // ── PASO 1: Extraer conversación con executeScript ───────────────
  let texto = null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractFn
    });
    texto = results?.[0]?.result ?? null;
    console.log('Texto extraído (chars):', texto?.length ?? 0);
  } catch (err) {
    console.error('executeScript error:', err);
    setState('error', 'Sin acceso a la página: ' + err.message.substring(0, 50));
    setBtn(false);
    return;
  }

  if (!texto || texto.trim().length < 20) {
    setState('error', 'No se encontró conversación en la página');
    setBtn(false);
    return;
  }

  setState('busy', 'Enviando a JARVIS...');

  // ── PASO 2: POST a /api/learn ────────────────────────────────────
  try {
    const res = await fetch(`${JARVIS_URL}/api/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texto,
        fuente,
        url:   tab.url,
        fecha: new Date().toISOString()
      })
    });

    console.log('Response status:', res.status);
    const body = await res.text();
    console.log('Response body:', body.substring(0, 200));

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.substring(0, 80)}`);

    const data = JSON.parse(body);
    const hechos = data.hechos    ?? 0;
    const decs   = data.decisiones ?? 0;

    chrome.storage.local.set({ lastSync: Date.now(), lastHechos: hechos, lastDecs: decs });

    document.getElementById('stats-row').style.display  = 'flex';
    document.getElementById('st-hechos').textContent    = hechos;
    document.getElementById('st-decs').textContent      = decs;
    document.getElementById('last-sync').textContent    =
      'Última sync: ' + new Date().toLocaleString('es-MX');

    setState('ok', `✅ ${hechos} hechos · ${decs} decisiones guardadas`);
  } catch (err) {
    console.error('Fetch /api/learn error:', err);
    setState('error', err.message.substring(0, 65));
  }

  setBtn(false);
}
