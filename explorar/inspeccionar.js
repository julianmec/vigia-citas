// Solo lectura: abre la página real y describe los controles que usa el botón turbo. No envía datos.
'use strict';
const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ locale: 'es-CO', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await page.goto('https://agendamiento.dian.gov.co/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const U = Ciel.MPC.WebPlayer.Utilidad;
    const desc = (p, n) => {
      const c = U.ObtenerControl(p, n);
      if (!c) return null;
      const el = c.DivContenedor && c.DivContenedor[0];
      return {
        tipoControl: c.ObjetoBase && c.ObjetoBase.TipoControl,
        tieneSeleccionarItem: typeof c.SeleccionarItem === 'function',
        elementos: (c.elementosActuales || []).slice(0, 12).map((e) => ({ Llave: e.Llave, claves: Object.keys(e).slice(0, 8), texto: e.Texto || e.Valor || e.Nombre || e.Descripcion })),
        id: c.Id,
        html: el ? el.outerHTML.replace(/\s+/g, ' ').slice(0, 1500) : null,
        contenedor: c.Contenedor ? String(c.Contenedor[0] && c.Contenedor[0].outerHTML).replace(/\s+/g, ' ').slice(0, 2500) : null,
        kendo: !!(c.Contenedor && c.Contenedor.data && c.Contenedor.data('kendoCalendar')),
      };
    };
    return {
      globales: {
        captchaValido: typeof window.captchaValido,
        CargarArchivo: typeof window.CargarArchivo,
        archivosSeleccionadosObj: typeof window.archivosSeleccionadosObj,
        PasoTres: typeof window.PasoTres,
        configTiposDocumento: typeof window.configTiposDocumento,
        kendoVersion: window.kendo && kendo.version,
      },
      Ciudades: desc('PasoDos', 'Ciudades'),
      Sedes: desc('PasoDos', 'Sedes'),
      Calendario: desc('PasoDos', 'Calendario'),
      Horas: desc('PasoDos', 'Horas'),
      TipoDocumento: desc('PasoTres', 'TipoDocumento'),
      DatosCorretos: desc('PasoTres', 'DatosCorretos'),
      TerminosCondiciones: desc('PasoTres', 'TerminosCondiciones'),
      tbxNumeroDoc: desc('PasoTres', 'tbxNumeroDoc'),
      txtDocumentosCargados: desc('PasoTres', 'txtDocumentosCargados'),
      btnSiguientePasoDos: !!document.querySelector('div[contenido="botonesPasoDos"] > div[nombreControl="btnSiguiente"]'),
      btnSiguientePasoTres: !!document.querySelector('div[contenido="botonesPasoTres"] > div[nombreControl="btnSiguiente"]'),
      btnAgendar: !!document.querySelector('div[contenido="botonesPasoCuatro"] > div[nombreControl="btnAgendarCita"]'),
      modalInfo: (document.querySelector('[nombrepantalla="ModalInfoCita"]') || {}).innerText,
      listaArchivos: !!document.querySelector('#document-images.list'),
    };
  });
  fs.mkdirSync('salida-inspeccion', { recursive: true });
  fs.writeFileSync('salida-inspeccion/controles.json', JSON.stringify(info, null, 2));
  console.log(JSON.stringify(info.globales));
  await browser.close();
})();
