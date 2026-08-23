// ============================================================================
// STAR WING // SURVIVORS — Wing Commander × Vampire Survivors
// Supervivencia orbital sobre un planeta esférico inmenso y circunnavegable.
// Motor: Three.js (módulos vía CDN). Sin build, servir con cualquier servidor.
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ----------------------------------------------------------------------------
// Configuración
// ----------------------------------------------------------------------------
const CFG = {
  maxSpeed: 140, boostSpeed: 360, accel: 60,
  pitchRate: 1.5, yawRate: 1.5, rollRate: 2.2,
  maxShield: 100, maxHull: 100, shieldRegen: 3.5,
  boltSpeed: 520, boltDamage: 12, fireInterval: 0.14,
  heatPerShot: 6, heatCool: 30, overheatAt: 100, overheatReset: 30,
  radarRange: 1800,
  // --- planeta esférico (mundo inmenso) ---
  planetRadius: 9000,        // radio enorme: horizonte curvo, sensación de infinito
  startAltitude: 620,
  cruiseAltitude: 620,       // altura central del pasillo Star Fox
  altMin: 340,               // suelo del pasillo (sin trampolín)
  altMax: 980,               // techo del pasillo
  altLow: 430,               // por debajo, el juego te empuja arriba
  altHigh: 820,              // por encima, te empuja abajo
  minAltitude: 80,
  maxAltitude: 1500,
  gravity: 22,
  extDrag: 0.55,
  pitchMax: 0.46,            // ~26° de cabeceo
  bankMax: 0.72,
  levelRate: 2.2,            // auto-horizonte suave al soltar el stick
  velFollow: 6.5,            // la velocidad persigue el morro (inercia arcade)
  starCount: 3600, starCube: 120000,
  drawDistance: 220000,      // distancia de dibujado (ver muy lejos)
};

// Cuerpos reales del sistema solar.
const PLANETS = {
  sun: {
    name: 'HELIOS PRIME', tag: 'ESTRELLA', self: true, tex: 'sun',
    top: '#8a2406', mid: '#c2500e', low: '#400e02', spot: '#ffb347',
    coronaColor: 0xff8a1e, glowColor: 0xffb347, propColor: 0xd94a10,
    sky: 0x1a0803, gravityMul: 1.2, difficultyMul: 1.2, fog: 0x2a0a00,
  },
  bluestar: {
    name: 'VEGA AZUL', tag: 'ESTRELLA', self: true, tex: 'sun',
    top: '#041830', mid: '#1a6ad4', low: '#020814', spot: '#9ad8ff',
    coronaColor: 0x4aa8ff, glowColor: 0x7ec8ff, propColor: 0x1a4a88,
    sky: 0x020610, gravityMul: 1.35, difficultyMul: 1.3, fog: 0x031018,
  },
  jupiter: {
    name: 'GIGANTE JOVIANO', tag: 'GIGANTE GASEOSO', self: false, tex: 'bands',
    bands: ['#e6cba6', '#b5794f', '#8a5a3c', '#d9b48a', '#7a4b32', '#c8a179'],
    stormColor: '#c23b2a', glowColor: 0xd9b48a, propColor: 0x6a4a34,
    sky: 0x05070f, gravityMul: 1.1, difficultyMul: 1.0, fog: 0x0a0e18,
  },
  neptune: {
    name: 'ABISMO TURQUESA', tag: 'GIGANTE HELADO', self: false, tex: 'bands',
    bands: ['#1c6a88', '#0e3a55', '#3aa8b8', '#164860', '#7ad0d8', '#0a2838'],
    stormColor: '#c8f4ff', glowColor: 0x6ad4e0, propColor: 0x1a4a58,
    sky: 0x02060c, gravityMul: 0.85, difficultyMul: 0.9, fog: 0x041018,
  },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ----------------------------------------------------------------------------
// Referencias DOM
// ----------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const dom = {
  hud: $('hud'), score: $('score'), planet: $('planet-line'), kills: $('kills-line'),
  timer: $('timer-line'), levelBadge: $('level-badge'), xpBar: $('xp-bar').firstElementChild,
  shieldBar: $('shield-bar').firstElementChild, hullBar: $('hull-bar').firstElementChild,
  sysLine: $('sys-line'), speed: $('speed-val'),
  throttleBar: $('throttle-bar').firstElementChild, heatBar: $('heat-bar').firstElementChild,
  heatLabel: $('heat-label'), altBar: $('alt-bar').firstElementChild, altLabel: $('alt-label'),
  viewLabel: $('view-label'), weaponList: $('weapon-list'),
  radar: $('radar').getContext('2d'),
  worldmap: $('worldmap').getContext('2d'), worldmapBig: $('worldmap-big').getContext('2d'),
  mapLabel: $('map-label'), mapLarge: $('map-large'),
  tName: $('t-name'), tDist: $('t-dist'), tHull: $('t-hull'),
  lockbox: $('lockbox'), lockLabel: $('lock-label'), comms: $('comms'),
  flash: $('damage-flash'), boostFx: $('boost-lines'), zoneFlash: $('zone-flash'),
  mainMenu: $('main-menu'), pauseMenu: $('pause-menu'), gameoverMenu: $('gameover-menu'),
  levelupMenu: $('levelup-menu'), levelupCards: $('levelup-cards'),
  finalStats: $('final-stats'), planetSelect: $('planet-select'),
};

// ----------------------------------------------------------------------------
// Audio sintetizado
// ----------------------------------------------------------------------------
const sfx = {
  ctx: null, master: null, engineOsc: null, engineGain: null, noiseBuf: null,
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.3;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 38;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
  },
  blip(f0, f1, dur, type = 'square', vol = 0.18) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, cutoff, vol = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(60, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  laser()       { this.blip(950, 180, 0.1, 'square', 0.07); },
  turret()      { this.blip(720, 240, 0.09, 'square', 0.05); },
  enemyLaser()  { this.blip(420, 90, 0.15, 'sawtooth', 0.05); },
  missile()     { this.noise(0.55, 1800, 0.16); this.blip(200, 600, 0.4, 'sawtooth', 0.05); },
  nova()        { this.blip(140, 520, 0.35, 'sine', 0.12); this.noise(0.35, 1200, 0.12); },
  explosion(big = false) { this.noise(big ? 1.3 : 0.65, big ? 900 : 1400, big ? 0.55 : 0.34); },
  hit()         { this.blip(180, 60, 0.12, 'triangle', 0.2); this.noise(0.13, 800, 0.14); },
  pickup()      { this.blip(600, 1200, 0.1, 'sine', 0.1); },
  discover()    { this.blip(500, 900, 0.16, 'sine', 0.12); setTimeout(() => this.blip(760, 1200, 0.2, 'sine', 0.12), 110); },
  levelup()     { this.blip(500, 1200, 0.18, 'square', 0.13); setTimeout(() => this.blip(900, 1600, 0.22, 'square', 0.13), 90); },
  warn()        { this.blip(300, 200, 0.2, 'sawtooth', 0.09); },
  engine(sn, boosting, active) {
    if (!this.ctx) return;
    const target = active ? 0.05 + sn * 0.1 + (boosting ? 0.08 : 0) : 0;
    this.engineGain.gain.value += (target - this.engineGain.gain.value) * 0.1;
    this.engineOsc.frequency.value = 38 + sn * 55 + (boosting ? 45 : 0);
  },
};

// ----------------------------------------------------------------------------
// Entrada
// ----------------------------------------------------------------------------
const input = { mx: 0, my: 0, fire: false, keys: {} };
addEventListener('mousemove', e => {
  input.mx = (e.clientX / innerWidth) * 2 - 1;
  input.my = (e.clientY / innerHeight) * 2 - 1;
});
addEventListener('mousedown', e => { if (e.button === 0) input.fire = true; });
addEventListener('mouseup', e => { if (e.button === 0) input.fire = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  input.keys[e.code] = true;
  if (e.code === 'Space') { input.fire = true; e.preventDefault(); }
  if (e.code === 'KeyC') toggleView();
  if (e.code === 'KeyM') toggleMap();
  if (e.code === 'KeyT') cycleTarget();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
addEventListener('keyup', e => {
  input.keys[e.code] = false;
  if (e.code === 'Space') input.fire = false;
});
// rueda del ratón: alejar / acercar la cámara (vistas iso y 3ª persona)
addEventListener('wheel', e => {
  if (game.state !== 'playing' && game.state !== 'levelup') return;
  const key = player.view;
  if (key === 'iso' || key === 'third') {
    player.zoom[key] = clamp(player.zoom[key] * (e.deltaY > 0 ? 1.12 : 0.89), 0.45, 3.2);
    e.preventDefault();
  }
}, { passive: false });

// ----------------------------------------------------------------------------
// Renderer / escena / cámara
// ----------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  canvas: $('game-canvas'), antialias: true, logarithmicDepthBuffer: true,   // precisión en un mundo enorme
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.6, CFG.drawDistance);
camera.position.set(0, 0, 30);
scene.add(camera);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.8, 0.5, 0.5);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

const hemi = new THREE.HemisphereLight(0x8fa8ff, 0x201008, 0.6);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xfff2dd, 1.5);
sunLight.position.set(1, 0.6, 0.4);
scene.add(sunLight);
const planetLight = new THREE.PointLight(0xff8a1e, 0, 200000, 1.0);
scene.add(planetLight);

// ----------------------------------------------------------------------------
// Jugador
// ----------------------------------------------------------------------------
const player = {
  obj: new THREE.Object3D(),
  ship: null,
  vel: new THREE.Vector3(), extVel: new THREE.Vector3(),
  speed: 0, throttle: 0.6, boosting: false,
  shield: CFG.maxShield, hull: CFG.maxHull, maxHull: CFG.maxHull,
  heat: 0, overheated: false, gunSide: 1,
  shake: 0, alive: true,
  view: 'iso',                         // 'iso' | 'third' | 'first'
  zoom: { iso: 1, third: 1 },
  heading: new THREE.Vector3(0, 0, -1),
  pitch: 0,
  bank: 0,
  level: 1, xp: 0, xpNext: 5,
  magnet: 80, moveMul: 1,
  weapons: {},
};
scene.add(player.obj);

const AX_X = new THREE.Vector3(1, 0, 0), AX_Y = new THREE.Vector3(0, 1, 0), AX_Z = new THREE.Vector3(0, 0, 1);
const _fwd = new THREE.Vector3();
function playerForward() { return _fwd.set(0, 0, -1).applyQuaternion(player.obj.quaternion); }

const planetCenter = new THREE.Vector3(0, -(CFG.planetRadius + CFG.startAltitude), 0);
function altitude() { return player.obj.position.distanceTo(planetCenter) - CFG.planetRadius; }
function upVector() { return player.obj.position.clone().sub(planetCenter).normalize(); }

// Cáscara de vuelo: movimiento tangente al planeta, como Star Fox / Rogue Squadron.
const _shellUp = new THREE.Vector3();
const _lvlX = new THREE.Vector3(), _lvlY = new THREE.Vector3(), _lvlZ = new THREE.Vector3();
const _lvlM = new THREE.Matrix4(), _lvlQ = new THREE.Quaternion();
function stickToFlightShell(pos, vel) {
  _shellUp.copy(pos).sub(planetCenter);
  const dist = _shellUp.length() || 1;
  _shellUp.multiplyScalar(1 / dist);
  pos.copy(planetCenter).addScaledVector(_shellUp, CFG.planetRadius + CFG.cruiseAltitude);
  if (vel) vel.addScaledVector(_shellUp, -vel.dot(_shellUp));
  return _shellUp;
}
function applyFoxAttitude() {
  const up = upVector();
  _lvlZ.copy(player.heading).addScaledVector(up, -player.heading.dot(up));
  if (_lvlZ.lengthSq() < 1e-8) return;
  _lvlZ.normalize();
  player.heading.copy(_lvlZ);
  _lvlZ.multiplyScalar(Math.cos(player.pitch)).addScaledVector(up, Math.sin(player.pitch));
  if (_lvlZ.lengthSq() < 1e-8) return;
  _lvlZ.normalize().negate();
  _lvlX.crossVectors(up, _lvlZ);
  if (_lvlX.lengthSq() < 1e-8) return;
  _lvlX.normalize();
  _lvlY.crossVectors(_lvlZ, _lvlX).normalize();
  _lvlM.makeBasis(_lvlX, _lvlY, _lvlZ);
  player.obj.quaternion.setFromRotationMatrix(_lvlM);
  rotatePlayer(AX_Z, player.bank);
}
function constrainAltitudeBand(dt) {
  const up = upVector();
  const alt = altitude();
  if (alt > CFG.altHigh) {
    player.vel.addScaledVector(up, -(alt - CFG.altHigh) * 2.8 * dt);
    player.pitch -= dt * 0.9;
  } else if (alt < CFG.altLow) {
    player.vel.addScaledVector(up, (CFG.altLow - alt) * 2.8 * dt);
    player.pitch += dt * 0.9;
  }
  if (alt > CFG.altMax) {
    player.obj.position.copy(planetCenter).addScaledVector(up, CFG.planetRadius + CFG.altMax);
    const out = player.vel.dot(up);
    if (out > 0) player.vel.addScaledVector(up, -out);
    player.pitch = Math.min(player.pitch, 0);
  } else if (alt < CFG.altMin) {
    player.obj.position.copy(planetCenter).addScaledVector(up, CFG.planetRadius + CFG.altMin);
    const into = player.vel.dot(up);
    if (into < 0) player.vel.addScaledVector(up, -into);
    player.pitch = Math.max(player.pitch, 0);
  }
  player.pitch = clamp(player.pitch, -CFG.pitchMax, CFG.pitchMax);
}

// coordenadas esféricas <-> mundo (eje del planeta = +Y desde su centro)
function surfacePos(lat, lon, height) {
  const r = CFG.planetRadius + height;
  const cl = Math.cos(lat);
  return new THREE.Vector3(r * cl * Math.sin(lon), r * Math.sin(lat), r * cl * Math.cos(lon)).add(planetCenter);
}
function playerLatLon() {
  const v = player.obj.position.clone().sub(planetCenter);
  const r = v.length();
  return { lat: Math.asin(clamp(v.y / r, -1, 1)), lon: Math.atan2(v.x, v.z) };
}

// ----------------------------------------------------------------------------
// Texturas procedurales
// ----------------------------------------------------------------------------
function radialTexture(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, col] of stops) grad.addColorStop(p, col);
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = radialTexture(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]);

// ----------------------------------------------------------------------------
// Modelos GLB + texturas FX (con fallback procedural si falta un archivo)
// ----------------------------------------------------------------------------
const ASSETS = { models: {}, textures: {}, ready: false };
// Build (tools/build-dist.mjs) inyecta data: URIs en __STARWING_PACK para file://.
const PACK = globalThis.__STARWING_PACK || {};
const MODEL_URLS = {
  player: PACK.player || 'assets/models/confed_interceptor.glb',
  drone: PACK.drone || 'assets/models/kil_drone.glb',
  gunner: PACK.gunner || 'assets/models/kil_gunner.glb',
  ace: PACK.ace || 'assets/models/kil_ace.glb',
  beacon: PACK.beacon || 'assets/models/beacon_tower.glb',
  missile: PACK.missile || 'assets/models/swarm_missile.glb',
  xp: PACK.xp || 'assets/models/xp_gem.glb',
  repair: PACK.repair || 'assets/models/repair_capsule.glb',
};
const TEX_URLS = {
  muzzle: PACK.muzzle || 'assets/fx/muzzle_cyan.png',
  muzzleEnemy: PACK.muzzleEnemy || 'assets/fx/muzzle_enemy.png',
  engine: PACK.engine || 'assets/fx/engine.png',
  explosion: PACK.explosion || 'assets/fx/explosion.png',
  nova: PACK.nova || 'assets/fx/nova.png',
  boltP: PACK.boltP || 'assets/fx/bolt_cyan.png',
  boltT: PACK.boltT || 'assets/fx/bolt_gold.png',
  boltE: PACK.boltE || 'assets/fx/bolt_red.png',
  orb: PACK.orb || 'assets/fx/orb.png',
};
// Packed GLBs are unit-sized. Ships were longest on +X; lookAt uses -Z.
const MODEL_FIT = {
  player:  { size: 11,  rot: [0, -Math.PI / 2, 0], engine: [0, 0, 4.4] },
  drone:   { size: 7.5, rot: [0, -Math.PI / 2, 0], engine: [0, 0, 3.0] },
  gunner:  { size: 9.2, rot: [0, -Math.PI / 2, 0], engine: [0, 0, 3.6] },
  ace:     { size: 13,  rot: [0, -Math.PI / 2, 0], engine: [0, 0, 5.0] },
  missile: { size: 3.4, rot: [0, -Math.PI / 2, 0], engine: [0, 0, 1.7] },
  beacon:  { size: 240, rot: [0, 0, 0] },
  xp:      { size: 3.4, rot: [0, 0, 0] },
  repair:  { size: 4.4, rot: [0, 0, 0] },
};
function cloneFitted(key) {
  const src = ASSETS.models[key], fit = MODEL_FIT[key];
  if (!src || !fit) return null;
  const g = new THREE.Group();
  const inner = src.clone(true);
  inner.rotation.set(fit.rot[0], fit.rot[1], fit.rot[2]);
  inner.scale.setScalar(fit.size);
  g.add(inner);
  return g;
}
function addEngineSprite(g, color, fitKey) {
  const map = ASSETS.textures.engine || glowTex;
  const eng = new THREE.Sprite(new THREE.SpriteMaterial({
    map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  const pos = MODEL_FIT[fitKey]?.engine || [0, 0, 3];
  eng.position.set(pos[0], pos[1], pos[2]);
  eng.scale.set(5, 5, 1);
  g.add(eng);
  g.userData.engine = eng;
  return g;
}
function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, t => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      resolve(t);
    }, undefined, () => reject(new Error(url)));
  });
}
function loadGltf(url) {
  const loader = new GLTFLoader();
  return new Promise((resolve, reject) => {
    loader.load(url, gltf => {
      gltf.scene.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const mat of mats) {
          if ('metalness' in mat) mat.metalness = Math.min(0.75, mat.metalness ?? 0.45);
          if ('roughness' in mat) mat.roughness = Math.max(0.28, mat.roughness ?? 0.45);
          mat.needsUpdate = true;
        }
      });
      resolve(gltf.scene);
    }, undefined, () => reject(new Error(url)));
  });
}
async function loadAssets() {
  const startBtn = $('start-btn');
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = 'CARGANDO NAVES…';
  }
  await Promise.all([
    ...Object.entries(MODEL_URLS).map(async ([k, url]) => {
      try { ASSETS.models[k] = await loadGltf(url); }
      catch { console.warn('GLB no cargado', url); }
    }),
    ...Object.entries(TEX_URLS).map(async ([k, url]) => {
      try { ASSETS.textures[k] = await loadTexture(url); }
      catch { console.warn('FX no cargado', url); }
    }),
  ]);
  ASSETS.ready = true;
  if (startBtn) {
    startBtn.disabled = false;
    startBtn.textContent = 'DESPLEGAR';
  }
  if (new URLSearchParams(location.search).has('autostart')) {
    startGame();
    player.view = 'third';
    applyView();
  }
}
loadAssets();

function sunTexture(preset) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, 1024);
  base.addColorStop(0, preset.top); base.addColorStop(0.5, preset.mid); base.addColorStop(1, preset.low);
  g.fillStyle = base; g.fillRect(0, 0, 2048, 1024);
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * 2048, y = Math.random() * 1024, r = 8 + Math.random() * 46;
    const b = Math.random();
    g.fillStyle = b > 0.7 ? preset.spot : (b > 0.4 ? preset.mid : preset.low);
    g.globalAlpha = 0.2 + Math.random() * 0.35;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function jupiterTexture(preset) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024;
  const g = c.getContext('2d');
  let y = 0;
  while (y < 1024) {
    const h = 20 + Math.random() * 80;
    g.fillStyle = preset.bands[Math.floor(Math.random() * preset.bands.length)];
    g.fillRect(0, y, 2048, h); y += h;
  }
  for (let i = 0; i < 620; i++) {
    g.fillStyle = preset.bands[Math.floor(Math.random() * preset.bands.length)];
    g.globalAlpha = 0.1 + Math.random() * 0.18;
    const yy = Math.random() * 1024, hh = 4 + Math.random() * 20;
    g.beginPath(); g.ellipse(Math.random() * 2048, yy, 120 + Math.random() * 420, hh, 0, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 0.85; g.fillStyle = preset.stormColor;
  g.beginPath(); g.ellipse(1400, 660, 180, 92, 0, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ----------------------------------------------------------------------------
// Entorno: cielo, planeta, atmósfera, superficie con estructuras fijas
// ----------------------------------------------------------------------------
let stars, planet, planetGlow, corona, atmosphere;
const surfaceObjs = [], landmarks = [];

function buildStars() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(CFG.starCount * 3), col = new Float32Array(CFG.starCount * 3);
  const c = new THREE.Color();
  for (let i = 0; i < CFG.starCount; i++) {
    pos[i * 3] = (Math.random() - 0.5) * CFG.starCube;
    pos[i * 3 + 1] = (Math.random() - 0.5) * CFG.starCube;
    pos[i * 3 + 2] = (Math.random() - 0.5) * CFG.starCube;
    c.setHSL(Math.random() < 0.85 ? 0.6 : Math.random(), Math.random() * 0.5, 0.6 + Math.random() * 0.4);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 2.5, vertexColors: true, sizeAttenuation: false, transparent: true, opacity: 0.9 });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  return pts;
}

function clearSurface() {
  for (const o of surfaceObjs) scene.remove(o);
  surfaceObjs.length = 0; landmarks.length = 0;
}

function buildSurface(preset) {
  clearSurface();
  // relieve disperso: da escala, velocidad y referencia visual
  const propMat = preset.self
    ? new THREE.MeshBasicMaterial({ color: preset.propColor })
    : new THREE.MeshStandardMaterial({ color: preset.propColor, roughness: 1, metalness: 0 });
  for (let i = 0; i < 140; i++) {
    const lat = Math.asin(Math.random() * 2 - 1);
    const lon = Math.random() * Math.PI * 2 - Math.PI;
    const pos = surfacePos(lat, lon, 0);
    const normal = pos.clone().sub(planetCenter).normalize();
    const h = 50 + Math.random() * 220;
    let mesh;
    if (preset.self) {
      mesh = new THREE.Mesh(new THREE.ConeGeometry(14 + Math.random() * 26, h, 6), propMat);
    } else {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(8 + Math.random() * 16, 18 + Math.random() * 22, h, 6), propMat);
    }
    mesh.position.copy(pos).addScaledVector(normal, h / 2);
    mesh.quaternion.setFromUnitVectors(AX_Y, normal);
    scene.add(mesh); surfaceObjs.push(mesh);
  }
  // puntos de referencia (faros nombrados) para el mapa/descubrimiento
  const NAMES = ['ATALAYA', 'FARO', 'NEXO', 'CRÁTER', 'ANTENA', 'SANTUARIO', 'BASTIÓN', 'ORÁCULO'];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const lat = Math.asin((Math.random() * 1.7 - 0.85));
    const lon = -Math.PI + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const pos = surfacePos(lat, lon, 0);
    const normal = pos.clone().sub(planetCenter).normalize();
    const g = new THREE.Group();
    const H = 220;
    const tower = cloneFitted('beacon');
    if (tower) {
      g.add(tower);
    } else {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(12, 26, H, 8),
        new THREE.MeshStandardMaterial({ color: 0x2a3550, metalness: 0.6, roughness: 0.4, emissive: 0x0f2a44 }));
      mesh.position.y = H / 2; g.add(mesh);
    }
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: preset.glowColor, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    beacon.scale.set(240, 240, 1); beacon.position.y = H + 30; g.add(beacon);
    g.position.copy(pos); g.quaternion.setFromUnitVectors(AX_Y, normal);
    scene.add(g); surfaceObjs.push(g);
    landmarks.push({ name: NAMES[i % NAMES.length] + '-' + (i + 1), lat, lon, pos: pos.clone(), discovered: false });
  }
}

function buildPlanet(preset) {
  if (planet) { scene.remove(planet); planet.geometry.dispose(); planet.material.map?.dispose(); planet.material.dispose(); }
  if (planetGlow) scene.remove(planetGlow);
  if (corona) scene.remove(corona);
  if (atmosphere) scene.remove(atmosphere);

  const geo = new THREE.SphereGeometry(CFG.planetRadius, 128, 96);
  let mat;
  if (preset.self) {
    mat = new THREE.MeshBasicMaterial({ map: sunTexture(preset) });
    planetLight.color.setHex(0xff9a3c); planetLight.intensity = 2.6;
    hemi.intensity = 0.35; sunLight.intensity = 0.4;
  } else {
    mat = new THREE.MeshStandardMaterial({ map: jupiterTexture(preset), roughness: 1, metalness: 0 });
    planetLight.color.setHex(0xbfd0ff); planetLight.intensity = 0.6;
    hemi.intensity = 0.7; sunLight.intensity = 1.6;
  }
  planet = new THREE.Mesh(geo, mat);
  planet.position.copy(planetCenter);
  scene.add(planet);

  // atmósfera / bruma en el limbo del planeta (se ve desde lejos)
  atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(CFG.planetRadius * 1.02, 64, 48),
    new THREE.MeshBasicMaterial({ color: preset.glowColor, transparent: true, opacity: 0.12, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  atmosphere.position.copy(planetCenter);
  scene.add(atmosphere);

  planetGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: preset.glowColor, blending: THREE.AdditiveBlending, depthWrite: false,
    opacity: preset.self ? 0.12 : 0.26,   // en estrellas, tenue: la cámara vuela dentro del sprite
  }));
  planetGlow.scale.setScalar(CFG.planetRadius * 2.6);
  planetGlow.position.copy(planetCenter);
  scene.add(planetGlow);

  if (preset.self) {
    corona = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: preset.coronaColor, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.08,
    }));
    corona.scale.setScalar(CFG.planetRadius * 3.6);
    corona.position.copy(planetCenter);
    scene.add(corona);
  }

  scene.background = new THREE.Color(preset.sky);
  scene.fog = new THREE.FogExp2(preset.fog, 0.0000075);   // bruma suave: se ve muy lejos con profundidad
  planetLight.position.copy(planetCenter).add(new THREE.Vector3(0, CFG.planetRadius + 5000, 0));
}

stars = buildStars();

// ----------------------------------------------------------------------------
// Comunicaciones
// ----------------------------------------------------------------------------
function say(text, cls = '') {
  const div = document.createElement('div');
  div.className = 'comm-msg ' + cls;
  div.textContent = text;
  dom.comms.appendChild(div);
  while (dom.comms.children.length > 4) dom.comms.firstChild.remove();
  setTimeout(() => { div.style.opacity = '0'; }, 3000);
  setTimeout(() => div.remove(), 3700);
}
const TAUNTS = ['¡No escaparás, terrícola!', '¡Por el Imperio Kilrathi!', '¡El enjambre te devora!',
  '¡La gravedad es tu tumba!', '¡Caerás al planeta!'];
const KILL_LINES = ['¡Abatido!', '¡Impacto!', '¡Uno menos!', '¡Chatarra!', '¡Eliminado!'];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ----------------------------------------------------------------------------
// Malla de la nave del jugador (visible en 3ª persona)
// ----------------------------------------------------------------------------
function createPlayerShip() {
  const fitted = cloneFitted('player');
  if (fitted) return addEngineSprite(fitted, 0x66f6ff, 'player');
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x2d3a52, metalness: 0.8, roughness: 0.3 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xdfe8ff, metalness: 0.7, roughness: 0.35 });
  const glow = new THREE.MeshBasicMaterial({ color: 0x35f0ff });
  const fus = new THREE.Mesh(new THREE.ConeGeometry(0.9, 6.5, 8), body);
  fus.rotation.x = -Math.PI / 2; fus.position.z = -1; g.add(fus);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0a2030, metalness: 0.2, roughness: 0.1, emissive: 0x113344 }));
  cockpit.rotation.x = -Math.PI / 2; cockpit.position.set(0, 0.35, -1.4); g.add(cockpit);
  const wingGeo = new THREE.BoxGeometry(7, 0.16, 2.2);
  const wingL = new THREE.Mesh(wingGeo, body);
  wingL.position.set(-2.4, 0, 1); wingL.rotation.z = 0.12; wingL.rotation.y = 0.12;
  const wingR = wingL.clone(); wingR.position.x = 2.4; wingR.rotation.z = -0.12; wingR.rotation.y = -0.12;
  g.add(wingL, wingR);
  // cañones visibles en las puntas de las alas
  const gunGeo = new THREE.CylinderGeometry(0.14, 0.14, 3, 6);
  const gunL = new THREE.Mesh(gunGeo, accent); gunL.rotation.x = Math.PI / 2; gunL.position.set(-3.4, 0, -0.5);
  const gunR = gunL.clone(); gunR.position.x = 3.4; g.add(gunL, gunR);
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 5), glow); s1.position.set(-0.9, 0.2, 0);
  const s2 = s1.clone(); s2.position.x = 0.9; g.add(s1, s2);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 1.4), accent); tail.position.set(0, 0.8, 2.4); g.add(tail);
  const eng = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x66f6ff, blending: THREE.AdditiveBlending, depthWrite: false }));
  eng.position.set(0, 0, 3); eng.scale.set(4, 4, 1); g.add(eng);
  g.userData.engine = eng;
  g.scale.setScalar(1.2);
  return g;
}

// ----------------------------------------------------------------------------
// Entidades dinámicas
// ----------------------------------------------------------------------------
const enemies = [], bolts = [], missiles = [], explosions = [], pickups = [], orbs = [], novas = [], beams = [];

const boltGeo = new THREE.BoxGeometry(0.5, 0.5, 9);
const boltMatP = new THREE.MeshBasicMaterial({ color: 0x8afcff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
const boltMatT = new THREE.MeshBasicMaterial({ color: 0xffe27a, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
const boltMatE = new THREE.MeshBasicMaterial({ color: 0xff5a3c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });

function spawnBolt(origin, dir, speed, kind, dmg) {
  const texKey = kind === 'enemy' ? 'boltE' : kind === 'turret' ? 'boltT' : 'boltP';
  const tex = ASSETS.textures[texKey];
  let m;
  if (tex) {
    m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    }));
    m.scale.set(4.5, 12, 1);
  } else {
    const mat = kind === 'enemy' ? boltMatE : kind === 'turret' ? boltMatT : boltMatP;
    m = new THREE.Mesh(boltGeo, mat);
    m.lookAt(origin.clone().add(dir));
  }
  m.position.copy(origin);
  scene.add(m);
  bolts.push({ mesh: m, vel: dir.clone().multiplyScalar(speed), life: 2.6, friendly: kind !== 'enemy', dmg });
  if (kind === 'enemy') sfx.enemyLaser();
}

// destellos de disparo (pool)
const flashPool = [];
let flashIdx = 0;
for (let i = 0; i < 28; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  s.scale.set(4, 4, 1); s.visible = false;
  scene.add(s); flashPool.push({ s, life: 0 });
}
function spawnFlash(pos, color, size) {
  const f = flashPool[flashIdx = (flashIdx + 1) % flashPool.length];
  const map = (color === 0x8afcff)
    ? (ASSETS.textures.muzzle || glowTex)
    : (ASSETS.textures.muzzleEnemy || ASSETS.textures.muzzle || glowTex);
  f.s.material.map = map;
  f.s.material.needsUpdate = true;
  f.s.position.copy(pos); f.s.material.color.setHex(0xffffff);
  f.s.scale.set(size * 1.6, size * 1.6, 1); f.s.material.opacity = 0.95; f.s.visible = true; f.life = 0.12;
}
function updateFlashes(dt) {
  for (const f of flashPool) {
    if (f.life <= 0) continue;
    f.life -= dt;
    f.s.material.opacity = Math.max(0, f.life / 0.12) * 0.9;
    if (f.life <= 0) f.s.visible = false;
  }
}

function spawnHomingMissile(target, offset) {
  let g = cloneFitted('missile');
  if (g) {
    addEngineSprite(g, 0xff9a3c, 'missile');
  } else {
    g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3, 6), new THREE.MeshBasicMaterial({ color: 0xffc46b }));
    body.rotation.x = Math.PI / 2; g.add(body);
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff9a3c, blending: THREE.AdditiveBlending, depthWrite: false }));
    flare.scale.set(4, 4, 1); flare.position.z = -2; g.add(flare);
    g.userData.engine = flare;
  }
  const fwd = playerForward().clone();
  const side = new THREE.Vector3(offset, 0, 0).applyQuaternion(player.obj.quaternion);
  g.position.copy(player.obj.position).add(side).addScaledVector(fwd, 6);
  const dir = fwd.clone().add(side.clone().normalize().multiplyScalar(0.25)).normalize();
  g.lookAt(g.position.clone().add(dir));
  scene.add(g);
  const lv = player.weapons.swarm.level;
  missiles.push({ mesh: g, target, vel: dir.multiplyScalar(200), life: 6, dmg: 45 + lv * 12, speed: 200 + lv * 14 });
}

function spawnExplosion(pos, big = false) {
  const n = big ? 120 : 42;
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3), v = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
    const sp = (big ? 60 : 32) * (0.3 + Math.random());
    v[i * 3] = sp * Math.sin(ph) * Math.cos(th);
    v[i * 3 + 1] = sp * Math.sin(ph) * Math.sin(th);
    v[i * 3 + 2] = sp * Math.cos(ph);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({ color: big ? 0xffb347 : 0xff7a3c, size: big ? 4 : 2.4, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: ASSETS.textures.explosion || glowTex, color: 0xffffff,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  flash.position.copy(pos); flash.scale.setScalar(big ? 70 : 28); scene.add(flash);
  explosions.push({ pts, v, flash, life: 1, big });
  sfx.explosion(big);
}

// Pickups: gema XP / cápsula de reparación
const gemGeo = new THREE.OctahedronGeometry(1.8);
function spawnPickup(pos, kind) {
  const color = kind === 'repair' ? 0x4dff88 : 0xc46bff;
  let m = cloneFitted(kind === 'repair' ? 'repair' : 'xp');
  if (!m) {
    m = new THREE.Mesh(gemGeo, new THREE.MeshBasicMaterial({ color, wireframe: kind === 'repair' }));
    if (kind === 'repair') m.scale.setScalar(1.5);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 }));
  halo.scale.set(kind === 'repair' ? 11 : 7, kind === 'repair' ? 11 : 7, 1); m.add(halo);
  m.position.copy(pos);
  scene.add(m);
  pickups.push({ mesh: m, life: 34, kind });
}

// ----------------------------------------------------------------------------
// Enemigos: 2 tipos
// ----------------------------------------------------------------------------
const ENEMY_TYPES = {
  drone: { name: 'ZÁNGANO', tint: 0xff5a3c, ranged: false, hpBase: 16, hpWave: 4, speed: 70, turn: 2.2, radius: 5.5, contact: 14, score: 60 },
  gunner: { name: 'ARTILLERO', tint: 0xffb347, ranged: true, hpBase: 34, hpWave: 8, speed: 40, turn: 1.1, radius: 7.2, contact: 20, score: 140 },
};
function createEnemyMesh(type, ace) {
  const key = ace ? 'ace' : (type.ranged ? 'gunner' : 'drone');
  const fitted = cloneFitted(key);
  if (fitted) return addEngineSprite(fitted, type.tint, key);
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: ace ? 0x3a2030 : 0x40485a, metalness: 0.8, roughness: 0.4 });
  const glowMat = new THREE.MeshBasicMaterial({ color: type.tint });
  if (type.ranged) {
    g.add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 4.4), hullMat));
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 3.6), glowMat);
    gun.position.set(-1.1, 0, -2.6); const gun2 = gun.clone(); gun2.position.x = 1.1; g.add(gun, gun2);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 2), hullMat); fin.position.set(0, 1, 1.4); g.add(fin);
  } else {
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.4, 6), hullMat);
    nose.rotation.x = -Math.PI / 2; nose.position.z = -1.6; g.add(nose);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(5, 0.14, 1.6), hullMat); wing.position.z = 0.6; g.add(wing);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 3.4), glowMat); stripe.position.set(0, 0.25, 0); g.add(stripe);
  }
  const eng = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: type.tint, blending: THREE.AdditiveBlending, depthWrite: false }));
  eng.position.z = 2.8; eng.scale.set(2.6, 2.6, 1); g.add(eng);
  g.userData.engine = eng;
  g.scale.setScalar(ace ? 1.6 : 1);
  return g;
}
let enemyId = 0;
function spawnEnemy(typeKey, ace = false) {
  const type = ENEMY_TYPES[typeKey];
  const mesh = createEnemyMesh(type, ace);
  const up = upVector();
  const tangent = new THREE.Vector3().randomDirection().projectOnPlane(up);
  if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0).projectOnPlane(up);
  tangent.normalize();
  const dist = 800 + Math.random() * 600;
  mesh.position.copy(player.obj.position).addScaledVector(tangent, dist);
  stickToFlightShell(mesh.position, null);
  scene.add(mesh);
  const aceMul = ace ? 2.6 : 1;
  const heading = player.obj.position.clone().sub(mesh.position).normalize();
  mesh.lookAt(mesh.position.clone().add(heading));
  enemies.push({
    id: enemyId++, typeKey, type, ace,
    name: (ace ? 'ÉLITE-' : type.name.slice(0, 4) + '-') + (100 + enemyId),
    mesh, heading,
    hp: (type.hpBase + type.hpWave * game.difficulty) * aceMul,
    maxHp: (type.hpBase + type.hpWave * game.difficulty) * aceMul,
    radius: type.radius * (ace ? 1.6 : 1),
    speed: type.speed * (ace ? 1.2 : 1) * (0.85 + Math.random() * 0.3),
    fireT: 1 + Math.random() * 2, enginePhase: Math.random() * Math.PI * 2,
  });
}
function updateEnemy(e, dt) {
  const toPlayer = player.obj.position.clone().sub(e.mesh.position);
  const dist = toPlayer.length();
  const toN = toPlayer.clone().normalize();
  let desired = toN.clone();
  if (e.type.ranged) {
    if (dist < 400) desired.negate();
    e.fireT -= dt;
    if (e.fireT <= 0 && dist < 680 && player.alive && e.heading.angleTo(toN) < 0.5) {
      const spread = new THREE.Vector3().randomDirection().multiplyScalar(0.03);
      spawnBolt(e.mesh.position.clone().addScaledVector(e.heading, 4), toN.clone().add(spread).normalize(), 240, 'enemy', 7 + game.difficulty);
      e.fireT = Math.max(0.6, 1.8 - game.difficulty * 0.06) * (0.7 + Math.random() * 0.6);
    }
  }
  desired.normalize();
  e.heading.lerp(desired, Math.min(1, e.type.turn * dt));
  if (e.heading.lengthSq() > 1e-8) e.heading.normalize();
  e.mesh.position.addScaledVector(e.heading, e.speed * dt);
  stickToFlightShell(e.mesh.position, e.heading);
  if (e.heading.lengthSq() > 1e-8) e.heading.normalize();
  e.mesh.lookAt(e.mesh.position.clone().add(e.heading));
  e.enginePhase += dt * 8;
  const s = 2.4 + Math.sin(e.enginePhase) * 0.4;
  if (e.mesh.userData.engine) e.mesh.userData.engine.scale.set(s, s, 1);
  if (dist < e.radius + 5 && player.alive) {
    if (e.type.ranged) damagePlayer(e.type.contact * dt * 3);
    else { damagePlayer(e.type.contact); spawnExplosion(e.mesh.position.clone()); damageEnemy(e, e.hp + 1); }
  }
}
function damageEnemy(e, dmg) {
  e.hp -= dmg;
  if (e.hp > 0) return;
  const idx = enemies.indexOf(e);
  if (idx === -1) return;
  enemies.splice(idx, 1);
  spawnExplosion(e.mesh.position, e.ace);
  scene.remove(e.mesh);
  game.kills++;
  game.score += (e.ace ? 400 : e.type.score);
  if (Math.random() < 0.12) say(pick(KILL_LINES), 'good');
  spawnPickup(e.mesh.position.clone(), 'xp');
  if (e.ace) { spawnPickup(e.mesh.position.clone().add(new THREE.Vector3(6, 0, 0)), 'xp'); spawnPickup(e.mesh.position.clone().add(new THREE.Vector3(-6, 0, 0)), 'xp'); }
  if (Math.random() < (e.ace ? 0.5 : 0.03)) spawnPickup(e.mesh.position.clone().addScaledVector(upVector(), 4), 'repair');
  if (game.target === e) game.target = null;
}

// ----------------------------------------------------------------------------
// ARMAS (auto-fire, estilo Vampire Survivors)
// ----------------------------------------------------------------------------
const WEAPON_DEFS = {
  cannon: { name: 'Cañones Frontales', icon: '🔫', max: 8, desc: lv => `2 cañones frontales · cadencia y daño ↑ (nivel ${lv})` },
  turret: { name: 'Torretas Auto', icon: '🛰️', max: 8, desc: lv => `2 torretas de puntería 360° · daño ↑ (nivel ${lv})` },
  orb: { name: 'Orbes Orbitales', icon: '🪐', max: 8, desc: lv => `${2 + Math.floor(lv / 2)} orbes que orbitan y dañan al contacto` },
  swarm: { name: 'Misiles Enjambre', icon: '🚀', max: 8, desc: lv => `${2 + Math.floor((lv - 1) / 2)} misiles buscadores por salva` },
  beam: { name: 'Rayo de Plasma', icon: '⚡', max: 8, desc: lv => `${1 + Math.floor((lv - 1) / 2)} rayo(s) continuo(s) al enemigo más cercano` },
  nova: { name: 'Nova de Choque', icon: '💥', max: 8, desc: lv => `onda expansiva en área · más frecuente y potente (nivel ${lv})` },
};
const wpTimers = { cannon: 0, turret: 0, orb: 0, swarm: 0, nova: 0 };

function nearestEnemies(n, maxDist = 1600) {
  return enemies
    .map(e => ({ e, d: e.mesh.position.distanceTo(player.obj.position) }))
    .filter(o => o.d < maxDist).sort((a, b) => a.d - b.d).slice(0, n).map(o => o.e);
}

// --- Orbes ---
function rebuildOrbs() {
  for (const o of orbs) scene.remove(o.mesh);
  orbs.length = 0;
  const w = player.weapons.orb; if (!w) return;
  const count = 2 + Math.floor(w.level / 2);
  for (let i = 0; i < count; i++) {
    let m;
    if (ASSETS.textures.orb) {
      m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ASSETS.textures.orb, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
      }));
      m.scale.set(6.5, 6.5, 1);
    } else {
      m = new THREE.Mesh(new THREE.SphereGeometry(1.5, 12, 10), new THREE.MeshBasicMaterial({ color: 0x9a6bff }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xc46bff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
      halo.scale.set(7, 7, 1); m.add(halo);
    }
    scene.add(m); orbs.push({ mesh: m, phase: (i / count) * Math.PI * 2 });
  }
}
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _tmp = new THREE.Vector3();
function updateOrbs(dt) {
  const w = player.weapons.orb; if (!w) return;
  const radius = 18 + w.level * 1.6, spin = 1.9 + w.level * 0.12, dmg = (16 + w.level * 6) * dt * 4;
  const up = upVector();
  _e1.set(1, 0, 0); if (Math.abs(up.dot(_e1)) > 0.9) _e1.set(0, 0, 1);
  _e1.crossVectors(up, _e1).normalize(); _e2.crossVectors(up, _e1).normalize();
  for (const o of orbs) {
    o.phase += spin * dt;
    _tmp.copy(player.obj.position).addScaledVector(_e1, Math.cos(o.phase) * radius).addScaledVector(_e2, Math.sin(o.phase) * radius).addScaledVector(up, Math.sin(o.phase * 1.5) * 3);
    o.mesh.position.copy(_tmp);
    for (let k = enemies.length - 1; k >= 0; k--) { const e = enemies[k]; if (_tmp.distanceTo(e.mesh.position) < e.radius + 3) damageEnemy(e, dmg); }
  }
}

// --- Rayo de plasma (continuo, visible) ---
const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
function getBeam(i) {
  while (beams.length <= i) {
    const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x66ffd8, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.85, depthWrite: false }));
    m.visible = false; scene.add(m); beams.push({ mesh: m });
  }
  return beams[i];
}
function updateBeams(dt) {
  const w = player.weapons.beam;
  let used = 0;
  if (w) {
    const count = 1 + Math.floor((w.level - 1) / 2);
    const targets = nearestEnemies(count, 1300);
    const dmg = (34 + w.level * 12) * dt;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i], b = getBeam(i);
      const from = player.obj.position, to = t.mesh.position;
      const dir = to.clone().sub(from); const len = dir.length(); if (len < 1) continue; dir.normalize();
      b.mesh.visible = true;
      b.mesh.position.copy(from).addScaledVector(dir, len / 2);
      b.mesh.scale.set(1, len, 1);
      b.mesh.quaternion.setFromUnitVectors(AX_Y, dir);
      damageEnemy(t, dmg);
      used = i + 1;
    }
  }
  for (let i = used; i < beams.length; i++) beams[i].mesh.visible = false;
}

// --- Nova de choque (onda expansiva en área) ---
const novaGeo = new THREE.RingGeometry(0.9, 1.0, 48);
function spawnNova() {
  const w = player.weapons.nova;
  const up = upVector();
  let mesh;
  if (ASSETS.textures.nova) {
    mesh = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ASSETS.textures.nova, color: 0xffc0ee, blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, opacity: 0.9,
    }));
  } else {
    mesh = new THREE.Mesh(novaGeo, new THREE.MeshBasicMaterial({ color: 0xff5ac8, side: THREE.DoubleSide, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.quaternion.setFromUnitVectors(AX_Z, up);
  }
  mesh.position.copy(player.obj.position);
  scene.add(mesh);
  novas.push({ mesh, r: 8, prevR: 0, maxR: 260 + w.level * 50, speed: 340, dmg: 40 + w.level * 16, center: player.obj.position.clone() });
  sfx.nova();
}
function updateNovas(dt) {
  for (let i = novas.length - 1; i >= 0; i--) {
    const n = novas[i];
    n.prevR = n.r; n.r += n.speed * dt;
    n.mesh.scale.set(n.r, n.r, 1);
    n.mesh.material.opacity = Math.max(0, 0.85 * (1 - n.r / n.maxR));
    for (let k = enemies.length - 1; k >= 0; k--) {
      const e = enemies[k]; const d = e.mesh.position.distanceTo(n.center);
      if (d > n.prevR && d <= n.r + 8) damageEnemy(e, n.dmg);
    }
    if (n.r >= n.maxR) { scene.remove(n.mesh); n.mesh.material.dispose(); novas.splice(i, 1); }
  }
}

function fireWeapons(dt) {
  if (!player.alive) return;
  const fwd = playerForward().clone();
  // Cañones frontales
  const cannon = player.weapons.cannon;
  if (cannon) {
    wpTimers.cannon -= dt;
    const interval = Math.max(0.06, CFG.fireInterval - cannon.level * 0.008);
    if (wpTimers.cannon <= 0 && !player.overheated) {
      wpTimers.cannon = interval;
      player.gunSide *= -1;
      const side = new THREE.Vector3(player.gunSide * 3.4, 0, 0).applyQuaternion(player.obj.quaternion);
      const origin = player.obj.position.clone().add(side).addScaledVector(fwd, 6);
      spawnBolt(origin, fwd, CFG.boltSpeed, 'player', CFG.boltDamage + cannon.level * 4);
      bolts[bolts.length - 1].vel.add(player.vel);
      spawnFlash(origin, 0x8afcff, 5);
      player.heat += CFG.heatPerShot; sfx.laser();
      if (player.heat >= CFG.overheatAt) { player.overheated = true; say('¡SOBRECALENTAMIENTO!', 'enemy'); }
    }
  }
  // Torretas automáticas
  const turret = player.weapons.turret;
  if (turret) {
    wpTimers.turret -= dt;
    const interval = Math.max(0.25, 0.9 - turret.level * 0.06);
    if (wpTimers.turret <= 0) {
      const targets = nearestEnemies(2 + Math.floor(turret.level / 3));
      if (targets.length) {
        wpTimers.turret = interval;
        for (const t of targets) {
          const dir = t.mesh.position.clone().sub(player.obj.position).normalize();
          const origin = player.obj.position.clone().addScaledVector(dir, 5);
          spawnBolt(origin, dir, 420, 'turret', 14 + turret.level * 5);
          spawnFlash(origin, 0xffe27a, 4);
        }
        sfx.turret();
      }
    }
  }
  // Misiles enjambre
  const swarm = player.weapons.swarm;
  if (swarm) {
    wpTimers.swarm -= dt;
    const interval = Math.max(1.1, 3.2 - swarm.level * 0.22);
    if (wpTimers.swarm <= 0) {
      const count = 2 + Math.floor((swarm.level - 1) / 2);
      const targets = nearestEnemies(count);
      if (targets.length) {
        wpTimers.swarm = interval;
        for (let i = 0; i < count; i++) spawnHomingMissile(targets[i % targets.length], (i % 2 === 0 ? 1 : -1) * (2 + Math.floor(i / 2)));
        sfx.missile();
      }
    }
  }
  // Nova de choque
  const nova = player.weapons.nova;
  if (nova) {
    wpTimers.nova -= dt;
    const interval = Math.max(2.2, 5 - nova.level * 0.4);
    if (wpTimers.nova <= 0) { wpTimers.nova = interval; spawnNova(); }
  }
  updateBeams(dt);   // rayo continuo
  updateOrbs(dt);    // orbes continuos
}

// ----------------------------------------------------------------------------
// Misiles buscadores
// ----------------------------------------------------------------------------
function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.life -= dt;
    let dead = m.life <= 0;
    if (!dead && m.target && enemies.includes(m.target)) {
      const to = m.target.mesh.position.clone().sub(m.mesh.position).normalize();
      const cur = m.vel.clone().normalize();
      cur.lerp(to, Math.min(1, 3.4 * dt)).normalize();
      m.vel.copy(cur.multiplyScalar(m.speed));
      m.mesh.lookAt(m.mesh.position.clone().add(cur));
      if (m.mesh.position.distanceTo(m.target.mesh.position) < m.target.radius + 3) {
        damageEnemy(m.target, m.dmg); spawnExplosion(m.mesh.position); dead = true;
      }
    } else if (m.target && !enemies.includes(m.target)) {
      m.target = nearestEnemies(1)[0] || null;
    }
    if (dead) { scene.remove(m.mesh); missiles.splice(i, 1); continue; }
    m.mesh.position.addScaledVector(m.vel, dt);
  }
}
function cycleTarget() {
  if (game.state !== 'playing' || enemies.length === 0) return;
  const sorted = [...enemies].sort((a, b) => a.mesh.position.distanceTo(player.obj.position) - b.mesh.position.distanceTo(player.obj.position));
  const idx = sorted.indexOf(game.target);
  game.target = sorted[(idx + 1) % sorted.length];
}

// ----------------------------------------------------------------------------
// Daño al jugador
// ----------------------------------------------------------------------------
function damagePlayer(dmg) {
  if (!player.alive) return;
  player.shield -= dmg;
  if (player.shield < 0) { player.hull += player.shield; player.shield = 0; }
  player.shake = Math.min(1, player.shake + Math.min(0.5, dmg * 0.04));
  if (dmg > 3) { dom.flash.style.opacity = '1'; setTimeout(() => dom.flash.style.opacity = '0', 80); sfx.hit(); }
  if (player.hull <= 0) { player.hull = 0; player.alive = false; spawnExplosion(player.obj.position.clone(), true); gameOver(); }
}

// ----------------------------------------------------------------------------
// Progresión / subida de nivel
// ----------------------------------------------------------------------------
function gainXP(amount) {
  player.xp += amount;
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext; player.level++;
    player.xpNext = Math.round(player.xpNext * 1.35 + 3);
    openLevelUp();
  }
}
function upgradeChoices() {
  const out = [];
  for (const id of Object.keys(WEAPON_DEFS)) {
    const def = WEAPON_DEFS[id], cur = player.weapons[id];
    if (!cur) out.push({ id, kind: 'weapon', icon: def.icon, title: def.name, lvl: 'NUEVA ARMA', desc: def.desc(1) });
    else if (cur.level < def.max) out.push({ id, kind: 'weapon', icon: def.icon, title: def.name, lvl: `Nv ${cur.level} → ${cur.level + 1}`, desc: def.desc(cur.level + 1) });
  }
  out.push({ id: 'hull', kind: 'stat', icon: '🛡️', title: 'Blindaje +20', lvl: 'CASCO', desc: 'Aumenta el casco máximo y repara +20.' });
  out.push({ id: 'magnet', kind: 'stat', icon: '🧲', title: 'Imán +40%', lvl: 'RECOGIDA', desc: 'Aumenta el radio de recogida de gemas.' });
  out.push({ id: 'engine', kind: 'stat', icon: '⚡', title: 'Motores +12%', lvl: 'VELOCIDAD', desc: 'Aumenta la velocidad de la nave.' });
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out.slice(0, 3);
}
function openLevelUp() {
  game.pendingLevelUps = (game.pendingLevelUps || 0) + 1;
  if (game.state === 'levelup') return;
  showLevelUpMenu();
}
function showLevelUpMenu() {
  game.state = 'levelup'; sfx.levelup();
  const choices = upgradeChoices();
  dom.levelupCards.innerHTML = '';
  for (const c of choices) {
    const card = document.createElement('div');
    card.className = 'up-card';
    card.innerHTML = `<div class="ic">${c.icon}</div><h3>${c.title}</h3><div class="lvl">${c.lvl}</div><p>${c.desc}</p>`;
    card.addEventListener('click', () => applyUpgrade(c));
    dom.levelupCards.appendChild(card);
  }
  dom.levelupMenu.style.display = 'flex';
}
function applyUpgrade(c) {
  if (c.kind === 'weapon') {
    if (!player.weapons[c.id]) player.weapons[c.id] = { level: 1 };
    else player.weapons[c.id].level++;
    if (c.id === 'orb') rebuildOrbs();
  } else if (c.id === 'hull') { player.maxHull += 20; player.hull = Math.min(player.maxHull, player.hull + 20); }
  else if (c.id === 'magnet') player.magnet *= 1.4;
  else if (c.id === 'engine') player.moveMul *= 1.12;
  dom.levelupMenu.style.display = 'none';
  game.pendingLevelUps--;
  updateWeaponHUD();
  if (game.pendingLevelUps > 0) showLevelUpMenu();
  else game.state = 'playing';
}

// ----------------------------------------------------------------------------
// Cámara 1ª / 3ª persona (desacoplada, cinematográfica en 3ª)
// ----------------------------------------------------------------------------
const _camDesired = new THREE.Vector3(), _look = new THREE.Vector3(), _shake = new THREE.Vector3();
function setFov(f) { if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); } }
function updateCamera(dt) {
  const q = player.obj.quaternion;
  if (player.view === 'first') {
    _camDesired.set(0, 0.45, 0.2).applyQuaternion(q).add(player.obj.position);
    camera.position.copy(_camDesired);
    camera.quaternion.copy(q);
    setFov(player.boosting ? 88 : 76);
  } else if (player.view === 'third') {
    const up = upVector();
    const z = player.zoom.third;
    _lvlZ.copy(player.heading).addScaledVector(up, -player.heading.dot(up));
    if (_lvlZ.lengthSq() < 1e-8) {
      _lvlZ.copy(playerForward()).addScaledVector(up, -playerForward().dot(up));
    }
    if (_lvlZ.lengthSq() > 1e-8) _lvlZ.normalize();
    else _lvlZ.set(0, 0, -1);
    _camDesired.copy(player.obj.position).addScaledVector(up, 8 * z).addScaledVector(_lvlZ, -22 * z);
    camera.position.lerp(_camDesired, Math.min(1, dt * 4.0));
    camera.up.copy(up);
    _look.copy(player.obj.position).addScaledVector(_lvlZ, 48).addScaledVector(up, 3);
    camera.lookAt(_look);
    setFov(player.boosting ? 82 : 68);
  } else {   // iso: cenital pura, referencia de pantalla fija (no rota con la nave)
    const up = upVector();
    _isoRef.projectOnPlane(up);                             // la referencia sigue la curvatura
    if (_isoRef.lengthSq() < 1e-6) _isoRef.copy(AX_Z).projectOnPlane(up);
    _isoRef.normalize();
    const base = 170 * player.zoom.iso;
    _camDesired.copy(player.obj.position).addScaledVector(up, base);
    camera.position.lerp(_camDesired, Math.min(1, dt * 6));
    camera.up.copy(_isoRef);                                // "arriba" de pantalla = referencia fija
    _look.copy(player.obj.position);
    camera.lookAt(_look);
    setFov(46);
  }
  if (player.shake > 0) {
    const sh = player.shake * 0.5;
    _shake.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    camera.position.add(_shake);
  }
}
const VIEW_LABELS = { iso: 'CÁMARA: CENITAL (A/D lateral · C · rueda)', third: 'CÁMARA: 3ª PERSONA (C · rueda)', first: 'CÁMARA: 1ª PERSONA (C)' };
function applyView() {
  if (player.ship) {
    player.ship.visible = player.view !== 'first';
    player.ship.rotation.z = 0;
  }
  dom.viewLabel.textContent = VIEW_LABELS[player.view];
  const up = upVector();
  if (player.view === 'iso') {
    _isoRef.copy(playerForward()).projectOnPlane(up);
    if (_isoRef.lengthSq() < 1e-6) _isoRef.set(0, 0, -1).projectOnPlane(up);
    _isoRef.normalize();
    _isoAlt = altitude();
  } else {
    player.heading.copy(playerForward()).addScaledVector(up, -playerForward().dot(up));
    if (player.heading.lengthSq() < 1e-8) player.heading.set(0, 0, -1).projectOnPlane(up);
    player.heading.normalize();
    player.pitch = 0;
    player.bank = 0;
  }
}
const VIEW_ORDER = ['iso', 'third', 'first'];
function toggleView() {
  if (game.state !== 'playing' && game.state !== 'levelup') return;
  player.view = VIEW_ORDER[(VIEW_ORDER.indexOf(player.view) + 1) % VIEW_ORDER.length];
  applyView();
}
function toggleMap() {
  if (game.state !== 'playing' && game.state !== 'levelup') { if (game.mapOpen) { game.mapOpen = false; dom.mapLarge.style.display = 'none'; } return; }
  game.mapOpen = !game.mapOpen;
  dom.mapLarge.style.display = game.mapOpen ? 'flex' : 'none';
}

// ----------------------------------------------------------------------------
// Jugador + gravedad planetaria
// ----------------------------------------------------------------------------
const _q = new THREE.Quaternion();
function rotatePlayer(axis, angle) { _q.setFromAxisAngle(axis, angle); player.obj.quaternion.multiply(_q); }

// Vista cenital: la nave avanza sola hacia el "arriba" de pantalla.
// A/D (o ←/→) solo desplazan lateral. La cáscara orbital fija la altura.
const _isoRef = new THREE.Vector3();          // "arriba" de pantalla, fijado al entrar en la vista
let _isoAlt = CFG.startAltitude;              // altitud que mantiene el piloto automático
const _isoUp = new THREE.Vector3(), _isoRight = new THREE.Vector3(), _isoV = new THREE.Vector3();
const _isoX = new THREE.Vector3(), _isoY = new THREE.Vector3(), _isoZ = new THREE.Vector3();
const _isoM = new THREE.Matrix4(), _isoQ = new THREE.Quaternion();
function steerIso(dt) {
  _isoUp.copy(upVector());
  _isoRight.crossVectors(_isoRef, _isoUp).normalize();
  let lat = 0;
  if (input.keys['KeyA'] || input.keys['ArrowLeft']) lat -= 1;
  if (input.keys['KeyD'] || input.keys['ArrowRight']) lat += 1;
  player.boosting = !!input.keys['ShiftLeft'] || !!input.keys['ShiftRight'];
  const cruise = (player.boosting ? CFG.boostSpeed : CFG.maxSpeed) * player.moveMul;
  _isoV.copy(_isoRef).multiplyScalar(cruise)
    .addScaledVector(_isoRight, lat * CFG.maxSpeed * player.moveMul);
  player.vel.lerp(_isoV, Math.min(1, dt * 6));
  player.speed = player.vel.length();
  _isoZ.copy(_isoRef).negate();
  _isoX.crossVectors(_isoUp, _isoZ).normalize();
  _isoY.crossVectors(_isoZ, _isoX);
  _isoM.makeBasis(_isoX, _isoY, _isoZ);
  _isoQ.setFromRotationMatrix(_isoM);
  player.obj.quaternion.slerp(_isoQ, Math.min(1, dt * 10));
  if (player.ship) {
    const bank = -lat * 0.55;
    player.ship.rotation.z += (bank - player.ship.rotation.z) * Math.min(1, dt * 8);
  }
}
function steerFox(dt) {
  const up = upVector();
  player.heading.addScaledVector(up, -player.heading.dot(up));
  if (player.heading.lengthSq() < 1e-8) {
    player.heading.set(0, 0, -1).addScaledVector(up, -player.heading.dot(up));
  }
  if (player.heading.lengthSq() > 1e-8) player.heading.normalize();

  const dz = 0.05;
  const mx = Math.abs(input.mx) > dz ? input.mx : 0;
  const my = Math.abs(input.my) > dz ? input.my : 0;
  let turn = -mx;
  if (input.keys['KeyA']) turn += 0.9;
  if (input.keys['KeyD']) turn -= 0.9;
  turn = clamp(turn, -1.35, 1.35);

  _q.setFromAxisAngle(up, turn * CFG.yawRate * dt);
  player.heading.applyQuaternion(_q);
  player.heading.addScaledVector(up, -player.heading.dot(up));
  if (player.heading.lengthSq() > 1e-8) player.heading.normalize();

  if (Math.abs(my) > dz) player.pitch -= my * CFG.pitchRate * dt;
  else player.pitch += (0 - player.pitch) * Math.min(1, dt * CFG.levelRate);
  player.pitch = clamp(player.pitch, -CFG.pitchMax, CFG.pitchMax);

  player.bank += ((-turn * CFG.bankMax) - player.bank) * Math.min(1, dt * 9);
  if (player.ship) player.ship.rotation.z = 0;
  applyFoxAttitude();

  if (input.keys['KeyW']) player.throttle = Math.min(1, player.throttle + dt * 0.8);
  if (input.keys['KeyS']) player.throttle = Math.max(0, player.throttle - dt * 0.8);
  player.boosting = !!input.keys['ShiftLeft'] || !!input.keys['ShiftRight'];
  const targetSpeed = (player.boosting ? CFG.boostSpeed : player.throttle * CFG.maxSpeed) * player.moveMul;
  player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 2.2);
  _lvlZ.copy(playerForward()).multiplyScalar(player.speed);
  player.vel.lerp(_lvlZ, Math.min(1, dt * CFG.velFollow));
}

function updatePlayer(dt) {
  if (!player.alive) return;
  if (player.view === 'iso') steerIso(dt);
  else steerFox(dt);

  player.obj.position.addScaledVector(player.vel, dt);
  if (player.view === 'iso') stickToFlightShell(player.obj.position, player.vel);
  else constrainAltitudeBand(dt);
  player.extVel.set(0, 0, 0);
  player.speed = player.vel.length();
  game.zoneWarn = false;
  dom.zoneFlash.style.opacity = '0';

  player.heat = Math.max(0, player.heat - CFG.heatCool * dt);
  if (player.overheated && player.heat <= CFG.overheatReset) { player.overheated = false; say('ARMAS RECUPERADAS', 'good'); }
  fireWeapons(dt);
  player.shield = Math.min(CFG.maxShield, player.shield + CFG.shieldRegen * dt);

  player.shake = Math.max(0, player.shake - dt * 2);
  updateCamera(dt);

  if (player.ship?.userData.engine) {
    const es = 3 + Math.sin(performance.now() * 0.02) * 0.4 + (player.boosting ? 1.5 : 0);
    player.ship.userData.engine.scale.set(es, es, 1);
  }
  dom.boostFx.style.opacity = player.boosting ? '1' : '0';
}

// ----------------------------------------------------------------------------
// Proyectiles y colisiones
// ----------------------------------------------------------------------------
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.life -= dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    let dead = b.life <= 0;
    if (!dead && b.friendly) {
      for (const e of enemies) {
        if (b.mesh.position.distanceTo(e.mesh.position) < e.radius + 2.5) { damageEnemy(e, b.dmg); spawnExplosion(b.mesh.position.clone()); dead = true; break; }
      }
    } else if (!dead && player.alive) {
      if (b.mesh.position.distanceTo(player.obj.position) < 5) { damagePlayer(b.dmg); dead = true; }
    }
    if (dead) { scene.remove(b.mesh); bolts.splice(i, 1); }
  }
}
function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    ex.life -= dt * (ex.big ? 0.8 : 1.2);
    const arr = ex.pts.geometry.attributes.position.array;
    for (let j = 0; j < arr.length; j += 3) { arr[j] += ex.v[j] * dt; arr[j + 1] += ex.v[j + 1] * dt; arr[j + 2] += ex.v[j + 2] * dt; }
    ex.pts.geometry.attributes.position.needsUpdate = true;
    ex.pts.material.opacity = Math.max(0, ex.life);
    ex.flash.material.opacity = Math.max(0, ex.life);
    ex.flash.scale.multiplyScalar(1 + dt * 3);
    if (ex.life <= 0) { scene.remove(ex.pts); scene.remove(ex.flash); ex.pts.geometry.dispose(); ex.pts.material.dispose(); explosions.splice(i, 1); }
  }
}
function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    p.mesh.rotation.y += dt * 2.5; p.mesh.rotation.x += dt * 0.8;
    const d = p.mesh.position.distanceTo(player.obj.position);
    if (d < player.magnet && player.alive) {
      const dir = player.obj.position.clone().sub(p.mesh.position).normalize();
      p.mesh.position.addScaledVector(dir, Math.max(70, player.magnet - d) * dt * 2.4);
    }
    let dead = p.life <= 0;
    if (player.alive && d < 9) {
      if (p.kind === 'repair') { player.hull = Math.min(player.maxHull, player.hull + 30); player.shield = Math.min(CFG.maxShield, player.shield + 20); say('REPARACIÓN · CASCO +30', 'good'); }
      else { gainXP(1); game.score += 15; }
      sfx.pickup(); dead = true;
    }
    if (dead) { scene.remove(p.mesh); pickups.splice(i, 1); }
  }
}

// ----------------------------------------------------------------------------
// Generación continua de enemigos
// ----------------------------------------------------------------------------
function updateSpawner(dt) {
  game.spawnT -= dt;
  const cap = Math.min(28 + game.difficulty * 6, 95);
  if (game.spawnT <= 0 && enemies.length < cap) {
    game.spawnT = Math.max(0.35, 1.6 - game.difficulty * 0.12) / game.difficultyMul;
    const batch = 1 + Math.floor(game.difficulty / 2);
    for (let i = 0; i < batch && enemies.length < cap; i++) {
      const gunnerChance = Math.min(0.42, 0.12 + game.difficulty * 0.03);
      spawnEnemy(Math.random() < gunnerChance ? 'gunner' : 'drone');
    }
    if (game.difficulty >= 3 && Math.random() < 0.12) { spawnEnemy(Math.random() < 0.5 ? 'gunner' : 'drone', true); say('¡UNIDAD ÉLITE DETECTADA!', 'enemy'); }
  }
}

// ----------------------------------------------------------------------------
// Mapa mundial con niebla de guerra
// ----------------------------------------------------------------------------
const GW = 160, GH = 80;
let explored = new Uint8Array(GW * GH);
function markExplored(lat, lon) {
  const cx = Math.floor((lon / (Math.PI * 2) + 0.5) * GW);
  const cy = Math.floor((0.5 - lat / Math.PI) * GH);
  const R = 3;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dy * dy > R * R) continue;
    const gx = ((cx + dx) % GW + GW) % GW, gy = cy + dy;
    if (gy < 0 || gy >= GH) continue;
    explored[gy * GW + gx] = 1;
  }
}
function exploredPct() {
  let s = 0; for (let i = 0; i < explored.length; i++) s += explored[i];
  return Math.round(s / explored.length * 100);
}
function lonLatToMap(lon, lat, W, H) { return { x: (lon / (Math.PI * 2) + 0.5) * W, y: (0.5 - lat / Math.PI) * H }; }
function drawWorldMap(g, W, H, big) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = 'rgba(2,10,18,.94)'; g.fillRect(0, 0, W, H);
  const cw = W / GW, ch = H / GH;
  g.fillStyle = big ? 'rgba(53,240,255,.14)' : 'rgba(53,240,255,.12)';
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (explored[y * GW + x]) g.fillRect(x * cw, y * ch, cw + 1, ch + 1);
  g.strokeStyle = 'rgba(53,240,255,.18)'; g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, W - 1, H - 1);
  g.globalAlpha = 0.25; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.globalAlpha = 1;
  for (const lm of landmarks) {
    if (!lm.discovered) continue;
    const p = lonLatToMap(lm.lon, lm.lat, W, H);
    g.fillStyle = '#ff9a3c'; g.beginPath(); g.arc(p.x, p.y, big ? 6 : 3, 0, Math.PI * 2); g.fill();
    if (big) { g.fillStyle = '#ffd27a'; g.font = '12px monospace'; g.fillText(lm.name, p.x + 9, p.y + 4); }
  }
  const pl = playerLatLon(), pp = lonLatToMap(pl.lon, pl.lat, W, H);
  g.save(); g.translate(pp.x, pp.y);
  const yaw = Math.atan2(playerForward().x, playerForward().z);
  g.rotate(-yaw);
  g.fillStyle = '#35f0ff'; g.beginPath();
  const s = big ? 8 : 4.5;
  g.moveTo(0, -s); g.lineTo(-s * 0.7, s * 0.7); g.lineTo(s * 0.7, s * 0.7); g.closePath(); g.fill();
  g.restore();
}

// ----------------------------------------------------------------------------
// HUD y radar
// ----------------------------------------------------------------------------
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${s.toString().padStart(2, '0')}`; }
function updateWeaponHUD() {
  const rows = [];
  for (const id of Object.keys(WEAPON_DEFS)) {
    const w = player.weapons[id]; if (!w) continue;
    const def = WEAPON_DEFS[id];
    let pips = '';
    for (let i = 0; i < def.max; i++) pips += `<span class="wpip ${i < w.level ? 'on' : ''}"></span>`;
    rows.push(`<div class="wrow"><span class="wname">${def.icon} ${def.name}</span><span class="wpips">${pips}</span></div>`);
  }
  dom.weaponList.innerHTML = rows.join('');
}
function updateHUD() {
  dom.score.textContent = game.score.toLocaleString('es-ES');
  dom.planet.textContent = `${game.planetName} · Nv AMENAZA ${game.difficulty}`;
  dom.kills.textContent = `BAJAS: ${game.kills} · ENEMIGOS: ${enemies.length}`;
  dom.timer.textContent = `TIEMPO ${fmtTime(game.time)}`;
  dom.levelBadge.textContent = `Lv ${player.level}`;
  dom.xpBar.style.width = (player.xp / player.xpNext * 100) + '%';
  dom.shieldBar.style.width = (player.shield / CFG.maxShield * 100) + '%';
  dom.hullBar.style.width = (player.hull / player.maxHull * 100) + '%';
  dom.hullBar.style.background = player.hull < player.maxHull * 0.3 ? 'var(--red)' : '';
  dom.speed.textContent = Math.round(player.speed);
  dom.speed.classList.toggle('boost', player.boosting);
  dom.throttleBar.style.width = (player.throttle * 100) + '%';
  dom.heatBar.style.width = (player.heat / CFG.overheatAt * 100) + '%';
  dom.heatLabel.textContent = player.overheated ? 'ARMAS: SOBRECALENTADAS' : 'ARMAS: AUTO';
  dom.heatLabel.classList.toggle('hot', player.overheated);
  const alt = altitude();
  const span = CFG.altMax - CFG.altMin;
  dom.altBar.style.width = clamp((alt - CFG.altMin) / span * 100, 0, 100) + '%';
  dom.altLabel.textContent = `ALTITUD ${Math.round(alt)} m`;
  const atEdge = alt <= CFG.altLow + 8 || alt >= CFG.altHigh - 8;
  dom.altLabel.classList.toggle('warn', atEdge);
  let sys = 'SISTEMAS NOMINALES', warn = false;
  if (!player.alive) { sys = 'NAVE DESTRUIDA'; warn = true; }
  else if (alt >= CFG.altMax - 20) { sys = 'TECHO DEL PASILLO'; warn = true; }
  else if (alt <= CFG.altMin + 20) { sys = 'SUELO DEL PASILLO'; warn = true; }
  else if (player.hull < player.maxHull * 0.3) { sys = '¡CASCO CRÍTICO!'; warn = true; }
  else if (player.shield < 25) { sys = 'ESCUDOS BAJOS'; warn = true; }
  else if (player.boosting) { sys = 'POSTCOMBUSTIÓN'; }
  dom.sysLine.textContent = sys;
  dom.sysLine.classList.toggle('warn', warn);
  const t = game.target && enemies.includes(game.target) ? game.target : null;
  if (t) { dom.tName.textContent = t.name; dom.tDist.textContent = `DIST: ${Math.round(t.mesh.position.distanceTo(player.obj.position))} m`; dom.tHull.style.width = Math.max(0, t.hp / t.maxHp * 100) + '%'; }
  else { dom.tName.textContent = 'SIN OBJETIVO (T)'; dom.tDist.textContent = '--'; dom.tHull.style.width = '0%'; }
  dom.lockbox.style.display = 'none'; dom.lockLabel.style.display = 'none';
  dom.mapLabel.textContent = `MAPA (M) · ${exploredPct()}% EXPLORADO`;
}
function drawRadar() {
  const g = dom.radar, S = 150, C = S / 2;
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(3,20,28,.85)'; g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(53,240,255,.4)'; g.lineWidth = 1;
  g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(C, C, (C - 2) / 2, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(C, 4); g.lineTo(C, S - 4); g.moveTo(4, C); g.lineTo(S - 4, C);
  g.globalAlpha = 0.25; g.stroke(); g.globalAlpha = 1;
  const inv = player.obj.quaternion.clone().invert();
  const rel = new THREE.Vector3();
  const plot = (pos, color, size, ring = false) => {
    rel.copy(pos).sub(player.obj.position).applyQuaternion(inv);
    const x = C + (rel.x / CFG.radarRange) * C, y = C + (rel.z / CFG.radarRange) * C;
    if (x < 4 || x > S - 4 || y < 4 || y > S - 4) return;
    g.fillStyle = color; g.beginPath(); g.arc(x, y, size, 0, Math.PI * 2); g.fill();
    if (ring) { g.strokeStyle = color; g.beginPath(); g.arc(x, y, size + 3, 0, Math.PI * 2); g.stroke(); }
  };
  for (const p of pickups) plot(p.mesh.position, p.kind === 'repair' ? '#4dff88' : '#c46bff', 1.6);
  for (const e of enemies) plot(e.mesh.position, e === game.target ? '#ffe27a' : (e.ace ? '#ff3b6e' : '#ff3b4e'), e.ace ? 3.4 : 2.2, e === game.target);
  for (const m of missiles) plot(m.mesh.position, '#ffc46b', 1.4);
  g.fillStyle = '#35f0ff'; g.beginPath(); g.moveTo(C, C - 6); g.lineTo(C - 4, C + 4); g.lineTo(C + 4, C + 4); g.closePath(); g.fill();
}

// ----------------------------------------------------------------------------
// Descubrimiento / niebla de guerra por frame
// ----------------------------------------------------------------------------
function updateExploration() {
  const pl = playerLatLon();
  markExplored(pl.lat, pl.lon);
  for (const lm of landmarks) {
    if (lm.discovered) continue;
    if (player.obj.position.distanceTo(lm.pos) < 1800) {
      lm.discovered = true;
      say('DESCUBIERTO: ' + lm.name, 'gold'); sfx.discover();
    }
  }
}

// ----------------------------------------------------------------------------
// Estados del juego
// ----------------------------------------------------------------------------
const game = {
  state: 'menu', score: 0, kills: 0, time: 0,
  difficulty: 1, spawnT: 1, diffT: 0,
  target: null, zoneWarn: false, mapOpen: false,
  planetKey: 'sun', planetName: '',
  gravityMul: 1, difficultyMul: 1, pendingLevelUps: 0,
};
function clearEntities() {
  for (const arr of [enemies, missiles, pickups]) { for (const e of arr) scene.remove(e.mesh); arr.length = 0; }
  for (const b of bolts) scene.remove(b.mesh); bolts.length = 0;
  for (const ex of explosions) { scene.remove(ex.pts); scene.remove(ex.flash); } explosions.length = 0;
  for (const o of orbs) scene.remove(o.mesh); orbs.length = 0;
  for (const n of novas) scene.remove(n.mesh); novas.length = 0;
  for (const b of beams) b.mesh.visible = false;
  for (const f of flashPool) { f.s.visible = false; f.life = 0; }
}
function startGame() {
  sfx.init();
  clearEntities();
  const preset = PLANETS[game.planetKey];
  game.planetName = preset.name;
  game.gravityMul = preset.gravityMul;
  game.difficultyMul = preset.difficultyMul;

  planetCenter.set(0, -(CFG.planetRadius + CFG.startAltitude), 0);
  buildPlanet(preset);
  buildSurface(preset);

  explored = new Uint8Array(GW * GH);

  player.obj.position.set(0, 0, 0);
  player.obj.quaternion.identity();
  player.heading.set(0, 0, -1);
  player.pitch = 0; player.bank = 0;
  stickToFlightShell(player.obj.position, player.vel);
  player.vel.set(0, 0, 0); player.extVel.set(0, 0, 0);
  player.speed = 0; player.throttle = 0.6;
  player.shield = CFG.maxShield; player.maxHull = CFG.maxHull; player.hull = CFG.maxHull;
  player.heat = 0; player.overheated = false; player.alive = true; player.shake = 0;
  player.level = 1; player.xp = 0; player.xpNext = 5;
  player.magnet = 80; player.moveMul = 1;
  player.weapons = { cannon: { level: 1 }, turret: { level: 1 }, orb: { level: 1 }, swarm: { level: 1 }, beam: { level: 1 } };
  for (const k in wpTimers) wpTimers[k] = 0;

  if (player.ship) player.obj.remove(player.ship);
  player.ship = createPlayerShip(); player.obj.add(player.ship);
  rebuildOrbs();
  player.view = 'iso'; player.zoom.iso = 1; player.zoom.third = 1; applyView();
  updateWeaponHUD();

  game.state = 'playing';
  game.score = 0; game.kills = 0; game.time = 0;
  game.difficulty = 1; game.spawnT = 0.5; game.diffT = 0;
  game.target = null; game.zoneWarn = false; game.pendingLevelUps = 0;
  game.mapOpen = false; dom.mapLarge.style.display = 'none';

  dom.mainMenu.style.display = 'none';
  dom.gameoverMenu.style.display = 'none';
  dom.pauseMenu.style.display = 'none';
  dom.levelupMenu.style.display = 'none';
  dom.hud.style.display = 'block';
  say(`DESPLIEGUE SOBRE ${preset.name} · SOBREVIVE AL ENJAMBRE`, 'good');
  say('PASILLO STAR FOX · CABECEA DENTRO DEL RANGO · EXPLORA EL MAPA (M)', 'gold');
}
function gameOver() {
  game.state = 'over';
  dom.finalStats.innerHTML =
    `SOBREVIVISTE <b>${fmtTime(game.time)}</b><br>NIVEL <b>${player.level}</b> · BAJAS <b>${game.kills}</b><br>` +
    `EXPLORADO <b>${exploredPct()}%</b> · PUNTUACIÓN <b>${game.score.toLocaleString('es-ES')}</b>`;
  setTimeout(() => { dom.gameoverMenu.style.display = 'flex'; dom.hud.style.display = 'none'; }, 1600);
}
function togglePause() {
  if (game.state === 'playing') { game.state = 'paused'; dom.pauseMenu.style.display = 'flex'; }
  else if (game.state === 'paused') { game.state = 'playing'; dom.pauseMenu.style.display = 'none'; }
}
for (const card of dom.planetSelect.querySelectorAll('.planet-card')) {
  card.addEventListener('click', () => {
    dom.planetSelect.querySelectorAll('.planet-card').forEach(c => c.classList.remove('sel'));
    card.classList.add('sel');
    game.planetKey = card.dataset.planet;
  });
}
$('start-btn').addEventListener('click', startGame);
$('retry-btn').addEventListener('click', () => { dom.mainMenu.style.display = 'flex'; dom.gameoverMenu.style.display = 'none'; });
$('resume-btn').addEventListener('click', togglePause);

// ----------------------------------------------------------------------------
// Bucle principal
// ----------------------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (game.state === 'playing') {
    game.time += dt;
    game.diffT += dt;
    if (game.diffT >= 25) { game.diffT = 0; game.difficulty++; say(`NIVEL DE AMENAZA ${game.difficulty}`, 'enemy'); }

    updatePlayer(dt);
    updateSpawner(dt);
    for (let i = enemies.length - 1; i >= 0; i--) updateEnemy(enemies[i], dt);
    updateBolts(dt);
    updateMissiles(dt);
    updateNovas(dt);
    updateExplosions(dt);
    updatePickups(dt);
    updateFlashes(dt);
    updateExploration();

    stars.position.copy(player.obj.position);
    if (corona) corona.material.rotation += dt * 0.05;

    sfx.engine(player.speed / CFG.boostSpeed, player.boosting, player.alive);
    updateHUD();
    drawRadar();
    drawWorldMap(dom.worldmap, 220, 110, false);
    if (game.mapOpen) drawWorldMap(dom.worldmapBig, 900, 450, true);
  } else {
    sfx.engine(0, false, false);
    if (game.state === 'levelup') { updateExplosions(dt); updateFlashes(dt); stars.position.copy(player.obj.position); updateCamera(dt); }
    if (game.state === 'over') updateExplosions(dt);
  }
  composer.render();
}
animate();
