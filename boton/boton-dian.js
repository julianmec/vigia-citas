// Botón "Cita DIAN" TURBO para Safari (marcador).
// Hace todo el agendamiento de la DIAN menos el "No soy un robot", que lo tocas tú:
//   1. Agendar cita → Persona Natural → Videoatención → Devoluciones → trámite de vehículos en Bogotá → Siguiente
//   2. Ciudad, primera fecha y primera hora disponibles → Siguiente
//   3. Espera a que toques "No soy un robot"; luego tipo y número de documento, "datos correctos: Sí",
//      tus documentos, "Acepto" → Siguiente
//   4. Agendar cita
// Tu documento y tus archivos se guardan SOLO en este iPhone (almacenamiento de Safari para la página de la DIAN).
// La primera vez (o tocando ⚙︎ en la franja) se abre la configuración.
(async () => {
  const CIUDAD = /bogot/i;
  const TRAMITE = /veh[ií]culo|el[eé]ctric|h[ií]brid/i;
  const CLAVE = 'vigiaCitaDIAN';
  const TIPOS_OK = /\.(pdf|xls|xlsx|csv|doc|docx|txt|png|jpg|bmp|jpeg|zip|rar|7z)$/i;
  const D = document, W = window;
  if (!/agendamiento\.dian\.gov\.co$/.test(location.host) && !/^127\.0\.0\.1/.test(location.host)) {
    location.href = 'https://agendamiento.dian.gov.co/';
    return;
  }
  const yo = Date.now();
  if (W.__vigiaActivo && yo - W.__vigiaActivo < 4000) return; // doble toque
  W.__vigiaActivo = yo;
  W.__vigiaCorrida = yo;
  const vigente = () => W.__vigiaCorrida === yo; // si se vuelve a tocar el botón, la corrida anterior se detiene

  /* ---------------- Franja de estado ---------------- */
  let b = D.getElementById('vigia-banner');
  if (!b) {
    b = D.createElement('div');
    b.id = 'vigia-banner';
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483646;padding:12px 44px 12px 12px;font:600 15px/1.35 -apple-system,system-ui,sans-serif;color:#fff;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    D.body.appendChild(b);
  }
  const AZUL = 'rgb(30,64,175)', VERDE = 'rgb(21,128,61)', ROJO = 'rgb(185,28,28)', AMBAR = 'rgb(180,83,9)', MORADO = 'rgb(109,40,217)';
  const msg = (t, c) => {
    b.textContent = t;
    b.style.background = c || AZUL;
    const g = D.createElement('span');
    g.textContent = '⚙︎';
    g.title = 'Configurar';
    g.style.cssText = 'position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:22px;cursor:pointer;padding:4px';
    g.onclick = (e) => { e.stopPropagation(); configurar(true); };
    b.appendChild(g);
  };

  /* ---------------- Utilidades ---------------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const vis = (el) => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
  };
  const hasta = async (fn, seg) => {
    for (let i = 0; i < seg * 5; i++) {
      if (!vigente()) throw new Error('detenido');
      let r = null;
      try { r = await fn(); } catch (e) { r = null; }
      if (r) return r;
      await sleep(200);
    }
    return null;
  };
  const clic = (el) => {
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* ignorar */ }
    for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, view: W }));
    }
    el.click();
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
  const ctrl = (p, n) => { try { return W.Ciel.MPC.WebPlayer.Utilidad.ObtenerControl(p, n); } catch (e) { return null; } };
  const caja = (p, n) => { const c = ctrl(p, n); return (c && c.DivContenedor && c.DivContenedor[0]) || D.querySelector('div[pantalla="' + p + '"][nombre="' + n + '"]'); };
  const pantalla = (n) => { const el = D.querySelector('div[tipo="Pantalla"][nombre="' + n + '"]'); return el && vis(el); };
  const boton = (grupo, n) => {
    const el = D.querySelector('div[contenido="' + grupo + '"] > div[nombreControl="' + n + '"]');
    return el && vis(el) && !el.classList.contains('contenidoOculto') ? el : null;
  };
  const opciones = (p, n) => {
    const c = caja(p, n);
    const s = c && c.querySelector('select');
    return s ? Array.from(s.options).filter((o) => o.value && norm(o.text) && !/^seleccione/i.test(norm(o.text))) : [];
  };
  const elegirLista = (p, n, re, llave) => {
    const ops = opciones(p, n);
    if (!ops.length) return null;
    const o = (llave && ops.find((x) => x.value === String(llave))) || (re && ops.find((x) => re.test(norm(x.text)))) || ops[0];
    const s = o.parentElement;
    if (s.value === o.value) return o;
    const c = ctrl(p, n);
    if (c && typeof c.SeleccionarItem === 'function') c.SeleccionarItem(o.value);
    else { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); }
    return o;
  };
  const ponerTexto = (inp, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    inp.focus();
    set.call(inp, v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.blur();
  };
  const ciudadDe = (x) => {
    const t = (x || '').replace(/^[\s"“”«»']+/, '');
    const m = /^(.+?)\s*(?:\s[-–]\s|[“"«])/.exec(t);
    return m ? m[1].trim() : '';
  };
  const etiqueta = (x) => (ciudadDe(x) || '?') + (TRAMITE.test(x) ? ' (vehículos)' : '');

  /* ---------------- Datos guardados en este iPhone ---------------- */
  const leerCfg = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { return null; } };
  const guardarCfg = (o) => { try { localStorage.setItem(CLAVE, JSON.stringify(o)); return true; } catch (e) { return false; } };
  const abrirDB = () => new Promise((ok, mal) => {
    const r = indexedDB.open(CLAVE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('docs', { autoIncrement: true });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  const docsLeer = async () => {
    try {
      const db = await abrirDB();
      return await new Promise((ok) => {
        const out = [];
        const q = db.transaction('docs').objectStore('docs').openCursor();
        q.onsuccess = () => { const c = q.result; if (c) { out.push(c.value); c.continue(); } else ok(out); };
        q.onerror = () => ok(out);
      });
    } catch (e) { return []; }
  };
  const docsGuardar = async (files) => {
    const datos = [];
    for (const f of files) datos.push({ name: f.name, type: f.type || 'application/octet-stream', data: await f.arrayBuffer() });
    const db = await abrirDB();
    await new Promise((ok, mal) => {
      const tx = db.transaction('docs', 'readwrite');
      const st = tx.objectStore('docs');
      st.clear();
      datos.forEach((d) => st.add(d));
      tx.oncomplete = ok;
      tx.onerror = () => mal(tx.error);
    });
    return datos.length;
  };

  function configurar(desdeBoton) {
    W.__vigiaCorrida = 0; // detener cualquier corrida mientras se configura
    return new Promise(async (resolver) => {
      const cfg = leerCfg() || {};
      const guardados = await docsLeer();
      const viejo = D.getElementById('vigia-config');
      if (viejo) viejo.remove();
      const o = D.createElement('div');
      o.id = 'vigia-config';
      o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;color:#111;overflow:auto;padding:20px 16px 40px;font:16px/1.4 -apple-system,system-ui,sans-serif;text-align:left';
      const campo = 'display:block;width:100%;box-sizing:border-box;font-size:17px;padding:10px;margin:6px 0 14px;border:1px solid #bbb;border-radius:8px;background:#fff;color:#111';
      const btn = 'font:600 17px -apple-system,system-ui,sans-serif;padding:12px 18px;border-radius:10px;border:0;margin-right:8px';
      o.innerHTML =
        '<h2 style="margin:0 0 6px;font-size:21px">Configurar Cita DIAN</h2>' +
        '<p style="margin:0 0 16px;color:#555">Se guarda solo en este iPhone. El botón lo usa para llenar el paso 3 en segundos.</p>' +
        '<label>Tipo de documento<select id="vg-t" style="' + campo + '"></select></label>' +
        '<label>Número de documento<input id="vg-n" inputmode="numeric" autocomplete="off" style="' + campo + '"></label>' +
        '<label>Documentos de la devolución (hasta 10, máx. 10 MB c/u)<input id="vg-f" type="file" multiple style="' + campo + '"></label>' +
        '<div id="vg-d" style="margin:-8px 0 14px;color:#444;font-size:14px"></div>' +
        '<details style="margin:0 0 16px"><summary style="cursor:pointer">Solo si la DIAN no tiene tus datos (opcional)</summary>' +
        '<label>Nombre completo<input id="vg-nom" style="' + campo + '"></label>' +
        '<label>Celular<input id="vg-cel" inputmode="numeric" style="' + campo + '"></label>' +
        '<label>Correo<input id="vg-cor" type="email" style="' + campo + '"></label></details>' +
        '<button id="vg-g" style="' + btn + ';background:#15803d;color:#fff">Guardar</button>' +
        '<button id="vg-c" style="' + btn + ';background:#e5e7eb;color:#111">Cancelar</button>' +
        '<p id="vg-m" style="margin-top:14px;font-weight:600"></p>' +
        '<p style="margin-top:28px;font-size:14px"><a href="#" id="vg-r" style="color:#1d4ed8">Reemplazar el c\u00f3digo del bot\u00f3n (para instalar una versi\u00f3n nueva)</a></p>';
      D.body.appendChild(o);
      const $ = (id) => o.querySelector('#' + id);
      const tipos = W.configTiposDocumento || { 2: { Documento: 'La cédula de ciudadanía' }, 3: { Documento: 'La cédula de extranjería' }, 7: { Documento: 'El pasaporte' } };
      Object.keys(tipos).forEach((k) => {
        const n = norm((tipos[k].Documento || '').replace(/^(la|el)\s+/i, ''));
        if (!n) return;
        const op = D.createElement('option');
        op.value = k;
        op.textContent = n.charAt(0).toUpperCase() + n.slice(1);
        $('vg-t').appendChild(op);
      });
      $('vg-t').value = cfg.t || '2';
      $('vg-n').value = cfg.n || '';
      $('vg-nom').value = cfg.nom || '';
      $('vg-cel').value = cfg.cel || '';
      $('vg-cor').value = cfg.cor || '';
      $('vg-d').textContent = guardados.length ? 'Guardados: ' + guardados.map((d) => d.name).join(', ') + '. Elige archivos solo si quieres reemplazarlos.' : 'Aún no hay documentos guardados.';
      const cerrar = (r) => { o.remove(); resolver(r); };
      $('vg-c').onclick = () => cerrar(null);
      $('vg-r').onclick = (e) => {
        e.preventDefault();
        try { localStorage.removeItem('vigiaCodigoDIAN'); } catch (x) { /* ignorar */ }
        cerrar(null);
        msg('Listo. Toca Cita DIAN y pega el c\u00f3digo nuevo.', AMBAR);
      };
      $('vg-g').onclick = async () => {
        const m = $('vg-m');
        const n = norm($('vg-n').value).replace(/[.\s,]/g, '').toUpperCase();
        if (!n) { m.style.color = '#b91c1c'; m.textContent = 'Escribe tu número de documento.'; return; }
        const files = Array.from($('vg-f').files || []);
        const malos = files.filter((f) => !TIPOS_OK.test(f.name) || f.size > 10 * 1024 * 1024);
        if (malos.length) { m.style.color = '#b91c1c'; m.textContent = 'No sirven: ' + malos.map((f) => f.name).join(', ') + ' (tipo o tamaño).'; return; }
        if (files.length > 10) { m.style.color = '#b91c1c'; m.textContent = 'Máximo 10 archivos.'; return; }
        m.style.color = '#111';
        m.textContent = 'Guardando…';
        try {
          const nuevo = { t: $('vg-t').value, n, nom: norm($('vg-nom').value), cel: norm($('vg-cel').value), cor: norm($('vg-cor').value) };
          if (!guardarCfg(nuevo)) throw new Error('Safari no dejó guardar (¿navegación privada?)');
          const k = files.length ? await docsGuardar(files) : guardados.length;
          cerrar(nuevo);
          msg('Listo: guardé tu documento y ' + k + ' archivo(s) en este iPhone. Cuando suene la alarma, toca Cita DIAN.', VERDE);
        } catch (e) {
          m.style.color = '#b91c1c';
          m.textContent = 'No se pudo guardar: ' + e.message;
        }
      };
    });
  }

  /* ---------------- Documentos al paso 3 ---------------- */
  async function cargarDocs() {
    const docs = await docsLeer();
    if (!docs.length || typeof W.CargarArchivo !== 'function') return 0;
    const ya = new Set(((W.archivosSeleccionadosObj && W.archivosSeleccionadosObj.files) || []).map((f) => f.file && f.file.name));
    let n = 0;
    for (const d of docs) {
      if (ya.has(d.name)) { n++; continue; }
      try { W.CargarArchivo(new File([d.data], d.name, { type: d.type })); n++; } catch (e) { /* seguir con los demás */ }
    }
    await hasta(() => !W.archivosSeleccionadosObj || W.archivosSeleccionadosObj.files.every((f) => f.base64), 15);
    const t = caja('PasoTres', 'txtDocumentosCargados');
    const sp = t && (t.querySelector('span') || t);
    if (sp && n) sp.textContent = n + ' Documentos cargados';
    return n;
  }

  /* ---------------- Pasos ---------------- */
  async function pasoUno() {
    const paso = async (texto, re, seg) => {
      msg(texto + '…');
      const el = await hasta(() => buscar(re), seg);
      if (!el) throw new Error(texto);
      clic(el);
      await sleep(350);
    };
    if (!buscar(/^persona natural$/i)) await paso('Abriendo Agendar cita', /^agendar cita$/i, 15);
    await paso('Persona Natural', /^persona natural$/i, 15);
    await paso('Videoatención', /^video ?atenci[oó]n$/i, 15);
    await paso('Devoluciones', /^devoluciones\.?$/i, 15);
    msg('Revisando si hay agenda…');
    const noHay = () => /no se encontraron especialidades|no (hay|existen?) .{0,40}(disponib|agenda|cita)/i.test(norm(D.body.innerText));
    const lista = await hasta(() => {
      if (noHay()) return 'no';
      for (const s of D.querySelectorAll('select')) {
        if (!(vis(s) || vis(s.parentElement))) continue;
        const ops = Array.from(s.options).filter((o) => !o.disabled && norm(o.text) && !/^(seleccione|--)/i.test(norm(o.text)));
        if (ops.some((o) => /devoluci/i.test(o.text))) return { s, ops };
      }
      return null;
    }, 15);
    if (lista === 'no') { msg('Aún no hay agenda en ninguna ciudad. Intenta de nuevo en unos minutos.', ROJO); return false; }
    if (!lista) throw new Error('lista de trámites');
    const legibles = lista.ops.some((o) => ciudadDe(norm(o.text)));
    let el = lista.ops.find((o) => CIUDAD.test(ciudadDe(norm(o.text))) && TRAMITE.test(o.text));
    if (!el && legibles) {
      const hay = [...new Set(lista.ops.map((o) => etiqueta(norm(o.text))))];
      msg('Hay agenda solo en: ' + hay.join(', ') + '. Para vehículos en tu ciudad todavía no.', ROJO);
      return false;
    }
    if (!el) el = lista.ops.find((o) => TRAMITE.test(o.text)) || lista.ops[0];
    lista.s.value = el.value;
    lista.s.dispatchEvent(new Event('input', { bubbles: true }));
    lista.s.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(500);
    msg('Siguiente…');
    const sig = await hasta(() => boton('botonesPasoUno', 'btnSiguiente') || buscar(/^siguiente$/i), 8);
    if (sig) clic(sig);
    return true;
  }

  function primerDia() {
    const cal = D.querySelector('#calendar') || caja('PasoDos', 'Calendario');
    if (!cal) return null;
    const celdas = Array.from(cal.querySelectorAll('td[role="gridcell"]')).filter((td) =>
      !td.classList.contains('k-disabled') && !td.classList.contains('k-state-disabled') && !td.classList.contains('k-other-month'));
    if (!celdas.length) return null;
    return celdas[0].querySelector('.k-link') || celdas[0];
  }

  async function pasoDos() {
    msg('Eligiendo ciudad, fecha y hora…', MORADO);
    if (await hasta(() => opciones('PasoDos', 'Ciudades').length, 10)) {
      elegirLista('PasoDos', 'Ciudades', CIUDAD);
      await sleep(600);
    }
    if (await hasta(() => vis(caja('PasoDos', 'Sedes')) && opciones('PasoDos', 'Sedes').length, 2)) {
      elegirLista('PasoDos', 'Sedes');
      await sleep(600);
    }
    const bf = caja('PasoDos', 'btnFecha');
    if (bf && vis(bf)) { clic(bf); await sleep(400); }
    let dia = await hasta(primerDia, 8);
    for (let i = 0; !dia && i < 2; i++) {
      const sig = D.querySelector('#calendar .k-calendar-nav-next, #calendar .k-nav-next, #calendar [aria-label*="Next" i], #calendar [aria-label*="Siguiente" i]');
      if (!sig) break;
      clic(sig);
      dia = await hasta(primerDia, 3);
    }
    if (!dia) throw new Error('fecha');
    const fecha = norm((dia.closest('td') || dia).getAttribute('title') || dia.getAttribute('title') || dia.textContent);
    clic(dia);
    const HORA = /\d{1,2}:\d{2}/;
    if (!await hasta(() => opciones('PasoDos', 'Horas').some((o) => HORA.test(o.text)), 12)) throw new Error('hora');
    const h = elegirLista('PasoDos', 'Horas', HORA);
    await sleep(500);
    const sig = await hasta(() => boton('botonesPasoDos', 'btnSiguiente'), 6) || D.querySelector('div[contenido="botonesPasoDos"] > div[nombreControl="btnSiguiente"]');
    if (!sig) throw new Error('Siguiente del paso 2');
    clic(sig);
    return (fecha ? fecha + ' ' : '') + (h ? norm(h.text) : '');
  }

  async function pasoTres(cfg) {
    const cap = await hasta(() => pantalla('PasoTres') && caja('PasoTres', 'Captcha'), 15);
    if (!cap) throw new Error('paso 3');
    const nDocs = await cargarDocs();
    try { cap.scrollIntoView({ block: 'center' }); } catch (e) { /* ignorar */ }
    msg('👉 Toca "No soy un robot". Después yo lleno todo y agendo.', MORADO);
    if (!await hasta(() => W.captchaValido === true, 600)) throw new Error('No soy un robot');
    msg('Llenando tus datos' + (nDocs ? ' y ' + nDocs + ' documento(s)' : '') + '…', MORADO);
    if (await hasta(() => opciones('PasoTres', 'TipoDocumento').length, 6)) {
      elegirLista('PasoTres', 'TipoDocumento', /c[eé]dula de ciudadan/i, cfg.t);
      await sleep(400);
    }
    const inp = await hasta(() => { const i = D.querySelector('div[pantalla="PasoTres"][nombre="tbxNumeroDoc"] input'); return i && vis(i) && i; }, 6);
    if (!inp) throw new Error('número de documento');
    ponerTexto(inp, cfg.n);
    const abierto = (sel) => { const el = D.querySelector(sel); return el && vis(el) && !el.classList.contains('contenidoOculto'); };
    const r = await hasta(() => {
      if (abierto('div[contenido="usuarioEncontrado"]')) return 'encontrado';
      if (abierto('div[contenido="nombre"]') || abierto('div[contenido="contacto"]')) return 'nuevo';
      return null;
    }, 12);
    const pon = (n, v) => { const i = D.querySelector('div[pantalla="PasoTres"][nombre="' + n + '"] input'); if (i && v && !i.value) ponerTexto(i, v); return !!(i && i.value); };
    if (r === 'encontrado') {
      const c = ctrl('PasoTres', 'DatosCorretos');
      if (c && typeof c.SeleccionarItem === 'function') c.SeleccionarItem('1');
      else { const si = caja('PasoTres', 'DatosCorretos'); const x = si && si.querySelector('input[type="radio"][value="1"]'); if (x) clic(x); }
      await sleep(600);
      pon('tbxTelefono', cfg.cel);
      pon('tbxCorreo', cfg.cor);
    } else {
      const a = pon('tbxNombreCompleto', cfg.nom), t = pon('tbxTelefono', cfg.cel), c = pon('tbxCorreo', cfg.cor);
      const ok = a && t && c;
      if (!ok) { msg('La DIAN no tiene tus datos: escribe nombre, celular y correo y toca Siguiente. Yo agendo en el paso 4.', AMBAR); return false; }
      await sleep(300);
    }
    const chk = D.querySelector('.checkBoxTerminos input[type="checkbox"]');
    if (chk && !chk.checked) chk.click();
    await sleep(300);
    const sig = await hasta(() => boton('botonesPasoTres', 'btnSiguiente'), 4) || D.querySelector('div[contenido="botonesPasoTres"] > div[nombreControl="btnSiguiente"]');
    if (!sig) throw new Error('Siguiente del paso 3');
    clic(sig);
    await sleep(800);
    const err = D.querySelector('div[pantalla="PasoTres"][nombre="txtErrorFormulario"] span');
    if (pantalla('PasoTres') && err && norm(err.textContent)) { msg('Falta algo en el paso 3: ' + norm(err.textContent) + '. Corrígelo y toca Siguiente; yo agendo en el paso 4.', AMBAR); return false; }
    return true;
  }

  async function pasoCuatro(minutos) {
    const ag = await hasta(() => boton('botonesPasoCuatro', 'btnAgendarCita'), minutos * 60);
    if (!ag) throw new Error('Agendar cita');
    msg('Agendando…', MORADO);
    clic(ag);
    const res = await hasta(() => {
      for (const [n, t] of [['ModalInfoCita', 'ok'], ['ModalError', 'error'], ['ModalSinCitas', 'sin']]) {
        const m = D.querySelector('div[tipo="Pantalla"][nombre="' + n + '"]');
        if (m && vis(m)) return [t, norm(m.innerText)];
      }
      return null;
    }, 40);
    if (res && res[0] === 'ok') msg('✅ ¡Cita agendada! ' + res[1].slice(0, 160), VERDE);
    else if (res) msg('La DIAN respondió: ' + res[1].slice(0, 160) + ' Toca Cita DIAN otra vez para intentar con otra hora.', ROJO);
    else msg('Toqué "Agendar cita". Revisa la pantalla y tu correo.', AMBAR);
  }

  /* ---------------- Orquestación ---------------- */
  let cfg = leerCfg();
  if (!cfg || !cfg.n) {
    msg('Primero configura tus datos (solo una vez).', AMBAR);
    cfg = await configurar(false);
    return;
  }
  W.__vigiaCorrida = yo;
  try {
    let detalle = '';
    if (pantalla('PasoCuatro')) { await pasoCuatro(1); return; }
    if (!pantalla('PasoTres')) {
      if (!pantalla('PasoDos')) {
        if (!await pasoUno()) return;
        if (!await hasta(() => pantalla('PasoDos'), 12)) throw new Error('paso 2');
      }
      detalle = await pasoDos();
    }
    const auto = await pasoTres(cfg);
    if (detalle) b.title = detalle;
    await pasoCuatro(auto ? 1 : 10);
  } catch (e) {
    if (e.message !== 'detenido') msg('No pude seguir en "' + e.message + '". Continúa a mano desde aquí (o toca Cita DIAN otra vez).', AMBAR);
  }
})();
