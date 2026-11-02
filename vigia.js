// Vigía de citas DIAN (Videoatención · Devoluciones)
// Corre en GitHub Actions cada ~5 minutos. Abre la página en un navegador real,
// hace el recorrido y, si aparece agenda, avisa al celular por ntfy con una captura.
'use strict';

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const URL_INICIO = process.env.URL_INICIO || 'https://agendamiento.dian.gov.co/';
const NTFY_SERVER = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');
const TOPIC = (process.env.NTFY_TOPIC || '').trim();
const FORZAR_AVISO = /^(1|true)$/i.test(process.env.FORZAR_AVISO || '');
const SALIDA = path.join(__dirname, 'salida');
const ESPERA_RESULTADO_MS = 6000;

// Recorrido, en orden. "opcional": si no aparece, se salta. "espera": segundos máximos.
const PASOS = [
  { nombre: 'agendamiento', texto: /agendamiento de citas|solicitar cita|asignaci[oó]n de citas/i, opcional: true, espera: 20 },
  { nombre: 'iniciar', texto: /^iniciar solicitud$/i, opcional: true, espera: 5 },
  { nombre: 'aviso', texto: /^(aceptar|entendido|acepto)$/i, opcional: true, espera: 4 },
  { nombre: 'persona-natural', texto: /persona natural/i, espera: 25 },
  { nombre: 'videoatencion', texto: /video ?atenci[oó]n|no presencial/i, espera: 25 },
  { nombre: 'devoluciones', texto: /devoluci[oó]n/i, espera: 25 },
];

// Frases que significan "no hay agenda".
const SIN_CUPO = /no (hay|existen?|se encontr\w*|cuenta con|tiene|se dispone de)\b.{0,60}?(disponib|agenda|cita|cupo|horario|turno)|sin (disponibilidad|agenda|cupos?|citas|horarios)|agotad/i;
const CAPTCHA = /captcha|no soy un robot|verifica que eres humano/i;
const BLOQUEO = /access denied|acceso denegado|forbidden|request (was )?blocked|solicitud (fue )?bloqueada|just a moment|checking your browser|attention required|not available in your (country|region)/i;

class Fin extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}

/* ------------- Se ejecuta DENTRO de la página: marca el mejor elemento ------------- */
function marcar({ src, flags }) {
  const re = new RegExp(src, flags);
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const CLICABLE = 'button,a[href],[role="button"],[role="tab"],[role="radio"],[role="option"],[role="menuitem"],[role="link"],label,option,mat-card,mat-option,[onclick],[tabindex]:not([tabindex="-1"]),input[type="button"],input[type="submit"],input[type="radio"]';
  if (!document.body) return null;
  document.querySelectorAll('[data-vigia]').forEach((e) => e.removeAttribute('data-vigia'));
  const visible = (el) => {
    if (el.tagName === 'OPTION') return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const esClicable = (el) => {
    for (let n = el, d = 0; n && n !== document.body && d < 4; n = n.parentElement, d++) {
      if (n.matches(CLICABLE)) return true;
      if (getComputedStyle(n).cursor === 'pointer') return true;
    }
    return false;
  };
  let mejor = null;
  let puntaje = Infinity;
  for (const el of document.body.querySelectorAll('*')) {
    if (/^(script|style|noscript|svg|path|iframe)$/i.test(el.tagName)) continue;
    const t = el.tagName === 'INPUT' ? norm(el.value || el.getAttribute('aria-label')) : norm(el.innerText || el.textContent);
    if (!t || t.length > 90 || !re.test(t)) continue;
    if (el.closest('[disabled],[aria-disabled="true"]')) continue;
    if (!visible(el)) continue;
    const p = t.length + (esClicable(el) ? 0 : 1000);
    if (p < puntaje) { mejor = el; puntaje = p; }
  }
  if (!mejor) return null;
  mejor.setAttribute('data-vigia', '1');
  return { puntaje, texto: norm(mejor.innerText || mejor.value || '').slice(0, 90), tag: mejor.tagName };
}

/* ------------------------------ Utilidades ------------------------------ */
async function buscar(page, re) {
  let mejor = null;
  for (const frame of page.frames()) {
    let r = null;
    try { r = await frame.evaluate(marcar, { src: re.source, flags: re.flags }); } catch (e) { continue; }
    if (r && (!mejor || r.puntaje < mejor.r.puntaje)) mejor = { frame, r };
  }
  return mejor;
}

async function esperar(page, re, segundos) {
  const fin = Date.now() + segundos * 1000;
  while (Date.now() < fin) {
    const m = await buscar(page, re);
    if (m) return m;
    await page.waitForTimeout(700);
  }
  return null;
}

async function clic({ frame, r }) {
  if (r.tag === 'OPTION') {
    await frame.evaluate(() => {
      const el = document.querySelector('[data-vigia="1"]');
      const sel = el && el.closest('select');
      if (!sel) return;
      sel.value = el.value;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    return 'opcion';
  }
  try {
    await frame.click('[data-vigia="1"]', { timeout: 8000 });
    return 'clic';
  } catch (e) {
    await frame.evaluate(() => { const el = document.querySelector('[data-vigia="1"]'); if (el) el.click(); });
    return 'clic-js';
  }
}

async function lineas(page) {
  const out = [];
  for (const frame of page.frames()) {
    try {
      const ls = await frame.evaluate(() =>
        (document.body ? document.body.innerText : '')
          .split('\n')
          .map((l) => l.replace(/\s+/g, ' ').trim())
          .filter(Boolean));
      out.push(...ls);
    } catch (e) { /* frame cerrado */ }
  }
  return out;
}

async function hayCaptcha(page) {
  for (const frame of page.frames()) {
    const u = frame.url();
    const retoVisible =
      (/recaptcha\/(api2|enterprise)\/anchor/.test(u) && !/size=invisible/.test(u)) ||
      /recaptcha\/(api2|enterprise)\/bframe|hcaptcha\.com|challenges\.cloudflare\.com/.test(u);
    if (!retoVisible) continue;
    try {
      const el = await frame.frameElement();
      if (await el.isVisible()) return true;
    } catch (e) { /* ignorar */ }
  }
  return CAPTCHA.test((await lineas(page)).join(' '));
}

async function captura(page, nombre, completa = false) {
  try {
    await page.screenshot({ path: path.join(SALIDA, `${nombre}.png`), fullPage: completa });
  } catch (e) { /* no detener por una captura */ }
}

async function avisar({ titulo, mensaje, prioridad, imagen }) {
  if (!TOPIC) { console.log('NTFY_TOPIC vacío: no se envía aviso.'); return false; }
  const q = new URLSearchParams({
    title: titulo,
    message: mensaje,
    priority: prioridad,
    tags: prioridad === 'urgent' ? 'rotating_light' : 'robot',
    click: URL_INICIO,
  });
  let metodo = 'POST';
  let cuerpo = mensaje;
  if (imagen && fs.existsSync(imagen)) {
    metodo = 'PUT';
    cuerpo = fs.readFileSync(imagen);
    q.set('filename', 'pantalla.png');
  }
  try {
    const r = await fetch(`${NTFY_SERVER}/${encodeURIComponent(TOPIC)}?${q}`, { method: metodo, body: cuerpo });
    console.log(`Aviso ntfy: HTTP ${r.status}`);
    return r.ok;
  } catch (e) {
    console.log(`Aviso ntfy falló: ${e.message}`);
    return false;
  }
}

function horaBogota() {
  return new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

/* -------------------------------- Principal -------------------------------- */
async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });
  const opciones = { headless: true };
  if (process.env.CHROME_PATH) opciones.executablePath = process.env.CHROME_PATH;
  else opciones.channel = 'chrome';

  const browser = await chromium.launch(opciones);
  const context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota', viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Registro de lo que la página pide al servidor (sirve para afinar el robot).
  const red = [];
  page.on('response', async (resp) => {
    const req = resp.request();
    const tipo = req.resourceType();
    if (!['xhr', 'fetch', 'document', 'eventsource'].includes(tipo)) return;
    const item = { tipo, metodo: req.method(), url: req.url(), estado: resp.status(), ct: resp.headers()['content-type'] || '' };
    if ((tipo === 'xhr' || tipo === 'fetch') && /json|text|xml/i.test(item.ct)) {
      try { item.respuesta = (await resp.text()).slice(0, 3000); } catch (e) { /* sin cuerpo */ }
      const envio = req.postData();
      if (envio) item.envio = envio.slice(0, 1500);
    }
    red.push(item);
  });
  let framesWs = 0;
  page.on('websocket', (ws) => {
    red.push({ tipo: 'websocket', url: ws.url() });
    ws.on('framereceived', (f) => {
      if (framesWs++ < 40) red.push({ tipo: 'ws-recibido', datos: String(f.payload).slice(0, 600) });
    });
  });

  const resumen = { hora: horaBogota(), url: URL_INICIO, pasos: [], veredicto: null, detalle: '' };
  let codigoSalida = 0;

  try {
    const resp = await page.goto(URL_INICIO, { waitUntil: 'domcontentloaded', timeout: 45000 });
    resumen.estadoHttp = resp ? resp.status() : null;
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await captura(page, '00-inicio');

    let antes = null;
    for (const [i, p] of PASOS.entries()) {
      if (await hayCaptcha(page)) throw new Fin('captcha', 'La página pidió un CAPTCHA.');
      const m = await esperar(page, p.texto, p.espera);
      if (!m) {
        resumen.pasos.push({ paso: p.nombre, encontrado: false });
        if (p.opcional) continue;
        throw new Fin('paso-no-encontrado', `No encontré el paso "${p.nombre}".`);
      }
      antes = await lineas(page);
      const como = await clic(m);
      resumen.pasos.push({ paso: p.nombre, encontrado: true, texto: m.r.texto, como });
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await captura(page, `${String(i + 1).padStart(2, '0')}-${p.nombre}`);
    }

    await page.waitForTimeout(ESPERA_RESULTADO_MS);
    if (await hayCaptcha(page)) throw new Fin('captcha', 'La página pidió un CAPTCHA.');

    // Solo se analiza el texto que apareció después del último clic.
    const previas = new Set(antes || []);
    const nuevo = (await lineas(page)).filter((l) => !previas.has(l)).join(' | ');
    resumen.textoNuevo = nuevo.slice(0, 2000);
    await captura(page, 'resultado');
    await captura(page, 'resultado-completo', true);

    if (!nuevo) {
      resumen.veredicto = 'sin-cambio';
      resumen.detalle = 'La pantalla no cambió después de Devoluciones.';
    } else if (SIN_CUPO.test(nuevo)) {
      resumen.veredicto = 'sin-agenda';
    } else {
      resumen.veredicto = 'posible-cita';
      await avisar({
        titulo: 'Cita DIAN: posible agenda',
        mensaje: `Puede haber citas de devoluciones (${resumen.hora}). Entra ya a agendamiento.dian.gov.co y agenda.`,
        prioridad: 'urgent',
        imagen: path.join(SALIDA, 'resultado.png'),
      });
    }
  } catch (e) {
    const texto = (await lineas(page).catch(() => [])).join(' ');
    if (e instanceof Fin) {
      resumen.veredicto = e.codigo;
      resumen.detalle = e.message;
    } else {
      resumen.veredicto = 'error';
      resumen.detalle = e.message;
    }
    if (BLOQUEO.test(texto)) {
      resumen.veredicto = 'bloqueo';
      resumen.detalle = 'La página parece bloquear esta conexión. ' + resumen.detalle;
    }
    resumen.textoPagina = texto.slice(0, 2000);
    await captura(page, 'error', true);
    codigoSalida = 1;
  }

  if (FORZAR_AVISO) {
    await avisar({
      titulo: 'Vigía DIAN: prueba',
      mensaje: `Prueba del robot (${resumen.hora}). Resultado: ${resumen.veredicto}. Así te llegará el aviso cuando haya agenda.`,
      prioridad: 'high',
      imagen: path.join(SALIDA, fs.existsSync(path.join(SALIDA, 'resultado.png')) ? 'resultado.png' : 'error.png'),
    });
  }

  try { fs.writeFileSync(path.join(SALIDA, 'resultado.html'), await page.content()); } catch (e) { /* ignorar */ }
  fs.writeFileSync(path.join(SALIDA, 'red.json'), JSON.stringify(red, null, 1));
  fs.writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 2));
  await browser.close();

  const linea = `Veredicto: ${resumen.veredicto} | ${resumen.detalle || ''} | Pasos: ${resumen.pasos.map((p) => `${p.paso}${p.encontrado ? '✓' : '✗'}`).join(' ')}`;
  console.log(linea);
  if (resumen.textoNuevo) console.log(`Texto nuevo: ${resumen.textoNuevo.slice(0, 500)}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### ${resumen.veredicto}\n\n${resumen.detalle || ''}\n\n` +
      `Pasos: ${resumen.pasos.map((p) => `${p.paso} ${p.encontrado ? '✓' : '✗'}`).join(' · ')}\n\n` +
      (resumen.textoNuevo ? `Texto nuevo: ${resumen.textoNuevo.slice(0, 800)}\n` : ''));
  }
  process.exitCode = codigoSalida;
}

const limite = setTimeout(() => { console.error('Tiempo agotado.'); process.exit(1); }, 200000);
limite.unref();
main().catch((e) => { console.error(e); process.exit(1); });
