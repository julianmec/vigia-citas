# Vigía de citas DIAN

Cada ~5 minutos, GitHub Actions abre https://agendamiento.dian.gov.co en un navegador real y hace
el recorrido **Agendar cita → Persona natural → Videoatención → Devoluciones**. La lista de trámites
trae la ciudad al inicio (p. ej. *Cali “Solicitud de devolución y/o compensación persona natural”*):
solo si aparece una ciudad de `CIUDADES` (por defecto Bogotá) crea un issue con la captura y los días
del calendario. GitHub lo envía por correo.

Cada corrida programa la siguiente (cadena). El horario de GitHub solo reinicia la cadena si se corta,
porque los horarios gratuitos llegan con horas de retraso.

El robot **no agenda** ni escribe datos personales: solo avisa. La cita la toma uno mismo.

## Uso

- **Alertas:** correo de GitHub (notifications@github.com) con el issue "Puede haber citas DIAN".
  Solo se envía uno por cada vez que aparece agenda; ciérralo cuando ya no lo necesites.
- **Ver qué vio el robot:** rama `resultados` → `historial.csv` (cada revisión con su hora y ciudades),
  capturas de cada paso, `resumen.json` y `red.json` de la última corrida.
- **Aviso de prueba:** *Actions → Vigía de citas DIAN → Run workflow* marcando "Enviar un aviso de prueba".
- **Pausar solo los correos:** `AVISOS: 'off'` en el workflow.
- **Pausar:** *Actions → Vigía de citas DIAN → ⋯ → Disable workflow*.
- **Menos consumo (opcional):** *Settings → Environments → espera → Wait timer = 3*. Así la pausa entre
  revisiones no ocupa un servidor.

## Ajustes

- Frecuencia: `PAUSA_MIN` en `.github/workflows/vigia.yml`.
- Ciudad: `CIUDADES` en el workflow y `CIUDAD` en `boton/boton-dian.js`.
- Pasos y frases de "sin agenda": constantes `PASOS` y `SIN_CUPO` en `vigia.js`.
