# Vigía de citas DIAN

Cada ~5 minutos, GitHub Actions abre https://agendamiento.dian.gov.co en un navegador real y hace
el recorrido **Agendar cita → Persona natural → Videoatención → Devoluciones**. La lista de trámites
trae la ciudad al inicio (p. ej. *Cali “Solicitud de devolución y/o compensación persona natural”*):
solo si aparece el trámite de `TRAMITE` (vehículos eléctricos o híbridos) en una ciudad de `CIUDADES`
(Bogotá) crea un issue con la captura y los días del calendario. GitHub lo envía por correo.

Cada corrida revisa `VUELTAS` veces, una cada ~1 minuto, y se detiene apenas encuentra el trámite.

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
- Ciudad y trámite: `CIUDADES` y `TRAMITE` en el workflow; `CIUDAD` y `TRAMITE` en `boton/boton-dian.js`.
- Pasos y frases de "sin agenda": constantes `PASOS` y `SIN_CUPO` en `vigia.js`.

## Botón turbo de Safari (`boton/`)

Instalación: el marcador **Cita DIAN** es `boton/marcador-corto.txt`. La página de la DIAN no deja cargar
código de otros sitios (Content-Security-Policy), así que la primera vez el marcador pide pegar el código
completo (`boton/codigo.txt`) y lo guarda en el iPhone. `boton/marcador.txt` es la versión todo-en-uno.

El botón En la página de la DIAN hace todo el agendamiento
menos el "No soy un robot", que toca la persona: trámite de vehículos en Bogotá, primera fecha y hora,
tipo y número de documento, "datos correctos: Sí", documentos, "Acepto", Siguiente y **Agendar cita**.
El documento y los archivos se guardan solo en el iPhone (almacenamiento de Safari para la página de la
DIAN); la primera vez, o tocando ⚙︎ en la franja, se abre la configuración.

