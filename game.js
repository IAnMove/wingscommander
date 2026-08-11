// ============================================================================
// STAR WING // 2026 — clon modernizado de Wing Commander
// Motor: Three.js (módulos vía CDN). Sin build, servir con cualquier servidor.
// ============================================================================
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ----------------------------------------------------------------------------
// Configuración
// ----------------------------------------------------------------------------
const CFG = {
  maxSpeed: 90, boostSpeed: 260, accel: 60,
  pitchRate: 1.5, yawRate: 1.5, rollRate: 2.2,
  maxShield: 100, maxHull: 100, shieldRegen: 4,      // escudos por segundo
  boltSpeed: 430, boltDamage: 10, fireInterval: 0.13,
  heatPerShot: 7, heatCool: 26, overheatAt: 100, overheatReset: 30,
  missileSpeed: 170, missileDamage: 65, missileLife: 7, lockTime: 0.8, lockAngle: 0.22,
  radarRange: 1300, engageRange: 900,
  starCount: 3200, starCube: 4000,
};

// ----------------------------------------------------------------------------
// Referencias DOM
// ----------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const dom = {
  hud: $('hud'), score: $('score'), wave: $('wave-line'), kills: $('kills-line'),
  shieldBar: $('shield-bar').firstElementChild, hullBar: $('hull-bar').firstElementChild,
  sysLine: $('sys-line'), speed: $('speed-val'),
  throttleBar: $('throttle-bar').firstElementChild, heatBar: $('heat-bar').firstElementChild,
  heatLabel: $('heat-label'), radar: $('radar').getContext('2d'),
  tName: $('t-name'), tDist: $('t-dist'), tHull: $('t-hull'),
  lockbox: $('lockbox'), lockLabel: $('lock-label'), comms: $('comms'),
  flash: $('damage-flash'), boostFx: $('boost-lines'),
  mainMenu: $('main-menu'), pauseMenu: $('pause-menu'), gameoverMenu: $('gameover-menu'),
  finalStats: $('final-stats'),
};

// ----------------------------------------------------------------------------
// Audio sintetizado (WebAudio, sin assets)
// ----------------------------------------------------------------------------
const sfx = {
  ctx: null, master: null, engineOsc: null, engineGain: null, noiseBuf: null,
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    // ruido blanco reutilizable
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // motor: sierra grave + filtro
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
  blip(freq0, freq1, dur, type = 'square', vol = 0.18) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(freq1, 1), t + dur);
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
  laser()       { this.blip(950, 180, 0.14, 'square', 0.12); },
  enemyLaser()  { this.blip(420, 90, 0.18, 'sawtooth', 0.07); },
  missile()     { this.noise(0.7, 1800, 0.25); this.blip(200, 600, 0.5, 'sawtooth', 0.08); },
  explosion(big = false) { this.noise(big ? 1.4 : 0.8, big ? 900 : 1400, big ? 0.7 : 0.45); },
  hit()         { this.blip(180, 60, 0.12, 'triangle', 0.25); this.noise(0.15, 800, 0.2); },
  lockBeep()    { this.blip(1200, 1200, 0.06, 'square', 0.08); },
  locked()      { this.blip(1600, 1600, 0.25, 'square', 0.12); },
  pickup()      { this.blip(600, 1400, 0.25, 'sine', 0.2); },
  engine(speedNorm, boosting, active) {
    if (!this.ctx) return;
    const target = active ? 0.05 + speedNorm * 0.1 + (boosting ? 0.08 : 0) : 0;
    this.engineGain.gain.value += (target - this.engineGain.gain.value) * 0.1;
    this.engineOsc.frequency.value = 38 + speedNorm * 55 + (boosting ? 45 : 0);
  },
};

// ----------------------------------------------------------------------------
// Entrada (ratón + teclado)
// ----------------------------------------------------------------------------
const input = {
  mx: 0, my: 0,            // ratón normalizado -1..1 respecto al centro
  fire: false, keys: {},
};
addEventListener('mousemove', e => {
  input.mx = (e.clientX / innerWidth) * 2 - 1;
  input.my = (e.clientY / innerHeight) * 2 - 1;
});
addEventListener('mousedown', e => {
  if (e.button === 0) input.fire = true;
  if (e.button === 2) tryFireMissile();
});
addEventListener('mouseup', e => { if (e.button === 0) input.fire = false; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  input.keys[e.code] = true;
  if (e.code === 'Space') { input.fire = true; e.preventDefault(); }
  if (e.code === 'KeyM') tryFireMissile();
  if (e.code === 'KeyT') cycleTarget();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
addEventListener('keyup', e => {
  input.keys[e.code] = false;
  if (e.code === 'Space') input.fire = false;
});

// ----------------------------------------------------------------------------
// Renderer / escena / post-procesado
// ----------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas: $('game-canvas'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.fog = null;
const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.1, 30000);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.55, 0.55);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// Luces para los materiales estándar de las naves
scene.add(new THREE.HemisphereLight(0x8fa8ff, 0x0a0a14, 0.7));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
sun.position.set(1, 0.6, 0.4);
scene.add(sun);

// ----------------------------------------------------------------------------
// Jugador (nave = contenedor de orientación; la cámara va dentro)
// ----------------------------------------------------------------------------
const player = {
  obj: new THREE.Object3D(),
  vel: new THREE.Vector3(),
  speed: 0, throttle: 0.6, boosting: false,
  shield: CFG.maxShield, hull: CFG.maxHull,
  heat: 0, overheated: false, fireTimer: 0, gunSide: 1,
  shake: 0, alive: true,
};
player.obj.add(camera);
camera.position.set(0, 0, 0);
scene.add(player.obj);

const _fwd = new THREE.Vector3();
function playerForward() { return _fwd.set(0, 0, -1).applyQuaternion(player.obj.quaternion); }

// ----------------------------------------------------------------------------
// Texturas procedurales (canvas)
// ----------------------------------------------------------------------------
function radialTexture(size, stops) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [p, col] of stops) grad.addColorStop(p, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = radialTexture(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]);

function nebulaTexture(hue) {
  return radialTexture(256, [
    [0, `hsla(${hue},90%,60%,.55)`],
    [0.4, `hsla(${hue + 30},80%,45%,.25)`],
    [1, 'rgba(0,0,0,0)'],
  ]);
}

function planetTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const base = g.createLinearGradient(0, 0, 0, 256);
  base.addColorStop(0, '#1b3a6b'); base.addColorStop(0.5, '#2e6f9e');
  base.addColorStop(0.8, '#173a5c'); base.addColorStop(1, '#0c2038');
  g.fillStyle = base; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 60; i++) {           // bandas nubosas
    g.fillStyle = `hsla(${200 + Math.random() * 30},60%,${55 + Math.random() * 25}%,${0.06 + Math.random() * 0.12})`;
    const y = Math.random() * 256, h = 4 + Math.random() * 18;
    g.beginPath(); g.ellipse(Math.random() * 512, y, 90 + Math.random() * 260, h, 0, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ----------------------------------------------------------------------------
// Entorno: estrellas (con wrap), nebulosas, planeta
// ----------------------------------------------------------------------------
const envWrap = [];   // {obj, cube} — objetos que se re-posicionan alrededor del jugador

function buildStars() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(CFG.starCount * 3);
  const col = new Float32Array(CFG.starCount * 3);
  const c = new THREE.Color();
  for (let i = 0; i < CFG.starCount; i++) {
    pos[i * 3] = (Math.random() - 0.5) * CFG.starCube;
    pos[i * 3 + 1] = (Math.random() - 0.5) * CFG.starCube;
    pos[i * 3 + 2] = (Math.random() - 0.5) * CFG.starCube;
    c.setHSL(Math.random() < 0.85 ? 0.6 : Math.random(), Math.random() * 0.5, 0.65 + Math.random() * 0.35);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95 });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  scene.add(stars);
  return stars;
}
const stars = buildStars();

function wrapPoints(points, cube) {
  const arr = points.geometry.attributes.position.array;
  const p = player.obj.position, half = cube / 2;
  for (let i = 0; i < arr.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const idx = i + a, pc = a === 0 ? p.x : a === 1 ? p.y : p.z;
      if (arr[idx] - pc > half) arr[idx] -= cube;
      else if (arr[idx] - pc < -half) arr[idx] += cube;
    }
  }
  points.geometry.attributes.position.needsUpdate = true;
}

const nebulas = [];
for (let i = 0; i < 9; i++) {
  const mat = new THREE.SpriteMaterial({
    map: nebulaTexture(180 + Math.random() * 140),
    blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.32,
  });
  const s = new THREE.Sprite(mat);
  const r = 5000 + Math.random() * 4000;
  const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
  s.position.set(r * Math.sin(ph) * Math.cos(th), r * Math.sin(ph) * Math.sin(th), r * Math.cos(ph));
  const sc = 3000 + Math.random() * 4000;
  s.scale.set(sc, sc, 1);
  scene.add(s);
  nebulas.push(s);
}

const planet = new THREE.Mesh(
  new THREE.SphereGeometry(650, 48, 32),
  new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 0.9, metalness: 0 })
);
planet.position.set(6000, -1500, -9000);
scene.add(planet);
const planetGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, color: 0x3a7bd5, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5,
}));
planetGlow.scale.set(2200, 2200, 1);
planetGlow.position.copy(planet.position);
scene.add(planetGlow);

function wrapSprite(s, cube) {
  const p = player.obj.position, half = cube / 2;
  for (const a of ['x', 'y', 'z']) {
    if (s.position[a] - p[a] > half) s.position[a] -= cube;
    else if (s.position[a] - p[a] < -half) s.position[a] += cube;
  }
}

// ----------------------------------------------------------------------------
// Comunicaciones (mensajes en pantalla)
// ----------------------------------------------------------------------------
function say(text, cls = '') {
  const div = document.createElement('div');
  div.className = 'comm-msg ' + cls;
  div.textContent = text;
  dom.comms.appendChild(div);
  while (dom.comms.children.length > 4) dom.comms.firstChild.remove();
  setTimeout(() => { div.style.opacity = '0'; }, 3200);
  setTimeout(() => div.remove(), 3900);
}
const TAUNTS = ['¡No escaparás, terrícola!', '¡Por el Imperio Kilrathi!', '¡Tu nave será chatarra!',
  '¡Ese piloto es mío!', '¡Siente la furia del enjambre!'];
const KILL_LINES = ['¡Objetivo destruido!', '¡Enemigo abatido!', '¡Buen disparo, Comandante!',
  '¡Uno menos!', '¡Impacto confirmado!'];
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ----------------------------------------------------------------------------
// Modelo de caza enemigo (morro en +Z para que lookAt apunte bien)
// ----------------------------------------------------------------------------
function createFighterMesh(tint, ace = false) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({
    color: ace ? 0x3a2030 : 0x4a5160, metalness: 0.85, roughness: 0.35,
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: tint });

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.1, 6, 6), hullMat);
  nose.rotation.x = Math.PI / 2;          // +Y -> +Z (morro al frente)
  nose.position.z = 2;
  g.add(nose);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 4, 6), hullMat);
  body.rotation.x = Math.PI / 2;
  body.position.z = -1;
  g.add(body);

  const wingGeo = new THREE.BoxGeometry(9, 0.18, 2.4);
  const wingL = new THREE.Mesh(wingGeo, hullMat);
  wingL.position.set(-2.5, 0, -1.5);
  wingL.rotation.z = 0.18;
  const wingR = wingL.clone();
  wingR.position.x = 2.5; wingR.rotation.z = -0.18;
  g.add(wingL, wingR);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3, 1.8), hullMat);
  tail.position.set(0, 1.2, -2.2);
  g.add(tail);

  // franjas luminosas
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 5.5), glowMat);
  stripe.position.set(-1.15, 0.35, -0.5);
  const stripe2 = stripe.clone(); stripe2.position.x = 1.15;
  g.add(stripe, stripe2);

  // resplandor de motor
  const eng = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: tint, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  eng.position.z = -3.4;
  eng.scale.set(3, 3, 1);
  g.add(eng);
  g.userData.engine = eng;

  const scale = ace ? 1.5 : 1;
  g.scale.setScalar(scale);
  return g;
}

// ----------------------------------------------------------------------------
// Entidades dinámicas
// ----------------------------------------------------------------------------
const enemies = [], bolts = [], missiles = [], explosions = [], pickups = [];

const boltGeoP = new THREE.BoxGeometry(0.35, 0.35, 7);
const boltMatP = new THREE.MeshBasicMaterial({ color: 0x66f6ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
const boltMatE = new THREE.MeshBasicMaterial({ color: 0xff5a3c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });

function spawnBolt(origin, dir, speed, friendly) {
  const m = new THREE.Mesh(boltGeoP, friendly ? boltMatP : boltMatE);
  m.position.copy(origin);
  m.lookAt(origin.clone().add(dir));
  scene.add(m);
  bolts.push({
    mesh: m, vel: dir.clone().multiplyScalar(speed),
    life: 3, friendly,
    dmg: friendly ? CFG.boltDamage : 8 + game.wave,
  });
  if (!friendly) sfx.enemyLaser();
}

function spawnMissile(target) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 3, 6),
    new THREE.MeshBasicMaterial({ color: 0xffc46b })
  );
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff9a3c, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flare.scale.set(4, 4, 1); flare.position.z = -2;
  g.add(flare);
  const dir = playerForward().clone();
  g.position.copy(player.obj.position).addScaledVector(dir, 6);
  g.lookAt(g.position.clone().add(dir));
  scene.add(g);
  missiles.push({
    mesh: g, target,
    vel: dir.multiplyScalar(CFG.missileSpeed),
    life: CFG.missileLife,
  });
  sfx.missile();
  say('MISIL FUERA', 'gold');
}

function spawnExplosion(pos, big = false) {
  const n = big ? 140 : 70;
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3), v = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
    const sp = (big ? 60 : 35) * (0.3 + Math.random());
    v[i * 3] = sp * Math.sin(ph) * Math.cos(th);
    v[i * 3 + 1] = sp * Math.sin(ph) * Math.sin(th);
    v[i * 3 + 2] = sp * Math.cos(ph);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const mat = new THREE.PointsMaterial({
    color: big ? 0xffb347 : 0xff7a3c, size: big ? 4 : 2.6,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffdd99, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  flash.position.copy(pos);
  flash.scale.setScalar(big ? 60 : 26);
  scene.add(flash);

  explosions.push({ pts, v, flash, life: 1, big });
  sfx.explosion(big);
}

function spawnPickup(pos) {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.2),
    new THREE.MeshBasicMaterial({ color: 0x4dff88, wireframe: true })
  );
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x4dff88, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7,
  }));
  halo.scale.set(9, 9, 1);
  m.add(halo);
  m.position.copy(pos);
  scene.add(m);
  pickups.push({ mesh: m, life: 25 });
}

// ----------------------------------------------------------------------------
// Enemigos e IA
// ----------------------------------------------------------------------------
let enemyId = 0;
function spawnEnemy(wave, ace = false) {
  const tint = ace ? 0xff3b6e : 0xff7a3c;
  const mesh = createFighterMesh(tint, ace);
  const dir = new THREE.Vector3().randomDirection();
  mesh.position.copy(player.obj.position).addScaledVector(dir, 900 + Math.random() * 500);
  scene.add(mesh);
  enemies.push({
    id: enemyId++,
    name: (ace ? 'ACE-' : 'KILRATHI-') + (100 + enemyId),
    mesh, ace,
    hp: (ace ? 2.2 : 1) * (26 + wave * 9),
    maxHp: (ace ? 2.2 : 1) * (26 + wave * 9),
    radius: ace ? 8 : 5.5,
    speed: Math.min(46 + wave * 4 + Math.random() * 14, 120) * (ace ? 1.25 : 1),
    turn: (0.9 + Math.random() * 0.5) * (ace ? 1.6 : 1),
    state: 'approach', stateT: 0,
    evadeDir: new THREE.Vector3(),
    fireT: 1 + Math.random() * 2,
    enginePhase: Math.random() * Math.PI * 2,
  });
}

function updateEnemy(e, dt) {
  const toPlayer = player.obj.position.clone().sub(e.mesh.position);
  const dist = toPlayer.length();
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(e.mesh.quaternion);
  let desired;

  e.stateT -= dt;
  if (e.state === 'approach') {
    desired = toPlayer;
    if (dist < 420) { e.state = 'attack'; e.stateT = 2 + Math.random() * 2; }
  } else if (e.state === 'attack') {
    // apuntar con anticipación
    desired = toPlayer.clone().addScaledVector(player.vel, dist / 220);
    // disparar si está alineado y en rango
    e.fireT -= dt;
    if (e.fireT <= 0 && fwd.angleTo(toPlayer.clone().normalize()) < 0.12 && dist < 520 && player.alive) {
      const spread = new THREE.Vector3().randomDirection().multiplyScalar(0.02);
      spawnBolt(e.mesh.position.clone().addScaledVector(fwd, 6),
        toPlayer.normalize().add(spread).normalize(), 200, false);
      e.fireT = Math.max(0.35, 1.4 - game.wave * 0.08) * (0.7 + Math.random() * 0.6);
    }
    if (dist < 110 || e.stateT <= 0) {
      e.state = 'evade'; e.stateT = 1.6 + Math.random() * 1.4;
      e.evadeDir.randomDirection();
      if (e.evadeDir.dot(toPlayer) > 0) e.evadeDir.negate();
    }
  } else { // evade
    desired = e.evadeDir;
    if (e.stateT <= 0) e.state = 'approach';
  }

  // giro limitado hacia la dirección deseada
  desired.normalize();
  fwd.lerp(desired, Math.min(1, e.turn * dt)).normalize();
  e.mesh.lookAt(e.mesh.position.clone().add(fwd));
  const spd = e.state === 'attack' ? e.speed * 1.35 : e.speed;
  e.mesh.position.addScaledVector(fwd, spd * dt);

  // pulso del motor
  e.enginePhase += dt * 8;
  const s = 2.6 + Math.sin(e.enginePhase) * 0.5;
  e.mesh.userData.engine.scale.set(s, s, 1);

  // embestida
  if (dist < e.radius + 6 && player.alive) {
    damagePlayer(25);
    damageEnemy(e, 999);
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
  game.score += (e.ace ? 300 : 100) * game.wave;
  say(pick(KILL_LINES), 'good');
  if (Math.random() < 0.3) spawnPickup(e.mesh.position);
  if (game.target === e) game.target = null;
  if (game.lock.target === e) resetLock();
  if (enemies.length === 0) onWaveCleared();
}

// ----------------------------------------------------------------------------
// Oleadas
// ----------------------------------------------------------------------------
const game = {
  state: 'menu',      // menu | playing | paused | over
  wave: 0, score: 0, kills: 0,
  target: null,
  lock: { target: null, progress: 0, locked: false, beepT: 0 },
  betweenWaves: false, waveT: 0,
};

function startWave(n) {
  game.wave = n;
  game.betweenWaves = false;
  const count = Math.min(2 + n, 8);
  for (let i = 0; i < count; i++) spawnEnemy(n);
  if (n >= 3 && n % 2 === 1) spawnEnemy(n, true);   // as enemigo en oleadas impares
  say(`OLEADA ${n} — ${count} HOSTILES DETECTADOS`, 'enemy');
  if (n >= 3 && n % 2 === 1) say('ATENCIÓN: AS ENEMIGO EN LA ZONA', 'enemy');
  if (Math.random() < 0.6) setTimeout(() => say('ENEMIGO: ' + pick(TAUNTS), 'enemy'), 2500);
}

function onWaveCleared() {
  game.score += 500;
  player.shield = Math.min(CFG.maxShield, player.shield + 25);
  say('OLEADA DESPEJADA · +500 · ESCUDOS +25', 'gold');
  game.betweenWaves = true;
  game.waveT = 4;
}

// ----------------------------------------------------------------------------
// Daño al jugador
// ----------------------------------------------------------------------------
function damagePlayer(dmg) {
  if (!player.alive) return;
  player.shield -= dmg;
  if (player.shield < 0) { player.hull += player.shield; player.shield = 0; }
  player.shake = Math.min(1, player.shake + 0.5);
  dom.flash.style.opacity = '1';
  setTimeout(() => dom.flash.style.opacity = '0', 80);
  sfx.hit();
  if (player.hull <= 0) {
    player.hull = 0;
    player.alive = false;
    spawnExplosion(player.obj.position.clone().addScaledVector(playerForward(), 10), true);
    gameOver();
  } else if (player.hull < 30) {
    say('¡CASCO CRÍTICO!', 'enemy');
  } else if (player.shield < 20) {
    say('¡ESCUDOS BAJOS!', 'enemy');
  }
}

// ----------------------------------------------------------------------------
// Misiles y bloqueo de objetivo
// ----------------------------------------------------------------------------
function resetLock() {
  game.lock.target = null;
  game.lock.progress = 0;
  game.lock.locked = false;
}

function updateLock(dt) {
  const camFwd = playerForward().clone();
  let best = null, bestAng = CFG.lockAngle;
  for (const e of enemies) {
    const to = e.mesh.position.clone().sub(player.obj.position);
    if (to.length() > 1600) continue;
    const ang = camFwd.angleTo(to.clone().normalize());
    if (ang < bestAng) { bestAng = ang; best = e; }
  }
  if (best) {
    if (game.lock.target === best) {
      if (!game.lock.locked) {
        game.lock.progress += dt / CFG.lockTime;
        game.lock.beepT -= dt;
        if (game.lock.beepT <= 0) { sfx.lockBeep(); game.lock.beepT = 0.18; }
        if (game.lock.progress >= 1) { game.lock.locked = true; sfx.locked(); say('OBJETIVO FIJADO', 'gold'); }
      }
    } else {
      game.lock.target = best;
      game.lock.progress = 0;
      game.lock.locked = false;
      game.lock.beepT = 0;
    }
  } else if (game.lock.target) {
    resetLock();
  }
}

function tryFireMissile() {
  if (game.state !== 'playing' || !player.alive) return;
  if (game.lock.locked && enemies.includes(game.lock.target)) {
    spawnMissile(game.lock.target);
    resetLock();
  } else if (game.lock.target) {
    say('FIJANDO OBJETIVO… MANTÉN LA RETÍCULA', 'gold');
  } else {
    say('SIN OBJETIVO EN LA RETÍCULA');
  }
}

function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    m.life -= dt;
    let dead = m.life <= 0;
    if (!dead && m.target && enemies.includes(m.target)) {
      const to = m.target.mesh.position.clone().sub(m.mesh.position).normalize();
      const cur = m.vel.clone().normalize();
      cur.lerp(to, Math.min(1, 3.2 * dt)).normalize();
      m.vel.copy(cur.multiplyScalar(CFG.missileSpeed));
      m.mesh.lookAt(m.mesh.position.clone().add(cur));
      if (m.mesh.position.distanceTo(m.target.mesh.position) < m.target.radius + 3) {
        damageEnemy(m.target, CFG.missileDamage);
        spawnExplosion(m.mesh.position);
        dead = true;
      }
    } else if (m.target && !enemies.includes(m.target)) {
      m.target = null;    // sigue trayectoria recta
    }
    if (dead) {
      scene.remove(m.mesh);
      missiles.splice(i, 1);
      continue;
    }
    m.mesh.position.addScaledVector(m.vel, dt);
  }
}

function cycleTarget() {
  if (game.state !== 'playing' || enemies.length === 0) return;
  const sorted = [...enemies].sort((a, b) =>
    a.mesh.position.distanceTo(player.obj.position) - b.mesh.position.distanceTo(player.obj.position));
  const idx = sorted.indexOf(game.target);
  game.target = sorted[(idx + 1) % sorted.length];
  sfx.lockBeep();
}

// ----------------------------------------------------------------------------
// Actualización del jugador
// ----------------------------------------------------------------------------
const _q = new THREE.Quaternion();
function rotatePlayer(axis, angle) {
  _q.setFromAxisAngle(axis, angle);
  player.obj.quaternion.multiply(_q);
}
const AX_X = new THREE.Vector3(1, 0, 0), AX_Y = new THREE.Vector3(0, 1, 0), AX_Z = new THREE.Vector3(0, 0, 1);

function updatePlayer(dt) {
  if (!player.alive) return;

  // pilotaje: el ratón actúa como joystick virtual (estilo Wing Commander)
  const dz = 0.04;   // zona muerta
  const mx = Math.abs(input.mx) > dz ? input.mx : 0;
  const my = Math.abs(input.my) > dz ? input.my : 0;
  rotatePlayer(AX_X, -my * CFG.pitchRate * dt);
  rotatePlayer(AX_Y, -mx * CFG.yawRate * dt);
  let roll = 0;
  if (input.keys['KeyA']) roll += 1;
  if (input.keys['KeyD']) roll -= 1;
  rotatePlayer(AX_Z, roll * CFG.rollRate * dt);

  // acelerador
  if (input.keys['KeyW']) player.throttle = Math.min(1, player.throttle + dt * 0.8);
  if (input.keys['KeyS']) player.throttle = Math.max(0, player.throttle - dt * 0.8);
  player.boosting = !!input.keys['ShiftLeft'] || !!input.keys['ShiftRight'];
  const targetSpeed = player.boosting ? CFG.boostSpeed : player.throttle * CFG.maxSpeed;
  player.speed += (targetSpeed - player.speed) * Math.min(1, dt * 2.2);

  const fwd = playerForward().clone();
  player.vel.copy(fwd).multiplyScalar(player.speed);
  player.obj.position.addScaledVector(player.vel, dt);

  // armas
  player.fireTimer -= dt;
  player.heat = Math.max(0, player.heat - CFG.heatCool * dt);
  if (player.overheated && player.heat <= CFG.overheatReset) {
    player.overheated = false;
    say('ARMAS RECUPERADAS', 'good');
  }
  if (input.fire && !player.overheated && player.fireTimer <= 0) {
    player.fireTimer = CFG.fireInterval;
    player.gunSide *= -1;
    const side = new THREE.Vector3(player.gunSide * 1.4, -0.4, 0).applyQuaternion(player.obj.quaternion);
    const origin = player.obj.position.clone().add(side).addScaledVector(fwd, 5);
    spawnBolt(origin, fwd, CFG.boltSpeed, true);
    bolts[bolts.length - 1].vel.add(player.vel);   // hereda velocidad
    player.heat += CFG.heatPerShot;
    sfx.laser();
    if (player.heat >= CFG.overheatAt) {
      player.overheated = true;
      say('¡SOBRECALENTAMIENTO DE ARMAS!', 'enemy');
    }
  }

  // regeneración de escudos
  player.shield = Math.min(CFG.maxShield, player.shield + CFG.shieldRegen * dt);

  // sacudida de cámara
  player.shake = Math.max(0, player.shake - dt * 2);
  const sh = player.shake * 0.35;
  camera.position.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, 0);

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
        if (b.mesh.position.distanceTo(e.mesh.position) < e.radius + 2.5) {
          damageEnemy(e, b.dmg);
          spawnExplosion(b.mesh.position.clone());
          dead = true;
          break;
        }
      }
    } else if (!dead && player.alive) {
      if (b.mesh.position.distanceTo(player.obj.position) < 5) {
        damagePlayer(b.dmg);
        dead = true;
      }
    }

    if (dead) {
      scene.remove(b.mesh);
      bolts.splice(i, 1);
    }
  }
}

function updateExplosions(dt) {
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    ex.life -= dt * (ex.big ? 0.8 : 1.1);
    const arr = ex.pts.geometry.attributes.position.array;
    for (let j = 0; j < arr.length; j += 3) {
      arr[j] += ex.v[j] * dt;
      arr[j + 1] += ex.v[j + 1] * dt;
      arr[j + 2] += ex.v[j + 2] * dt;
    }
    ex.pts.geometry.attributes.position.needsUpdate = true;
    ex.pts.material.opacity = Math.max(0, ex.life);
    ex.flash.material.opacity = Math.max(0, ex.life);
    ex.flash.scale.multiplyScalar(1 + dt * 3);
    if (ex.life <= 0) {
      scene.remove(ex.pts); scene.remove(ex.flash);
      ex.pts.geometry.dispose(); ex.pts.material.dispose();
      explosions.splice(i, 1);
    }
  }
}

function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt;
    p.mesh.rotation.y += dt * 2;
    p.mesh.rotation.x += dt * 0.7;
    let dead = p.life <= 0;
    if (player.alive && p.mesh.position.distanceTo(player.obj.position) < 9) {
      player.shield = Math.min(CFG.maxShield, player.shield + 25);
      game.score += 50;
      say('CÁPSULA DE ENERGÍA · ESCUDOS +25', 'good');
      sfx.pickup();
      dead = true;
    }
    if (dead) {
      scene.remove(p.mesh);
      pickups.splice(i, 1);
    }
  }
}

// ----------------------------------------------------------------------------
// HUD y radar
// ----------------------------------------------------------------------------
function updateHUD() {
  dom.score.textContent = game.score.toLocaleString('es-ES');
  dom.wave.textContent = game.wave > 0 ? `OLEADA ${game.wave}` : 'EN ESPERA';
  dom.kills.textContent = `BAJAS: ${game.kills} · ENEMIGOS: ${enemies.length}`;
  dom.shieldBar.style.width = (player.shield / CFG.maxShield * 100) + '%';
  dom.hullBar.style.width = (player.hull / CFG.maxHull * 100) + '%';
  dom.hullBar.style.background = player.hull < 30 ? 'var(--red)' : '';
  dom.speed.textContent = Math.round(player.speed);
  dom.speed.classList.toggle('boost', player.boosting);
  dom.throttleBar.style.width = (player.throttle * 100) + '%';
  dom.heatBar.style.width = (player.heat / CFG.overheatAt * 100) + '%';
  dom.heatLabel.textContent = player.overheated ? 'ARMAS: SOBRECALENTADAS' : 'ARMAS: LISTAS';
  dom.heatLabel.classList.toggle('hot', player.overheated);

  let sys = 'SISTEMAS NOMINALES', warn = false;
  if (!player.alive) { sys = 'NAVE DESTRUIDA'; warn = true; }
  else if (player.hull < 30) { sys = '¡CASCO CRÍTICO!'; warn = true; }
  else if (player.shield < 25) { sys = 'ESCUDOS BAJOS'; warn = true; }
  else if (player.boosting) { sys = 'POSTCOMBUSTIÓN ACTIVA'; }
  dom.sysLine.textContent = sys;
  dom.sysLine.classList.toggle('warn', warn);

  // panel de objetivo
  const t = game.target && enemies.includes(game.target) ? game.target : null;
  if (t) {
    dom.tName.textContent = t.name;
    dom.tDist.textContent = `DIST: ${Math.round(t.mesh.position.distanceTo(player.obj.position))} m`;
    dom.tHull.style.width = Math.max(0, t.hp / t.maxHp * 100) + '%';
  } else {
    dom.tName.textContent = 'SIN OBJETIVO (T)';
    dom.tDist.textContent = '--';
    dom.tHull.style.width = '0%';
  }

  // indicador de bloqueo
  const lt = game.lock.target;
  if (lt && enemies.includes(lt)) {
    const v = lt.mesh.position.clone().project(camera);
    if (v.z < 1) {
      const x = (v.x * 0.5 + 0.5) * innerWidth;
      const y = (-v.y * 0.5 + 0.5) * innerHeight;
      dom.lockbox.style.display = 'block';
      dom.lockbox.style.left = x + 'px';
      dom.lockbox.style.top = y + 'px';
      dom.lockbox.classList.toggle('locked', game.lock.locked);
      dom.lockLabel.style.display = 'block';
      dom.lockLabel.style.left = x + 'px';
      dom.lockLabel.style.top = (y + 42) + 'px';
      dom.lockLabel.textContent = game.lock.locked ? 'FIJADO — MISIL LISTO' : `FIJANDO ${Math.round(game.lock.progress * 100)}%`;
    } else {
      dom.lockbox.style.display = 'none';
      dom.lockLabel.style.display = 'none';
    }
  } else {
    dom.lockbox.style.display = 'none';
    dom.lockLabel.style.display = 'none';
  }
}

function drawRadar() {
  const g = dom.radar, S = 150, C = S / 2;
  g.clearRect(0, 0, S, S);
  // fondo
  g.fillStyle = 'rgba(3,20,28,.85)';
  g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(53,240,255,.4)';
  g.lineWidth = 1;
  g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(C, C, (C - 2) / 2, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(C, 4); g.lineTo(C, S - 4); g.moveTo(4, C); g.lineTo(S - 4, C);
  g.globalAlpha = 0.25; g.stroke(); g.globalAlpha = 1;

  const inv = player.obj.quaternion.clone().invert();
  const rel = new THREE.Vector3();
  const plot = (pos, color, size, ring = false) => {
    rel.copy(pos).sub(player.obj.position).applyQuaternion(inv);
    const x = C + (rel.x / CFG.radarRange) * C;
    const y = C + (rel.z / CFG.radarRange) * C;   // -Z (frente) arriba
    if (x < 4 || x > S - 4 || y < 4 || y > S - 4) return;
    g.fillStyle = color;
    g.beginPath(); g.arc(x, y, size, 0, Math.PI * 2); g.fill();
    if (ring) { g.strokeStyle = color; g.beginPath(); g.arc(x, y, size + 3, 0, Math.PI * 2); g.stroke(); }
  };

  for (const p of pickups) plot(p.mesh.position, '#4dff88', 2);
  for (const e of enemies) plot(e.mesh.position, e === game.target ? '#ff9a3c' : '#ff3b4e', e.ace ? 3.4 : 2.4, e === game.target);
  for (const m of missiles) plot(m.mesh.position, '#ffc46b', 1.6);

  // jugador (centro, apuntando arriba)
  g.fillStyle = '#35f0ff';
  g.beginPath();
  g.moveTo(C, C - 6); g.lineTo(C - 4, C + 4); g.lineTo(C + 4, C + 4);
  g.closePath(); g.fill();
}

// ----------------------------------------------------------------------------
// Estados del juego
// ----------------------------------------------------------------------------
function clearEntities() {
  for (const arr of [enemies, missiles, pickups]) {
    for (const e of arr) scene.remove(e.mesh);
    arr.length = 0;
  }
  for (const b of bolts) { scene.remove(b.mesh); }
  bolts.length = 0;
  for (const ex of explosions) { scene.remove(ex.pts); scene.remove(ex.flash); }
  explosions.length = 0;
}

function startGame() {
  sfx.init();
  clearEntities();
  player.obj.position.set(0, 0, 0);
  player.obj.quaternion.identity();
  player.speed = 0; player.throttle = 0.6;
  player.shield = CFG.maxShield; player.hull = CFG.maxHull;
  player.heat = 0; player.overheated = false; player.alive = true; player.shake = 0;
  game.state = 'playing';
  game.wave = 0; game.score = 0; game.kills = 0;
  game.target = null; resetLock();
  dom.mainMenu.style.display = 'none';
  dom.gameoverMenu.style.display = 'none';
  dom.pauseMenu.style.display = 'none';
  dom.hud.style.display = 'block';
  say('CONTROL DE MISIÓN: Cazas enemigos en tu sector. ¡Buena caza, Comandante!', 'good');
  startWave(1);
}

function gameOver() {
  game.state = 'over';
  dom.finalStats.innerHTML =
    `PUNTUACIÓN FINAL: <b>${game.score.toLocaleString('es-ES')}</b><br>` +
    `OLEADA ALCANZADA: <b>${game.wave}</b> · BAJAS: <b>${game.kills}</b>`;
  setTimeout(() => {
    dom.gameoverMenu.style.display = 'flex';
    dom.hud.style.display = 'none';
  }, 1600);
}

function togglePause() {
  if (game.state === 'playing') {
    game.state = 'paused';
    dom.pauseMenu.style.display = 'flex';
  } else if (game.state === 'paused') {
    game.state = 'playing';
    dom.pauseMenu.style.display = 'none';
  }
}

$('start-btn').addEventListener('click', startGame);
$('retry-btn').addEventListener('click', startGame);
$('resume-btn').addEventListener('click', togglePause);

// ----------------------------------------------------------------------------
// Bucle principal
// ----------------------------------------------------------------------------
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (game.state === 'playing') {
    updatePlayer(dt);
    for (let i = enemies.length - 1; i >= 0; i--) updateEnemy(enemies[i], dt);
    updateBolts(dt);
    updateMissiles(dt);
    updateExplosions(dt);
    updatePickups(dt);
    updateLock(dt);

    if (game.betweenWaves) {
      game.waveT -= dt;
      if (game.waveT <= 0) startWave(game.wave + 1);
    }

    // entorno infinito: wrap alrededor del jugador
    wrapPoints(stars, CFG.starCube);
    for (const n of nebulas) wrapSprite(n, 16000);
    wrapSprite(planet, 22000);
    planetGlow.position.copy(planet.position);
    planet.rotation.y += dt * 0.01;

    sfx.engine(player.speed / CFG.boostSpeed, player.boosting, player.alive);
    updateHUD();
    drawRadar();
  } else {
    sfx.engine(0, false, false);
    if (game.state === 'over') updateExplosions(dt);   // animar la explosión final
  }

  composer.render();
}
animate();
