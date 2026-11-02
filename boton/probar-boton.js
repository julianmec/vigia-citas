// Prueba el marcador "Cita DIAN" contra la página real (lo corre GitHub Actions).
'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const SALIDA = path.join(__dirname, '..', 'salida-boton');
const codigo = fs.readFileSync(path.join(__dirname, 'marcador.txt'), 'utf8').replace(/^javascript:/, '');

(async () => {
  fs.mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  // Pantalla de iPhone, como lo usarás tú.
  const context = await browser.newContext({ locale: 'es-CO', timezoneId: 'America/Bogota', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const res = { hora: new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' }) };
  try {
    await page.goto('https://agendamiento.dian.gov.co/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.evaluate(codigo);
    let t = '';
    for (let i = 0; i < 90; i++) {
      t = await page.evaluate(() => { const b = document.getElementById('vigia-banner'); return b ? `${b.textContent} [${b.style.background}]` : ''; });
      if (/rgb\((21|185|180),/.test(t)) break;
      await page.waitForTimeout(500);
    }
    res.banner = t;
  } catch (e) {
    res.error = e.message;
  }
  await page.screenshot({ path: path.join(SALIDA, 'boton.png') }).catch(() => {});
  fs.writeFileSync(path.join(SALIDA, 'resumen.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res));
  await browser.close();
})();
