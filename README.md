# Vigía de citas DIAN

Cada ~5 minutos, GitHub Actions abre https://agendamiento.dian.gov.co en un navegador real,
hace el recorrido **Agendar cita → Persona natural → Videoatención → Devoluciones**
y, si deja de salir el mensaje *"No se encontraron especialidades relacionadas según los
filtros seleccionados"*, crea un issue en este repositorio con la captura. GitHub lo envía por correo.

El robot **no agenda** ni escribe datos personales: solo avisa. La cita la toma uno mismo.

## Uso

- **Alertas:** correo de GitHub (notifications@github.com) con el issue "Puede haber citas DIAN".
  Solo se envía uno por cada vez que aparece agenda; ciérralo cuando ya no lo necesites.
- **Ver qué vio el robot:** rama `resultados` → capturas de cada paso, `resumen.json` y `red.json` de la última corrida.
- **Aviso de prueba:** *Actions → Vigía de citas DIAN → Run workflow* marcando "Enviar un aviso de prueba".
- **Pausar solo los correos:** `AVISOS: 'off'` en el workflow.
- **Pausar:** *Actions → Vigía de citas DIAN → ⋯ → Disable workflow*.

## Ajustes

- Frecuencia: `cron` en `.github/workflows/vigia.yml`.
- Pasos y frases de "sin agenda": constantes `PASOS` y `SIN_CUPO` en `vigia.js`.
