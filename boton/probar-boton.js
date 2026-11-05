// Prueba el marcador "Cita DIAN" contra la página real (lo corre GitHub Actions).
// Se detiene antes del "No soy un robot": nunca escribe documento ni agenda nada.
'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const SALIDA = path.join(__dirname, '..', 'salida-boton');
const url = fs.readFileSync(path.join(__dirname, 'marcador-corto.txt'), 'ascii');
const codigo = fs.readFileSync(path.join(__dirname, 'codigo.txt'), 'ascii');

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  process.on('unhandledRejection', (e) => { fs.writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify({ errorFatal: String(e && e.stack || e) }, null, 2)); process.exit(1); });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errores = [];
  page.on('pageerror', (e) => errores.push(e.message));
  const res = { hora: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) };
  try {
    await page.goto('https://agendamiento.dian.gov.co/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    // Configuración ficticia para que no abra la pantalla de configuración (el número nunca se escribe).
    await page.evaluate(() => localStorage.setItem('vigiaCitaDIAN', JSON.stringify({ t: '2', n: '1' })));
    // Instalación como lo hará la persona: marcador corto → pegar el código → Guardar.
    await page.evaluate((u) => { const a = document.createElement('a'); a.href = u; document.body.appendChild(a); a.click(); a.remove(); }, url);
    await page.waitForSelector('textarea', { timeout: 5000 });
    await page.fill('textarea', codigo);
    await page.click('button:has-text("Guardar")');
    res.instalado = await page.evaluate(() => (localStorage.getItem('vigiaCodigoDIAN') || '').length);
    let t = '';
    for (let i = 0; i < 120; i++) {
      t = await page.evaluate(() => { const b = document.getElementById('vigia-banner'); return b ? `${b.textContent} [${b.style.background}]` : ''; });
      if (/rgb\((21|185|180),|No soy un robot/.test(t)) break;
      await page.waitForTimeout(500);
    }
    res.banner = t;
    await page.screenshot({ path: path.join(SALIDA, 'boton.png') }).catch(() => {});
    // Detener el botón antes de cualquier dato.
    await page.evaluate(() => { window.__vigiaCorrida = 0; localStorage.removeItem('vigiaCitaDIAN'); localStorage.removeItem('vigiaCodigoDIAN'); });
  } catch (e) {
    res.error = e.message;
  }
  res.erroresPagina = errores.slice(0, 5);
  fs.writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res));
  await browser.close();
})();
