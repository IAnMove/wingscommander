# STAR WING // 2026

Clon modernizado de **Wing Commander**: combate espacial en primera persona desde la cabina,
con oleadas de cazas enemigos, ases, misiles con bloqueo de objetivo, radar, escudos
regenerativos y estética 2026 (bloom, nebulosas, sonido sintetizado en tiempo real).

Hecho con [Three.js](https://threejs.org) vía CDN — sin build ni dependencias que instalar.

## Cómo jugar

El juego usa módulos ES, así que necesita un servidor local (no funciona con doble clic en `index.html`):

- **Windows:** doble clic en `jugar.bat` (usa Python), o
- `python -m http.server 8000` y abre http://localhost:8000
- Alternativa: `npx serve .`

Necesita conexión a internet la primera vez (Three.js se carga desde unpkg).

## Controles

| Entrada | Acción |
|---|---|
| Ratón | Pilotar (joystick virtual, estilo Wing Commander) |
| Clic izq / Espacio | Cañones láser (cuidado con el sobrecalentamiento) |
| Clic der / M | Lanzar misil (mantén el objetivo en la retícula para fijarlo) |
| W / S | Acelerador |
| A / D | Alabeo |
| Shift | Postcombustión |
| T | Cambiar objetivo |
| P / Esc | Pausa |

## Reglas

- Los escudos se regeneran; el casco no. Recoge cápsulas de energía verdes para recuperar escudos.
- Cada oleada despejada da +500 puntos y +25 de escudos.
- En oleadas impares a partir de la 3 aparece un **as enemigo** (más rápido y resistente).
