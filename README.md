# STAR WING // SURVIVORS

**Wing Commander × Vampire Survivors.** Pilotas un caza en primera (o tercera) persona sobre
la superficie de planetas épicos, mientras enjambres interminables de enemigos te acosan.
Tus armas disparan solas: tú vuelas, esquivas, recoges experiencia y **evolucionas**.

Hecho con [Three.js](https://threejs.org). El código fuente se puede servir tal cual; el `dist/` es un paquete estático para jugar **sin servidor**.

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

El `dist/` es un paquete estático. Three.js, el juego y los assets van **dentro** de esos archivos: el navegador lo ejecuta todo en cliente. No hace falta Node, Python ni ningún servidor.

- **Windows:** doble clic en `jugar.bat`, o abre `dist/index.html`.
- Para llevarte el juego: copia la carpeta `dist/` entera (`index.html` + `game.js` + `pack.js` juntos).

Las fuentes de Google se piden online si hay conexión; si no, el juego usa las del sistema.

Para **desarrollar** (editar `game.js` / `index.html` de la raíz) sí hace falta un servidor local, porque el navegador bloquea módulos ES en `file://`. Doble clic en `jugar-dev.bat`, o:

```
python -m http.server 8000
```

y abre http://localhost:8000

## Cómo se genera el dist

El origen del juego es `index.html` + `game.js` + `assets/`. Eso **no** se puede abrir con doble clic: Chrome bloquea `import` de módulos locales y el `fetch` de los `.glb`. El build fabrica un paquete que sí funciona en `file://`.

### Qué hace el build

`npm run build` ejecuta [`tools/build-dist.mjs`](tools/build-dist.mjs):

1. **Empaqueta los assets** (`assets/models/*.glb` y `assets/fx/*.png`) como `data:` URIs en `dist/pack.js`. El juego los lee de `globalThis.__STARWING_PACK` (si no hay pack, sigue usando las rutas de archivo, que es el modo desarrollo).
2. **Empaqueta el JavaScript** con [esbuild](https://esbuild.github.io): junta `game.js` + Three.js 0.160.0 + addons (GLTFLoader, bloom, etc.) en un solo IIFE `dist/game.js`. Ya no hay `importmap` ni CDN.
3. **Escribe `dist/index.html`**: copia el HTML de la raíz y sustituye los `<script type="module">` por:

```html
<script src="pack.js"></script>
<script src="game.js"></script>
```

Resultado:

| Archivo | Qué es |
|---|---|
| `dist/index.html` | UI / CSS / markup |
| `dist/game.js` | Three.js + lógica del juego (~0.6 MB) |
| `dist/pack.js` | naves y FX embebidos (~11 MB) |

### Requisitos (solo para generar, no para jugar)

- [Node.js](https://nodejs.org) 18+ (lleva `npm`)

### Pasos

En la raíz del repo:

```
npm install
npm run build
```

- `npm install` baja **solo** herramientas de build (`esbuild`, `three`). Quedan en `node_modules/` (ignorado por git).
- `npm run build` regenera `dist/` entero. Tarda unos segundos.

Vuelve a hacerlo cada vez que cambies `game.js`, `index.html` o un archivo de `assets/`. Luego abre `dist/index.html` (o `jugar.bat`) para comprobarlo.

No hace falta dejar Node instalado en la máquina que **juega**: con copiar `dist/` basta.

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

## Licencia

El código de este juego se publica bajo la [licencia MIT](LICENSE).
© 2026 IAnMove.

Las dependencias y assets de terceros conservan su propia licencia; ver [THIRD_PARTY.md](THIRD_PARTY.md).
