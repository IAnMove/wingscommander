# Terceros

| Componente | Ruta | Origen | Licencia | Notas |
|---|---|---|---|---|
| Three.js 0.160.0 | `package.json` (devDependency); empaquetado en `dist/` | https://github.com/mrdoob/three.js | MIT | Se incluye dentro del paquete `dist/`. |
| esbuild | `package.json` (devDependency) | https://github.com/evanw/esbuild | MIT | Solo herramienta de build. |
| Fuentes Orbitron y Share Tech Mono | `index.html` (Google Fonts, se cargan online) | https://fonts.google.com | SIL Open Font License 1.1 | No se redistribuyen en el repo. |
| Modelos de naves, torre, gemas, etc. | `assets/models/*.glb` | Generados con Meshy (IA), optimizados con `tools/pack_runtime_glb.py` | Pendiente de confirmar | Ver nota abajo. |
| Imágenes de referencia | `refs/*.jpg` | Desconocido (probablemente concept art generado para alimentar Meshy) | Pendiente de confirmar | Ver nota abajo. |

## Pendiente de confirmar

- **Modelos Meshy**: según los términos de Meshy, los assets creados con un plan de pago son del
  usuario; los del plan gratuito se publican bajo **CC BY 4.0** y obligan a atribuir a Meshy.
  Si se generaron en plan gratuito, añadir: "Modelos 3D generados con Meshy — https://www.meshy.ai — CC BY 4.0".
- **`refs/*.jpg`**: no consta su origen. Si son imágenes de terceros (p. ej. del Wing Commander
  original o sacadas de internet) no deberían redistribuirse y conviene quitarlas del repo.
