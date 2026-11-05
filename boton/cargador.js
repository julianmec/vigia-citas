// Marcador corto "Cita DIAN". La página de la DIAN no deja descargar código de otros sitios,
// así que el código completo del botón se pega UNA vez y queda guardado en este iPhone.
(() => {
  const K = 'vigiaCodigoDIAN', d = document;
  if (!/agendamiento\.dian\.gov\.co$/.test(location.host) && !/^127\.0\.0\.1/.test(location.host)) { location.href = 'https://agendamiento.dian.gov.co/'; return; }
  const correr = (t) => { const s = d.createElement('script'); s.textContent = t; d.body.appendChild(s); s.remove(); };
  let c = null;
  try { c = localStorage.getItem(K); } catch (e) { /* sin almacenamiento */ }
  if (c) { correr(c); return; }
  const o = d.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;color:#111;padding:20px 16px;overflow:auto;font:16px/1.4 -apple-system,system-ui,sans-serif;text-align:left';
  o.innerHTML = '<h2 style="margin:0 0 8px;font-size:21px">Instalar Cita DIAN</h2>' +
    '<p style="margin:0 0 10px">Pega aquí el código largo del botón (mantén el dedo en el recuadro → Pegar) y toca Guardar.</p>' +
    '<textarea style="display:block;width:100%;height:40vh;box-sizing:border-box;font:12px ui-monospace,monospace;border:1px solid #bbb;border-radius:8px;padding:8px"></textarea>' +
    '<p><button style="font:600 17px -apple-system,sans-serif;padding:12px 18px;border:0;border-radius:10px;background:#15803d;color:#fff">Guardar</button> ' +
    '<button style="font:600 17px -apple-system,sans-serif;padding:12px 18px;border:0;border-radius:10px;background:#e5e7eb;color:#111">Cancelar</button></p>' +
    '<p class="m" style="font-weight:600;color:#b91c1c"></p>';
  d.body.appendChild(o);
  const [g, x] = o.querySelectorAll('button'), ta = o.querySelector('textarea');
  x.onclick = () => o.remove();
  g.onclick = () => {
    let t = ta.value.trim();
    if (/^javascript:/i.test(t)) { t = t.replace(/^javascript:/i, ''); try { t = decodeURIComponent(t); } catch (e) { /* ya venía decodificado */ } }
    if (!/vigiaCitaDIAN/.test(t) || !/^\(async/.test(t)) { o.querySelector('.m').textContent = 'Ese no es el código del botón. Cópialo completo e inténtalo otra vez.'; return; }
    try { localStorage.setItem(K, t); } catch (e) { o.querySelector('.m').textContent = 'Safari no dejó guardar (¿navegación privada?).'; return; }
    o.remove();
    correr(t);
  };
})();
