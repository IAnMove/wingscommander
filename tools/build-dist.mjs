/**
 * Empaqueta un dist jugable con doble clic (file://), sin servidor.
 * Three.js + game.js van en un IIFE; modelos y FX van como data: URIs.
 *
 *   npm install
 *   npm run build
 */
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');

const ASSET_FILES = {
  player: ['assets/models/confed_interceptor.glb', 'model/gltf-binary'],
  drone: ['assets/models/kil_drone.glb', 'model/gltf-binary'],
  gunner: ['assets/models/kil_gunner.glb', 'model/gltf-binary'],
  ace: ['assets/models/kil_ace.glb', 'model/gltf-binary'],
  beacon: ['assets/models/beacon_tower.glb', 'model/gltf-binary'],
  missile: ['assets/models/swarm_missile.glb', 'model/gltf-binary'],
  xp: ['assets/models/xp_gem.glb', 'model/gltf-binary'],
  repair: ['assets/models/repair_capsule.glb', 'model/gltf-binary'],
  muzzle: ['assets/fx/muzzle_cyan.png', 'image/png'],
  muzzleEnemy: ['assets/fx/muzzle_enemy.png', 'image/png'],
  engine: ['assets/fx/engine.png', 'image/png'],
  explosion: ['assets/fx/explosion.png', 'image/png'],
  nova: ['assets/fx/nova.png', 'image/png'],
  boltP: ['assets/fx/bolt_cyan.png', 'image/png'],
  boltT: ['assets/fx/bolt_gold.png', 'image/png'],
  boltE: ['assets/fx/bolt_red.png', 'image/png'],
  orb: ['assets/fx/orb.png', 'image/png'],
};

function encodePack() {
  const pack = {};
  let bytes = 0;
  for (const [key, [rel, mime]] of Object.entries(ASSET_FILES)) {
    const buf = fs.readFileSync(path.join(root, rel));
    bytes += buf.length;
    pack[key] = `data:${mime};base64,${buf.toString('base64')}`;
  }
  return { pack, bytes };
}

function writeIndexHtml() {
  const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const marker = '<script type="importmap">';
  const idx = src.indexOf(marker);
  if (idx < 0) throw new Error('index.html: no se encontró el importmap');
  const html = src.slice(0, idx) +
    `<!-- dist file:// : Three.js y assets van en game.js (sin servidor, sin CDN de módulos) -->\n` +
    `<script src="pack.js"></script>\n` +
    `<script src="game.js"></script>\n` +
    `</body>\n</html>\n`;
  fs.writeFileSync(path.join(dist, 'index.html'), html);
}

async function main() {
  fs.mkdirSync(dist, { recursive: true });
  const { pack, bytes } = encodePack();
  const packJs = `globalThis.__STARWING_PACK=${JSON.stringify(pack)};\n`;
  fs.writeFileSync(path.join(dist, 'pack.js'), packJs);

  await esbuild.build({
    absWorkingDir: root,
    entryPoints: ['game.js'],
    bundle: true,
    format: 'iife',
    outfile: path.join(dist, 'game.js'),
    minify: true,
    legalComments: 'none',
    logLevel: 'info',
  });

  writeIndexHtml();

  const packSize = fs.statSync(path.join(dist, 'pack.js')).size;
  const gameSize = fs.statSync(path.join(dist, 'game.js')).size;
  console.log(`assets raw ${(bytes / 1e6).toFixed(2)} MB → pack.js ${(packSize / 1e6).toFixed(2)} MB`);
  console.log(`game.js    ${(gameSize / 1e6).toFixed(2)} MB`);
  console.log(`listo: dist/index.html  (doble clic, sin servidor)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
