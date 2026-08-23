# STAR WING // SURVIVORS

**Wing Commander × Vampire Survivors.** Pilotas un caza en primera (o tercera) persona sobre
la superficie de planetas épicos, mientras enjambres interminables de enemigos te acosan.
Tus armas disparan solas: tú vuelas, esquivas, recoges experiencia y **evolucionas**.

Hecho con [Three.js](https://threejs.org) vía CDN — sin build ni dependencias que instalar.

## Novedades de esta versión

- **Planeta esférico inmenso y circunnavegable.** El mundo es una esfera enorme (estilo Star Fox):
  parece casi infinito, pero si vuelas lo suficiente **regresas al punto de partida**. La superficie
  tiene relieve y estructuras fijas (espirales de plasma, torres, **faros nombrados**) que dan
  sensación de velocidad y sirven de referencia. Eliges entre cuatro mundos épicos:
  - **HELIOS PRIME** — una estrella enana de plasma (gravedad intensa, enemigos feroces).
  - **VEGA AZUL** — una gigante azul de plasma frío (gravedad extrema, enjambre implacable).
  - **GIGANTE JOVIANO** — un gigante gaseoso de bandas y tormentas (gravedad moderada).
  - **ABISMO TURQUESA** — un gigante helado de bandas turquesa (gravedad suave).
- **Mapa planetario con niebla de guerra.** Un minimapa (abajo, centro) muestra lo que has
  explorado; el resto permanece oculto hasta que lo sobrevuelas (estilo Vampire Survivors).
  Pulsa **M** para el mapa a pantalla completa. Los **faros** se marcan al **descubrirlos**.
- **Gravedad planetaria** que te atrae hacia la superficie, con **techo de altitud** que te impide
  huir al espacio profundo (si te alejas, la gravedad te reclama de vuelta).
- **Tres cámaras + zoom.** **C** cicla entre **cenital pura** (top-down: la nave avanza sola,
  **A/D** la desplazan lateral — ideal para el enjambre),
  **3ª persona** cinematográfica (seguimiento suave) y **1ª persona** desde la cabina. La **rueda del
  ratón** aleja/acerca la cámara en las vistas cenital y 3ª. Muchísima **distancia de dibujado** con
  horizonte curvo, atmósfera en el limbo y buffer de profundidad logarítmico.
- **Modo supervivencia** — enjambres continuos que escalan con el tiempo.
- **6 armas automáticas visualmente distintas** (con destellos de disparo):
  - 🔫 **Cañones Frontales** · 🛰️ **Torretas Auto 360°** · 🪐 **Orbes Orbitales**
  - 🚀 **Misiles Enjambre** · ⚡ **Rayo de Plasma** (haz continuo) · 💥 **Nova de Choque** (onda en área)
- **Experiencia y niveles.** Los enemigos sueltan **gemas de XP** (y, raramente, **reparación**).
  Al subir de nivel eliges una mejora: subir/desbloquear un arma, blindaje, imán o velocidad.

## Cómo jugar

El juego usa módulos ES, así que necesita un servidor local (no funciona con doble clic en `index.html`):

- **Windows:** doble clic en `jugar.bat` (usa Python), o
- `python -m http.server 8000` y abre http://localhost:8000
- Alternativa: `npx serve .`

Necesita conexión a internet la primera vez (Three.js se carga desde unpkg).

## Controles

| Entrada | Acción |
|---|---|
| Ratón | Pilotar (joystick virtual, vistas 1ª/3ª persona) |
| W / S | Acelerador (1ª/3ª persona) |
| A / D | Alabeo (1ª/3ª persona) |
| **A / D o ← / →** | **En vista cenital: desplazamiento lateral (la nave avanza sola, siempre hacia arriba de pantalla)** |
| Shift | Postcombustión |
| **C** | **Cambiar cámara: cenital iso / 3ª / 1ª persona** |
| **Rueda ratón** | **Zoom de cámara (vistas iso y 3ª)** |
| **M** | **Mapa planetario (pantalla completa)** |
| Espacio | Disparo frontal extra (las armas ya disparan solas) |
| T | Marcar objetivo (informativo) |
| P / Esc | Pausa |

## Reglas

- **El mundo es esférico:** vuela recto y darás la vuelta al planeta hasta el punto de partida.
- **Los escudos se regeneran; el casco no** (salvo cápsulas de reparación).
- **La gravedad tira de ti hacia el planeta.** Vuela con el morro ligeramente arriba para no caer.
- **No huyas al espacio profundo:** pasado el techo de altitud, la gravedad te arrastra de vuelta.
- **Explora** para descubrir el mapa y los faros; **sube de nivel** con las gemas de XP y elige mejoras.
- La dificultad aumenta con el tiempo; aparecen **unidades élite** más resistentes.

## Pruebas

`smoke test` de humo en Node (sin navegador) que carga el módulo del juego con stubs de
Three.js y del DOM, y ejercita el ciclo completo (menú → despliegue → bucle de juego →
subida de nivel → mejoras → cambio de cámara → ambos planetas) verificando que no lanza
excepciones. Los archivos de prueba viven en el directorio temporal de la sesión.
