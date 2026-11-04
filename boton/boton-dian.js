// Botón "Cita DIAN" para Safari (marcador).
// En agendamiento.dian.gov.co hace: Agendar cita → Persona Natural → Videoatención →
// Devoluciones → trámite de TU ciudad → Siguiente, y te deja en la fecha.
// Si solo hay agenda en otras ciudades, te lo dice y no avanza.
// No escribe datos personales ni toca el CAPTCHA: eso lo haces tú.
(async () => {
  const CIUDAD = /bogot/i; // tu ciudad
  const D = document;
  if (!/agendamiento\.dian\.gov\.co$/.test(location.host) && !/^127\.0\.0\.1/.test(location.host)) {
    location.href = 'https://agendamiento.dian.gov.co/';
    return;
  }
  let b = D.getElementById('vigia-banner');
  if (!b) {
    b = D.createElement('div');
    b.id = 'vigia-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:14px 12px;font:600 15px/1.35 -apple-system,system-ui,sans-serif;color:white;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    D.body.appendChild(b);
  }
  const msg = (t, c) => { b.textContent = t; b.style.background = c || 'rgb(30,64,175)'; };
  const VERDE = 'rgb(21,128,61)', ROJO = 'rgb(185,28,28)', AMBAR = 'rgb(180,83,9)';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const ciudadDe = (t) => { const m = /^(.+?)\s*[“"«]/.exec(t || ''); return m ? m[1].trim() : ''; };
  const vis = (el) => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const buscar = (re) => {
    let mejor = null, largo = 1e9;
    for (const el of D.body.querySelectorAll('*')) {
      if (el === b || b.contains(el) || /^(script|style|iframe|svg|path|option|select)$/i.test(el.tagName)) continue;
      const t = norm(el.innerText);
      if (!t || t.length > 60 || !re.test(t) || !vis(el)) continue;
      if (t.length < largo) { mejor = el; largo = t.length; }
    }
    return mejor;
  };
  const esperar = async (re, seg) => {
    for (let i = 0; i < seg * 4; i++) { const el = buscar(re); if (el) return el; await sleep(250); }
    return null;
  };
  const clic = (el) => {
    el.scrollIntoView({ block: 'center' });
    for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, view: window }));
    }
    el.click();
  };
  const noHay = () => /no se encontraron especialidades|no (hay|existen?) .{0,40}(disponib|agenda|cita)/i.test(norm(D.body.innerText));
  const listaTramites = () => {
    for (const sel of D.querySelectorAll('select')) {
      if (!(vis(sel) || vis(sel.parentElement))) continue;
      const ops = Array.from(sel.options).filter((o) => !o.disabled && norm(o.text) && !/^(seleccione|--)/i.test(norm(o.text)));
      if (ops.some((o) => /devoluci/i.test(o.text))) return { sel, ops };
    }
    return null;
  };
  const paso = async (texto, re, seg) => {
    msg(texto + '…');
    const el = await esperar(re, seg);
    if (!el) throw new Error(texto);
    clic(el);
    await sleep(900);
  };

  try {
    if (!buscar(/^persona natural$/i)) await paso('Abriendo Agendar cita', /^agendar cita$/i, 15);
    await paso('Persona Natural', /^persona natural$/i, 15);
    await paso('Videoatención', /^video ?atenci[oó]n$/i, 15);
    await paso('Devoluciones', /^devoluciones\.?$/i, 15);

    msg('Revisando si hay agenda…');
    let lista = null;
    for (let i = 0; i < 60 && !lista; i++) {
      if (noHay()) {
        msg('Aún no hay agenda en ninguna ciudad. Intenta de nuevo en unos minutos.', ROJO);
        return;
      }
      lista = listaTramites();
      if (!lista) await sleep(250);
    }
    if (!lista) { msg('No vi la lista de trámites. Sigue a mano desde aquí.', AMBAR); return; }

    const ciudades = [...new Set(lista.ops.map((o) => ciudadDe(norm(o.text))).filter(Boolean))];
    let elegida = lista.ops.find((o) => CIUDAD.test(ciudadDe(norm(o.text))));
    if (!elegida && ciudades.length) {
      msg('Solo hay agenda en: ' + ciudades.join(', ') + '. En tu ciudad todavía no.', ROJO);
      return;
    }
    if (!elegida) elegida = lista.ops.find((o) => /devoluci/i.test(o.text)) || lista.ops[0];
    lista.sel.value = elegida.value;
    lista.sel.dispatchEvent(new Event('input', { bubbles: true }));
    lista.sel.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(1200);

    msg('Siguiente…');
    const sig = await esperar(/^siguiente$/i, 8);
    if (sig) clic(sig);
    const paso2 = await esperar(/^ciudad o municipio/i, 12);
    const donde = ciudadDe(norm(elegida.text)) || 'la ciudad elegida';
    if (paso2) {
      msg('¡Hay agenda en ' + donde + '! Elige la fecha y la hora; luego tus datos, documentos y "No soy un robot".', VERDE);
      paso2.scrollIntoView({ block: 'start' });
    } else {
      msg('Trámite de ' + donde + ' elegido. Toca Siguiente y elige la fecha y la hora.', AMBAR);
    }
  } catch (e) {
    msg('No pude seguir en "' + e.message + '". Continúa a mano desde aquí.', AMBAR);
  }
})();
