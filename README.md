# Vigía de citas DIAN

Cada ~5 minutos, GitHub Actions abre https://agendamiento.dian.gov.co en un navegador real,
hace el recorrido **Agendamiento de citas → Persona natural → Videoatención → Devoluciones**
y, si la pantalla ya no dice que no hay agenda, envía una alerta urgente con la captura
al celular mediante [ntfy](https://ntfy.sh).

El robot **no agenda** ni escribe datos personales: solo avisa. La cita la toma uno mismo.

## Uso

- **Alertas:** app ntfy en el celular, suscrita al tema configurado en `NTFY_TOPIC`
  (secreto del repositorio; si no existe, se usa el valor de respaldo del workflow).
- **Ver qué vio el robot:** rama `resultados` → capturas de cada paso, `resumen.json` y `red.json` de la última corrida.
- **Aviso de prueba:** *Actions → Vigía de citas DIAN → Run workflow* marcando "Enviar un aviso de prueba".
- **Pausar:** *Actions → Vigía de citas DIAN → ⋯ → Disable workflow*.

## Ajustes

- Frecuencia: `cron` en `.github/workflows/vigia.yml`.
- Pasos y frases de "sin agenda": constantes `PASOS` y `SIN_CUPO` en `vigia.js`.
