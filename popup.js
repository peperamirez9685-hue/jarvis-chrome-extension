// JARVIS Memory Sync — Popup Script

const JARVIS_URL = 'https://jarvis-hud-production.up.railway.app';

const SUPPORTED = {
  'claude.ai':       'Claude AI',
  'chatgpt.com':     'ChatGPT',
  'chat.openai.com': 'ChatGPT'
};

function setState(type, txt) {
  const dot = document.getElementById('st-dot');
  const label = document.getElementById('st-txt');
  dot.className = 'status-dot ' + (type || '');
  label.className = 'status-txt ' + (type || '');
  label.textContent = txt;
}

function setBtn(disabled) {
  document.getElementById('sync-btn').disabled = disabled;
}

// Detectar sitio actual al abrir el popup
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab) return;
  const url = new URL(tab.url);
  const host = url.hostname;
  const name = Object.entries(SUPPORTED).find(([k]) => host.includes(k));

  const dot  = document.getElementById('site-dot');
  const site = document.getElementById('site-name');

  if (name) {
    dot.classList.replace('inactive', 'inactive'); // quitar inactive
    dot.style.background = '#00ff88';
    dot.style.boxShadow  = '0 0 6px #00ff88';
    site.textContent = name[1] + ' detectado';
  } else {
    site.textContent = 'Abre Claude o ChatGPT';
    setState('error', 'Sitio no compatible');
    setBtn(true);
  }

  // Cargar última sincronización guardada
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

async function syncNow() {
  setBtn(true);
  setState('busy', 'Extrayendo conversación...');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { setState('error', 'No hay tab activa'); setBtn(false); return; }

  const url = new URL(tab.url);
  const host = url.hostname;
  const fuente = host.includes('claude') ? 'claude'
               : host.includes('chatgpt') || host.includes('openai') ? 'chatgpt'
               : null;

  if (!fuente) {
    setState('error', 'Sitio no compatible');
    setBtn(false);
    return;
  }

  // PASO 1 — Extraer conversación via content script
  let texto = null;
  try {
    const results = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
    texto = results?.text;
  } catch (e) {
    // El content script no respondió — intentar inyectarlo
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await new Promise(r => setTimeout(r, 500));
      const results2 = await chrome.tabs.sendMessage(tab.id, { action: 'extract' });
      texto = results2?.text;
    } catch (e2) {
      setState('error', 'No se pudo acceder a la página');
      setBtn(false);
      return;
    }
  }

  if (!texto || texto.trim().length < 20) {
    setState('error', 'No se encontró conversación');
    setBtn(false);
    return;
  }

  setState('busy', 'Enviando a JARVIS...');

  // PASO 2 — Enviar a /api/learn
  try {
    const res = await fetch(`${JARVIS_URL}/api/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texto,
        fuente,
        url: tab.url,
        fecha: new Date().toISOString()
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText.substring(0, 100)}`);
    }

    const data = await res.json();

    // PASO 3 — Mostrar resultado
    const hechos = data.hechos ?? 0;
    const decs   = data.decisiones ?? 0;

    chrome.storage.local.set({
      lastSync: Date.now(),
      lastHechos: hechos,
      lastDecs: decs
    });

    document.getElementById('stats-row').style.display = 'flex';
    document.getElementById('st-hechos').textContent = hechos;
    document.getElementById('st-decs').textContent   = decs;
    document.getElementById('last-sync').textContent =
      'Última sync: ' + new Date().toLocaleString('es-MX');

    setState('ok', `✅ Sincronizado — ${hechos} hechos guardados`);
  } catch (err) {
    setState('error', err.message.substring(0, 60));
  }

  setBtn(false);
}
