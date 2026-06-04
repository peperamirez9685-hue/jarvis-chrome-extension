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
const extractFn = () => {
  let messages = [];
  const userMsgs = document.querySelectorAll('[data-testid="user-message"]');
  const aiMsgs   = document.querySelectorAll('.whitespace-pre-wrap');

  userMsgs.forEach((el, i) => {
    const userText = el.innerText.trim();
    if (userText) messages.push('USUARIO: ' + userText);
    const aiEl = aiMsgs[i * 2 + 1] || aiMsgs[i];
    if (aiEl) {
      const aiText = aiEl.innerText.trim();
      if (aiText) messages.push('JARVIS: ' + aiText);
    }
  });

  if (messages.length === 0) {
    aiMsgs.forEach((el, i) => {
      const text = el.innerText.trim();
      if (text.length > 10)
        messages.push((i % 2 === 0 ? 'USUARIO' : 'JARVIS') + ': ' + text);
    });
  }

  return messages.slice(-40).join('\n\n');
};

// ── Registrar listener cuando el DOM esté listo ──────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('sync-btn').addEventListener('click', syncNow);
  document.getElementById('upload-btn').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', handleFileUpload);
});

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

  // ── PASO 1: Scroll para cargar todos los mensajes ──────────────
  setState('busy', '📜 Cargando conversación completa...');
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const container = document.querySelector('[class*="overflow-y-auto"]')
          || document.querySelector('main')
          || document.documentElement;
        let lastCount = 0;
        for (let i = 0; i < 20; i++) {
          container.scrollTop = 0;
          window.scrollTo(0, 0);
          await new Promise(r => setTimeout(r, 500));
          const count = document.querySelectorAll('[data-testid="user-message"]').length;
          if (count === lastCount && i > 3) break;
          lastCount = count;
        }
        return lastCount;
      }
    });
  } catch (err) {
    console.warn('Scroll no disponible:', err.message);
  }

  await new Promise(r => setTimeout(r, 3000));

  // ── PASO 2: Extraer conversación con executeScript ───────────────
  setState('busy', 'Extrayendo conversación...');
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
    const fecha = new Date().toISOString();
    const prompt = `SINCRONIZACIÓN COMPLETA DE CONVERSACIÓN
Fuente: ${fuente}
Fecha: ${fecha}
URL: ${tab.url}

CONVERSACIÓN COMPLETA:
${texto}

Por favor extrae y guarda:
1. Todos los proyectos mencionados y su estado
2. Todas las decisiones tomadas
3. Todas las tareas o pendientes mencionados
4. Tecnologías y herramientas discutidas
5. Cualquier información personal o preferencia
6. Resumen ejecutivo de qué se trabajó`;

    const res = await fetch(`${JARVIS_URL}/api/learn`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-JARVIS-KEY': 'jarvis-internal-2026'
      },
      body: JSON.stringify({
        texto: prompt,
        fuente,
        url:   tab.url,
        fecha
      })
    });

    console.log('Response status:', res.status);
    const responseText = await res.text();
    console.log('Response body:', responseText.substring(0, 200));

    if (!res.ok) {
      const msg = 'Error: ' + res.status + ' ' + responseText.substring(0, 80);
      console.error(msg);
      setState('error', msg);
      setBtn(false);
      return;
    }

    const data = JSON.parse(responseText);
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
    setState('error', 'Error: ' + err.message.substring(0, 60));
  }

  setBtn(false);
}

// ── Subir exportación de archivo ─────────────────────────────────────
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Reset input para permitir subir el mismo archivo dos veces
  event.target.value = '';

  setState('busy', 'Leyendo archivo...');
  document.getElementById('upload-btn').disabled = true;

  let texto = '';
  try {
    const raw = await file.text();

    if (file.name.endsWith('.json')) {
      // Exportación JSON de Claude: { conversations: [{ messages: [{role, content}] }] }
      const parsed = JSON.parse(raw);
      const convs = parsed.conversations || (Array.isArray(parsed) ? parsed : [parsed]);
      const lines = [];
      for (const conv of convs) {
        const msgs = conv.messages || conv.chat_messages || [];
        for (const m of msgs) {
          const role    = m.role === 'human' || m.role === 'user' ? 'USUARIO' : 'JARVIS';
          const content = typeof m.content === 'string'
            ? m.content
            : m.content?.map?.(c => c.text || '').join('') || '';
          if (content.trim()) lines.push(role + ': ' + content.trim());
        }
      }
      texto = lines.join('\n\n');
    } else {
      texto = raw;
    }

    if (!texto || texto.trim().length < 20) {
      setState('error', 'Archivo vacío o formato no reconocido');
      document.getElementById('upload-btn').disabled = false;
      return;
    }

    // Limitar a 80,000 chars y dividir en chunks de 15,000
    const CHUNK_SIZE = 15000;
    const fullText   = texto.substring(0, 80000);
    const chunks     = [];
    for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
      chunks.push(fullText.substring(i, i + CHUNK_SIZE));
    }

    const fecha = new Date().toISOString();
    let totalHechos = 0;
    let totalDecs   = 0;

    for (let ci = 0; ci < chunks.length; ci++) {
      setState('busy', `Procesando parte ${ci + 1} de ${chunks.length}...`);

      const prompt = `EXPORTACIÓN COMPLETA DE CONVERSACIÓN (parte ${ci + 1}/${chunks.length})
Archivo: ${file.name}
Fecha: ${fecha}

CONVERSACIÓN:
${chunks[ci]}

Por favor extrae y guarda:
1. Todos los proyectos mencionados y su estado
2. Todas las decisiones tomadas
3. Todas las tareas o pendientes mencionados
4. Tecnologías y herramientas discutidas
5. Cualquier información personal o preferencia
6. Resumen ejecutivo de qué se trabajó`;

      const res = await fetch(`${JARVIS_URL}/api/learn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-JARVIS-KEY': 'jarvis-internal-2026'
        },
        body: JSON.stringify({ texto: prompt, fuente: 'export', fecha })
      });

      const responseText = await res.text();
      if (!res.ok) {
        setState('error', `Error parte ${ci + 1}: ${res.status} ${responseText.substring(0, 50)}`);
        document.getElementById('upload-btn').disabled = false;
        return;
      }

      const data = JSON.parse(responseText);
      totalHechos += data.hechos    ?? 0;
      totalDecs   += data.decisiones ?? 0;
    }

    chrome.storage.local.set({ lastSync: Date.now(), lastHechos: totalHechos, lastDecs: totalDecs });
    document.getElementById('stats-row').style.display = 'flex';
    document.getElementById('st-hechos').textContent   = totalHechos;
    document.getElementById('st-decs').textContent     = totalDecs;
    document.getElementById('last-sync').textContent   =
      'Última sync: ' + new Date().toLocaleString('es-MX');

    setState('ok', `✅ ${chunks.length} partes · ${totalHechos} hechos · ${totalDecs} decisiones`);
  } catch (err) {
    console.error('handleFileUpload error:', err);
    setState('error', 'Error: ' + err.message.substring(0, 60));
  }

  document.getElementById('upload-btn').disabled = false;
}
