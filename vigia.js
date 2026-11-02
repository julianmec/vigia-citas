// Vigía de citas DIAN (Videoatención · Devoluciones)
// Corre en GitHub Actions cada ~5 minutos. Abre la página en un navegador real, hace el
// recorrido de selección (sin datos personales ni CAPTCHA) y deja el resultado en
// salida/resumen.json. El workflow crea un issue (te llega correo) si aparece agenda.
'use strict';

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const URL_INICIO = process.env.URL_INICIO || 'https://agendamiento.dian.gov.co/';
const HOST = new URL(URL_INICIO).host;
const FORZAR_AVISO = /^(1|true)$/i.test(process.env.FORZAR_AVISO || '');
const SALIDA = path.join(__dirname, 'salida');
const ESPERA_RESULTADO_MS = 7000;

// Recorrido real de la página. "opcional": si no aparece, se salta. "espera": segundos máximos.
// tipo "select": escoge la opción de una lista desplegable en vez de hacer clic.
const PASOS = [
  { nombre: 'agendar', texto: /^(agendar|solicitar) cita$/i, espera: 30 },
  { nombre: 'persona-natural', texto: /persona natural/i, espera: 25 },
  { nombre: 'videoatencion', texto: /video ?atenci[oó]n|no presencial/i, espera: 25 },
  { nombre: 'devoluciones', texto: /devoluci[oó]n/i, espera: 25, decide: true },
  { nombre: 'tramite', tipo: 'select', texto: /devoluci[oó]n/i, opcional: true, espera: 8 },
  { nombre: 'siguiente', texto: /^siguiente$/i, espera: 15 },
];

// Frases que significan "no hay agenda".
const SIN_CUPO = /no (hay|existen?|se encontr\w*|cuenta con|tiene|se dispone de)\b.{0,60}?(disponib|agenda|cita|cupo|horario|turno|especialidad)|sin (disponibilidad|agenda|cupos?|citas|horarios)|agotad/i;
const CAPTCHA = /no soy un robot|verifica que eres humano/i;
const BLOQUEO = /access denied|acceso denegado|forbidden|request (was )?blocked|solicitud (fue )?bloqueada|just a moment|checking your browser|attention required|not available in your (country|region)/i;

class Fin extends Error {
  constructor(codigo, mensaje) { super(mensaje); this.codigo = codigo; }
}

/* ---------------- Funciones que se ejecutan DENTRO de la página ---------------- */
function marcar({ src, flags }) {
  const re = new RegExp(src, flags);
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const CLICABLE = 'button,a[href],[role="button"],[role="tab"],[role="radio"],[role="option"],[role="menuitem"],[role="link"],label,option,[onclick],[tabindex]:not([tabindex="-1"]),input[type="button"],input[type="submit"],input[type="radio"],[tipo="Control"]';
  if (!document.body) return null;
  document.querySelectorAll('[data-vigia]').forEach((e) => e.removeAttribute('data-vigia'));
  const vis = (el) => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const visible = (el) => {
    if (el.tagName === 'OPTION') {
      const sel = el.closest('select');
      return !!sel && (vis(sel) || vis(sel.parentElement));
    }
    return vis(el);
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
    const p = t.length + (esClicable(el) ? 0 : 1000) + (el.tagName === 'OPTION' ? 5 : 0);
    if (p < puntaje) { mejor = el; puntaje = p; }
  }
  if (!mejor) return null;
  mejor.setAttribute('data-vigia', '1');
  return { puntaje, texto: norm(mejor.innerText || mejor.textContent || mejor.value || '').slice(0, 90), tag: mejor.tagName };
}

function elegirOpcion({ src, flags }) {
  const re = new RegExp(src, flags);
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = (el) => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  for (const sel of document.querySelectorAll('select')) {
    if (!(vis(sel) || vis(sel.parentElement))) continue;
    const actual = sel.options[sel.selectedIndex];
    if (actual && re.test(norm(actual.text))) return { ya: true, texto: norm(actual.text) };
    const opciones = Array.from(sel.options).filter((o) => !o.disabled && re.test(norm(o.text)));
    if (!opciones.length) continue;
    opciones.sort((a, b) => norm(a.text).length - norm(b.text).length);
    sel.value = opciones[0].value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ya: false, texto: norm(opciones[0].text) };
  }
  return null;
}

function hayOpcionesReales() {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = (el) => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  };
  for (const sel of document.querySelectorAll('select')) {
    if (!(vis(sel) || vis(sel.parentElement))) continue;
    const reales = Array.from(sel.options).filter((o) => !o.disabled && norm(o.text) && !/^(seleccione|--)/i.test(norm(o.text)));
    if (reales.length) return true;
  }
  return false;
}

// Foto de la pantalla en texto: botones/controles visibles y listas con sus opciones.
function listarControles() {
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = (el) => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const RUIDO = /facebook|instagram|linkedin|tiktok|twitter|youtube|^img|contact|linea|nit$|sede(principal)?$|horario|titulocontac|edicio|nivelcentral|serviciolinea|footer|header/i;
  const out = [];
  for (const el of document.querySelectorAll('[tipo="Control"], button, a[href], [role="button"], label')) {
    const nombre = el.getAttribute('nombre') || '';
    if (RUIDO.test(nombre) || !vis(el)) continue;
    const t = norm(el.innerText || el.value || '');
    if (!t || t.length > 80) continue;
    out.push(`${nombre || el.tagName.toLowerCase()}: ${t}`);
    if (out.length >= 50) break;
  }
  for (const sel of document.querySelectorAll('select')) {
    if (!(vis(sel) || vis(sel.parentElement))) continue;
    const actual = sel.options[sel.selectedIndex];
    const opciones = Array.from(sel.options).map((o) => norm(o.text)).slice(0, 30);
    out.push(`LISTA ${sel.getAttribute('nombre') || sel.id || sel.className}: [${actual ? norm(actual.text) : ''}] ⟨${opciones.join(' / ')}⟩`);
  }
  return [...new Set(out)];
}

/* ------------------------------ Utilidades ------------------------------ */
const framesPropios = (page) => page.frames().filter((f) => f === page.mainFrame() || f.url().includes(HOST));

async function buscar(page, re) {
  let mejor = null;
  for (const frame of framesPropios(page)) {
    let r = null;
    try { r = await frame.evaluate(marcar, { src: re.source, flags: re.flags }); } catch (e) { continue; }
    if (r && (!mejor || r.puntaje < mejor.r.puntaje)) mejor = { frame, r };
  }
  return mejor;
}

async function esperar(page, fn, segundos) {
  const fin = Date.now() + segundos * 1000;
  while (Date.now() < fin) {
    const r = await fn();
    if (r) return r;
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

async function elegir(page, re) {
  for (const frame of framesPropios(page)) {
    try {
      const r = await frame.evaluate(elegirOpcion, { src: re.source, flags: re.flags });
      if (r) return r;
    } catch (e) { /* frame cerrado */ }
  }
  return null;
}

async function hayOpciones(page) {
  for (const frame of framesPropios(page)) {
    try { if (await frame.evaluate(hayOpcionesReales)) return true; } catch (e) { /* ignorar */ }
  }
  return false;
}

// Después de Devoluciones: o sale el mensaje de "no hay", o se llena la lista de trámites.
async function esperarDecision(page, previas, segundos) {
  const fin = Date.now() + segundos * 1000;
  let nuevo = '';
  while (Date.now() < fin) {
    nuevo = (await lineas(page)).filter((l) => !previas.has(l)).join(' | ');
    if (SIN_CUPO.test(nuevo)) return { estado: 'sin-agenda', nuevo };
    if (await hayOpciones(page)) return { estado: 'con-opciones', nuevo };
    await page.waitForTimeout(700);
  }
  return { estado: 'incierto', nuevo };
}

async function lineas(page) {
  const out = [];
  for (const frame of framesPropios(page)) {
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

async function pantalla(page) {
  const out = [];
  for (const frame of framesPropios(page)) {
    try { out.push(...(await frame.evaluate(listarControles))); } catch (e) { /* ignorar */ }
  }
  return out;
}

// Solo cuenta como CAPTCHA si el recuadro o el reto están realmente a la vista.
async function hayCaptcha(page) {
  for (const frame of page.frames()) {
    const u = frame.url();
    const ancla = /recaptcha\/(api2|enterprise)\/anchor/.test(u) && !/size=invisible/.test(u);
    const reto = /recaptcha\/(api2|enterprise)\/bframe|hcaptcha\.com|challenges\.cloudflare\.com/.test(u);
    if (!ancla && !reto) continue;
    try {
      const el = await frame.frameElement();
      const caja = await el.boundingBox();
      if (caja && caja.width > 50 && caja.height > 50 && (await el.isVisible())) return true;
    } catch (e) { /* ignorar */ }
  }
  try {
    return CAPTCHA.test(await page.mainFrame().evaluate(() => (document.body ? document.body.innerText : '')));
  } catch (e) { return false; }
}

async function captura(page, nombre, completa = false) {
  try {
    await page.screenshot({ path: path.join(SALIDA, `${nombre}.png`), fullPage: completa });
  } catch (e) { /* no detener por una captura */ }
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

  // Registro de lo que la página consulta al servidor (sirve para afinar el robot).
  const red = [];
  page.on('response', async (resp) => {
    const req = resp.request();
    const tipo = req.resourceType();
    if (!['xhr', 'fetch', 'document'].includes(tipo)) return;
    if (/google|gstatic|analytics|Plantillas\//.test(req.url())) return;
    const item = { tipo, metodo: req.method(), url: req.url(), estado: resp.status() };
    if (tipo !== 'document') {
      try { item.respuesta = (await resp.text()).slice(0, 4000); } catch (e) { /* sin cuerpo */ }
      const envio = req.postData();
      if (envio) item.envio = envio.slice(0, 1500);
    }
    red.push(item);
  });

  const resumen = { hora: horaBogota(), url: URL_INICIO, prueba: FORZAR_AVISO, pasos: [], veredicto: null, detalle: '' };
  let codigoSalida = 0;

  try {
    const resp = await page.goto(URL_INICIO, { waitUntil: 'domcontentloaded', timeout: 45000 });
    resumen.estadoHttp = resp ? resp.status() : null;
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await captura(page, '00-inicio');

    let antesDecision = null; // texto de la pantalla justo antes de pulsar Devoluciones
    let decision = null;      // 'sin-agenda' | 'con-opciones' | 'incierto'
    for (const [i, p] of PASOS.entries()) {
      if (await hayCaptcha(page)) throw new Fin('captcha', 'La página mostró un CAPTCHA antes de la disponibilidad.');
      const despues = decision !== null; // pasos posteriores a Devoluciones: solo para mejorar la captura
      const registro = { paso: p.nombre };
      resumen.pasos.push(registro);
      if (p.tipo === 'select') {
        const r = await esperar(page, () => elegir(page, p.texto), p.espera);
        registro.encontrado = !!r;
        if (!r) { if (p.opcional || despues) continue; throw new Fin('paso-no-encontrado', `No encontré la opción "${p.nombre}".`); }
        registro.texto = r.texto;
        registro.como = r.ya ? 'ya-elegida' : 'lista';
        if (r.ya) continue;
      } else {
        const m = await esperar(page, () => buscar(page, p.texto), p.espera);
        registro.encontrado = !!m;
        if (!m) {
          registro.pantalla = await pantalla(page);
          if (p.opcional) continue;
          if (despues) break;
          throw new Fin('paso-no-encontrado', `No encontré el paso "${p.nombre}".`);
        }
        if (p.decide) antesDecision = new Set(await lineas(page));
        registro.texto = m.r.texto;
        registro.como = await clic(m);
      }
      await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
      if (p.decide) {
        const d = await esperarDecision(page, antesDecision, 15);
        decision = d.estado;
        resumen.decision = decision;
        resumen.textoNuevo = d.nuevo.slice(0, 2500);
        registro.pantalla = await pantalla(page);
        await captura(page, `${String(i + 1).padStart(2, '0')}-${p.nombre}`);
        if (decision === 'sin-agenda') break; // no hay nada más que revisar
        continue;
      }
      await page.waitForTimeout(1500);
      registro.pantalla = await pantalla(page);
      await captura(page, `${String(i + 1).padStart(2, '0')}-${p.nombre}`);
    }

    if (decision !== 'sin-agenda') await page.waitForTimeout(ESPERA_RESULTADO_MS);
    if (await hayCaptcha(page)) throw new Fin('captcha', 'La página mostró un CAPTCHA antes de la disponibilidad.');

    const ahora = await lineas(page);
    const nuevo = ahora.filter((l) => !(antesDecision || new Set()).has(l)).join(' | ');
    resumen.textoNuevo = nuevo.slice(0, 2500);
    resumen.pantallaFinal = await pantalla(page);
    await captura(page, 'resultado');
    await captura(page, 'resultado-completo', true);

    const pasoDos = ahora.some((l) => /ciudad o municipio, sede, fecha y hora/i.test(l));
    if (decision === 'sin-agenda' || SIN_CUPO.test(nuevo)) {
      resumen.veredicto = 'sin-agenda';
    } else if (decision === 'con-opciones' || pasoDos) {
      resumen.veredicto = 'posible-cita';
      resumen.detalle = pasoDos ? 'Llegó a la pantalla de ciudad, sede, fecha y hora.' : 'Apareció la lista de trámites de devolución.';
    } else {
      resumen.veredicto = 'sin-cambio';
      resumen.detalle = 'Ni salió el mensaje de "no hay" ni aparecieron trámites; se revisa de nuevo en la próxima corrida.';
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
    resumen.textoPagina = texto.slice(0, 2500);
    resumen.pantallaFinal = await pantalla(page).catch(() => []);
    await captura(page, 'error', true);
    await captura(page, 'resultado');
    codigoSalida = 1;
  }

  try { fs.writeFileSync(path.join(SALIDA, 'resultado.html'), await page.content()); } catch (e) { /* ignorar */ }
  fs.writeFileSync(path.join(SALIDA, 'red.json'), JSON.stringify(red, null, 1));
  fs.writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify(resumen, null, 2));
  await browser.close();

  console.log(`Veredicto: ${resumen.veredicto} | ${resumen.detalle || ''} | Pasos: ${resumen.pasos.map((p) => `${p.paso}${p.encontrado ? '✓' : '✗'}`).join(' ')}`);
  if (resumen.textoNuevo) console.log(`Texto nuevo: ${resumen.textoNuevo.slice(0, 500)}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### ${resumen.veredicto}\n\n${resumen.detalle || ''}\n\n` +
      `Pasos: ${resumen.pasos.map((p) => `${p.paso} ${p.encontrado ? '✓' : '✗'}`).join(' · ')}\n`);
  }
  // Un error del robot no debe tapar el aviso: el workflow decide con resumen.json.
  process.exitCode = codigoSalida;
}

const limite = setTimeout(() => { console.error('Tiempo agotado.'); process.exit(1); }, 200000);
limite.unref();
main().catch((e) => { console.error(e); process.exit(1); });
