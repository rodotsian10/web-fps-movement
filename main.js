// ============================================================
// main.js  –  HyperShot Movement Sandbox
// ============================================================
import { addGameListener } from './reload.js';
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { PhysicsWorld, AABB } from './physics.js';
import { FPSCamera }          from './camera.js';
import { MovementController, CONSTANTS } from './movement.js';
import { Player }             from './player.js';

const myLoopId = "loop_" + Math.random().toString(36).substring(2, 6);
if (!window.activeLoops) window.activeLoops = new Set();
// Clean up any existing listeners and loops from previous module instances
if (window.gameListeners) {
  window.gameListeners.forEach(l => {
    l.target.removeEventListener(l.type, l.listener);
  });
}
window.gameListeners = [];

if (window.gameLoopId) {
  cancelAnimationFrame(window.gameLoopId);
  window.gameLoopId = null;
}


// ── Renderer ─────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('canvas'),
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2538);
scene.fog = new THREE.FogExp2(0x1a2538, 0.008);

addGameListener(window, 'resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Lighting ─────────────────────────────────────────────────
scene.add(new THREE.AmbientLight(0x3a4565, 3.5));

const sun = new THREE.DirectionalLight(0xffffff, 4.0);
sun.position.set(30, 80, 20);
sun.castShadow = true;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far  = 250;
sun.shadow.camera.left = sun.shadow.camera.bottom = -80;
sun.shadow.camera.right = sun.shadow.camera.top = 80;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.002;
scene.add(sun);

// Accent lights
[
  [0x00f0ff, 8,  0, 6, 0],
  [0x7c3aed, 5, 30, 5, -20],
  [0xff6b35, 4,-30, 5, -30],
  [0x00f0ff, 5,  0, 5, -60],
  [0x22c55e, 3, 50, 8, -25],
].forEach(([c, i, x, y, z]) => {
  const l = new THREE.PointLight(c, i, 60);
  l.position.set(x, y, z);
  scene.add(l);
});

// ── Materials ────────────────────────────────────────────────
const M = (c, e = 0, ei = 0, r = 0.5, m = 0.3) =>
  new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: ei, roughness: r, metalness: m });

const matFloor    = M(0x182438, 0x0a0f1e, 0.1, 0.85, 0.1);
const matBox      = M(0x283855, 0x001022, 0.15, 0.65, 0.4);
const matCyan     = M(0x004560, 0x00f0ff, 0.4,  0.5,  0.6);
const matPurple   = M(0x2a1a55, 0x7c3aed, 0.45, 0.5,  0.5);
const matOrange   = M(0x4a2200, 0xff6b35, 0.4,  0.5,  0.4);
const matGreen    = M(0x1a451a, 0x22c55e, 0.6,  0.4,  0.5);
const matWall     = M(0x202c45, 0x001833, 0.2, 0.6,  0.5);
const matWallGlow = M(0x003350, 0x00f0ff, 0.5,  0.4,  0.7);
const matPad      = M(0x001414, 0x00f0ff, 0.6,  0.3,  0.8);

// Grid
const grid = new THREE.GridHelper(300, 120, 0x0a1428, 0x0a1428);
grid.position.y = 0.01;
scene.add(grid);

// ── Physics ──────────────────────────────────────────────────
const phys = new PhysicsWorld();

function addBox(x, y, z, w, h, d, mat, castShadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
  phys.addCollider(new AABB(x, y, z, w/2, h/2, d/2));
  return mesh;
}

// ── 7-ZONE TRAINING GROUND sandbox ──────────────────────────

// ── Weapons & Targets State ──────────────────────────────────
const targets = [];
const tracers = [];
const floatingTexts = [];

class Target {
  constructor(x, y, z, r = 0.8) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.r = r;
    
    this.active = true;
    this.respawnTimer = 0;
    
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    
    // Fixed pole height of 2.0m
    const poleHeight = 2.0;
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, poleHeight, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.2 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = -poleHeight / 2;
    pole.castShadow = true;
    pole.receiveShadow = true;
    this.group.add(pole);
    
    // Target board (bullseye)
    const boardGroup = new THREE.Group();
    boardGroup.position.y = 0;
    
    // Outer disc
    const outerGeo = new THREE.CylinderGeometry(r, r, 0.12, 16);
    outerGeo.rotateX(Math.PI / 2);
    const outerMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.2, roughness: 0.4 });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    outer.castShadow = true;
    boardGroup.add(outer);
    
    // Inner bullseye
    const innerGeo = new THREE.CylinderGeometry(r * 0.4, r * 0.4, 0.15, 16);
    innerGeo.rotateX(Math.PI / 2);
    const innerMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.8, roughness: 0.2 });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.castShadow = true;
    boardGroup.add(inner);
    
    this.board = boardGroup;
    this.group.add(boardGroup);
    
    scene.add(this.group);
    
    // Physics collider
    this.aabb = new AABB(x, y, z, r, r, 0.15);
    phys.addCollider(this.aabb);
    
    targets.push(this);
  }
  
  destroy() {
    this.active = false;
    this.respawnTimer = 5.0;
    phys.removeCollider(this.aabb);
  }
  
  respawn() {
    this.active = true;
    this.respawnTimer = 0;
    phys.addCollider(this.aabb);
    this.board.scale.set(1, 1, 1);
  }
  
  update(dt) {
    if (!this.active) {
      if (this.board.scale.x > 0.01) {
        const s = Math.max(0, this.board.scale.x - dt * 8.0);
        this.board.scale.set(s, s, s);
      }
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawn();
      }
    } else {
      if (this.board.scale.x < 1.0) {
        const s = Math.min(1.0, this.board.scale.x + dt * 5.0);
        this.board.scale.set(s, s, s);
      }
      // Gentle bobbing/spinning
      this.board.rotation.y = Math.sin(performance.now() * 0.003) * 0.15;
    }
  }
}

function spawnTracer(start, end, type = 'RIFLE') {
  if (typeof window.shotSpawnCount !== 'undefined') {
    window.shotSpawnCount++;
    if (!window.shotLoopIds) window.shotLoopIds = new Set();
    window.shotLoopIds.add(myLoopId);
  }
  const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
  
  let color = 0x00f0ff;
  let opacity = 0.8;
  let maxLife = 0.15;

  if (type === 'SNIPER') {
    color = 0xff6b35;
    opacity = 0.95;
    maxLife = 0.25;
  } else if (type === 'SHOTGUN') {
    color = 0xfacc15;
    opacity = 0.85;
    maxLife = 0.12;
  }

  const mat = new THREE.LineBasicMaterial({
    color: color,
    transparent: true,
    opacity: opacity,
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracers.push({
    line,
    maxLife: maxLife,
    life: maxLife
  });
}

function spawnHitIndicator(point) {
  const el = document.createElement('div');
  el.className = 'hit-indicator';
  el.textContent = 'HIT!';
  el.style.position = 'fixed';
  el.style.pointerEvents = 'none';
  el.style.color = '#ff3333';
  el.style.fontWeight = '900';
  el.style.fontFamily = "'Inter', sans-serif";
  el.style.fontSize = '14px';
  el.style.textShadow = '0 0 4px rgba(0,0,0,0.8), 0 0 10px rgba(255,51,51,0.6)';
  el.style.zIndex = '90';
  el.style.transform = 'translate(-50%, -50%)';
  document.body.appendChild(el);

  floatingTexts.push({
    el,
    pos3d: new THREE.Vector3(point.x, point.y + 0.5, point.z),
    life: 0.6,
    maxLife: 0.6
  });
}

// ── Level Geometry ───────────────────────────────────────────

// 0. Massive Main Floor
addBox(0, -0.5, 0, 260, 1, 260, matFloor, false);

// 1. Spawn Hub (Center)
addBox(0, 0.1, 0, 24, 0.2, 24, matBox);
addBox(6, 1.5, -6, 3, 3, 3, matCyan);
addBox(-6, 1.5, -6, 3, 3, 3, matCyan);
addBox(0, 2.0, -10, 8, 4, 2, matPurple);

// 2. Open Aim Training Area (East: X = 70, Z = 0)
addBox(70, 0.05, 0, 60, 0.1, 60, matFloor, false);
addBox(45, 1, 0, 2, 2, 40, matBox); // shooting line wall
new Target(65, 2.0, -15);
new Target(75, 2.5, -8);
new Target(85, 3.0, 0);
new Target(75, 3.5, 8);
new Target(65, 4.0, 15);
new Target(90, 5.0, -12);
new Target(95, 6.0, 10);
new Target(95, 6.0, 5);
new Target(95, 6.0, 6);
new Target(95, 6.0, 7);
new Target(95, 6.0, 8);
new Target(95, 6.0, 9);
new Target(95, 6.0, 11);
new Target(95, 6.0, 12);
new Target(95, 6.0, 13);
new Target(95, 6.0, 14);
new Target(95, 6.0, 15);

// 3. Movement Playground (North: X = 0, Z = -70)
addBox(0, 0.05, -70, 60, 0.1, 60, matFloor, false);
addBox(-15, 2, -65, 6, 4, 6, matBox);
addBox(-15, 4.5, -65, 6, 1, 6, matCyan);
addBox(15, 1.5, -60, 8, 3, 8, matBox);
addBox(15, 3, -68, 8, 6, 8, matBox);
addBox(0, 2, -80, 16, 4, 4, matBox);
addBox(0, 4.5, -80, 8, 1, 4, matCyan);
new Target(0, 7.0, -80);
new Target(15, 8.0, -68);

// 4. Slide Lanes (West: X = -70, Z = 0)
addBox(-70, 0.05, 0, 60, 0.1, 60, matFloor, false);
addBox(-90, 4, -15, 12, 8, 12, matBox); // high deck
addBox(-72, 2.5, -15, 15, 5, 12, matBox); // mid deck
addBox(-50, 1.0, -15, 18, 2, 12, matBox); // low deck

addBox(-70, 0.5, 18, 8, 1, 40, matOrange); // runway
addBox(-70, 2.25, 18, 8, 0.5, 2, matBox); // slide under bar

// 5. Jump Platforms (South: X = 0, Z = 70)
addBox(0, 0.05, 70, 60, 0.1, 60, matFloor, false);
addBox(0, 1, 48, 4, 2, 4, matPurple);
addBox(-8, 2.5, 58, 4, 5, 4, matPurple);
addBox(8, 4.5, 68, 4, 9, 4, matPurple);
addBox(0, 6.5, 78, 4, 13, 4, matPurple);
addBox(-8, 9.0, 88, 4, 18, 4, matPurple);
addBox(8, 11.5, 98, 4, 23, 4, matPurple);
new Target(8, 25.0, 98);

// 6. Vertical Towers (Northwest: X = -55, Z = -55)
addBox(-55, 0.05, -55, 50, 0.1, 50, matFloor, false);
addBox(-65, 15, -65, 6, 30, 6, matWall);
addBox(-45, 25, -45, 6, 50, 6, matWall);

const nodeGeo = new THREE.SphereGeometry(0.8, 16, 12);
const makeNode = (x, y, z) => {
  const mesh = new THREE.Mesh(nodeGeo, M(0, 0x00f0ff, 2.5, 0.2, 0.8));
  mesh.position.set(x, y, z);
  scene.add(mesh);
  phys.addCollider(new AABB(x, y, z, 0.8, 0.8, 0.8));
};
makeNode(-65, 31.0, -65);
makeNode(-45, 51.0, -45);

// 7. Grapple Rings / Floating Structures (Northeast: X = 55, Z = -55)
addBox(55, 0.05, -55, 50, 0.1, 50, matFloor, false);
addBox(42, 10, -42, 8, 1, 8, matCyan);
addBox(68, 16, -68, 8, 1, 8, matCyan);
makeNode(55, 13.0, -55);
makeNode(68, 22.0, -45);
new Target(42, 12.5, -42);

// 8. Dash Corridor (Southwest: X = -55, Z = 55)
addBox(-55, 0.05, 55, 50, 0.1, 50, matFloor, false);
addBox(-65, 2.5, 40, 20, 5, 2, matWall);
addBox(-45, 2.5, 50, 2, 5, 20, matWall);
addBox(-60, 2.5, 65, 20, 5, 2, matWall);
addBox(-35, 2.5, 65, 2, 5, 20, matWall);

// Sky dome
const skyGeo = new THREE.SphereGeometry(500, 32, 16);
scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ color: 0x020408, side: THREE.BackSide })));

// ── Systems ──────────────────────────────────────────────────
const C = { ...CONSTANTS };
const fpsCam  = new FPSCamera();
const movCtrl = new MovementController(C);
const player  = new Player(phys, fpsCam, movCtrl, scene);
window.movCtrl = movCtrl;
window.player = player;
scene.add(fpsCam.pivot);

// ── HUD Elements ─────────────────────────────────────────────
const hudSpeed        = document.getElementById('speed-number');
const hudBar          = document.getElementById('speed-bar');
const hudDash         = document.getElementById('dash-icon');
const hudGrapple      = document.getElementById('grapple-icon');
const hudCombo        = document.getElementById('combo-text');
const notifCont       = document.getElementById('notifications');
const pillSprint      = document.getElementById('pill-sprint');
const pillSlide       = document.getElementById('pill-slide');
const pillAir         = document.getElementById('pill-air');
const pillDash        = document.getElementById('pill-dash');
const pillGrapple     = document.getElementById('pill-grapple');
const pillSlideCancel = document.getElementById('pill-slidecancel');
const grappleReticle  = document.getElementById('grapple-reticle');

const hudAmmoDisplay  = document.getElementById('ammo-display');
const hudAmmoClip     = document.getElementById('ammo-clip');
const hudAmmoReserve  = document.getElementById('ammo-reserve');

function setActive(el, on) { if (el) el.classList.toggle('active', on); }

let comboHideTimer = 0;
let lastNotifTime  = 0;

function showNotif(text, cls = '') {
  const now = performance.now();
  if (now - lastNotifTime < 200) return;  // debounce
  lastNotifTime = now;
  if (!notifCont) return;
  const div = document.createElement('div');
  div.className = `notif ${cls}`;
  div.textContent = text;
  notifCont.appendChild(div);
  setTimeout(() => div.remove(), 1800);
}

function updateHUD(result, hs, finalPhys) {
  const maxExp = C.SPRINT_SPEED * 3.5;
  if (hudSpeed) {
    hudSpeed.textContent = hs.toFixed(1);
    if (hs > C.SPRINT_SPEED * 2)       hudSpeed.style.color = '#ffffff';
    else if (hs > C.SPRINT_SPEED * 1.2) hudSpeed.style.color = '#ff6b35';
    else                                 hudSpeed.style.color = '#00f0ff';
  }
  if (hudBar) {
    hudBar.style.width = `${Math.min(hs / maxExp * 100, 100)}%`;
    hudBar.style.background = hs > C.SPRINT_SPEED * 1.5
      ? 'linear-gradient(90deg, #ff6b35, #ff0055)'
      : 'linear-gradient(90deg, #00f0ff, #7c3aed)';
  }

  // Dash icon cooldown bar
  if (hudDash) {
    hudDash.classList.toggle('ready', result.dashReady);
    const bar = hudDash.querySelector('.cd-bar');
    if (bar) bar.style.transform = `scaleY(${result.dashReady ? 0 :
      Math.max(0, (C.DASH_COOLDOWN - movCtrl.dashCooldown) / C.DASH_COOLDOWN)})`;
  }

  // Grapple icon cooldown bar
  if (hudGrapple) {
    hudGrapple.classList.toggle('ready', result.grappleReady);
    const bar = hudGrapple.querySelector('.cd-bar');
    if (bar) bar.style.transform = `scaleY(${result.grappleReady ? 0 :
      Math.max(0, (C.GRAPPLE_COOLDOWN - movCtrl.grappleCooldown) / C.GRAPPLE_COOLDOWN)})`;
  }

  // Grapple reticle
  if (grappleReticle) {
    grappleReticle.classList.toggle('has-target', !!currentGrappleRay?.hit);
    grappleReticle.classList.toggle('active', result.grappleActive);
  }

  // State pills
  setActive(pillSprint,  result.state === 'SPRINT');
  setActive(pillSlide,   result.state === 'SLIDE');
  setActive(pillAir,     result.state === 'AIR');
  setActive(pillDash,    result.state === 'DASH');
  setActive(pillGrapple, result.grappleActive);

  // Temp pills
  if (result.didSlideCancel)  { setActive(pillSlideCancel, true); setTimeout(() => setActive(pillSlideCancel, false), 1000); }

  // Ammo display
  if (finalPhys.type === 'KARAMBIT') {
    if (hudAmmoClip) hudAmmoClip.textContent = '∞';
    if (hudAmmoReserve) hudAmmoReserve.textContent = '∞';
  } else if (finalPhys.type === 'PISTOLS') {
    if (hudAmmoClip) hudAmmoClip.textContent = finalPhys.ammo;
    if (hudAmmoReserve) hudAmmoReserve.textContent = '∞';
  } else {
    if (hudAmmoClip) hudAmmoClip.textContent = finalPhys.ammo;
    if (hudAmmoReserve) hudAmmoReserve.textContent = finalPhys.ammoReserve;
  }
  if (hudAmmoDisplay) {
    hudAmmoDisplay.classList.toggle('reloading', finalPhys.isReloading);
  }

  // Weapon label
  const hudWeaponLabel = document.getElementById('weapon-label');
  if (hudWeaponLabel) {
    let name = 'ASSAULT RIFLE';
    let color = 'rgba(255, 255, 255, 0.4)';
    if (finalPhys.type === 'SNIPER') {
      name = 'SNIPER RIFLE';
      color = '#ff6b35';
    } else if (finalPhys.type === 'PISTOLS') {
      name = 'DUAL PISTOLS';
      color = '#22c55e';
    } else if (finalPhys.type === 'SHOTGUN') {
      name = 'SHOTGUN';
      color = '#facc15';
    } else if (finalPhys.type === 'KARAMBIT') {
      name = 'KARAMBIT KNIFE';
      color = '#7c3aed';
    } else if (finalPhys.type === 'FISTS') {
      name = 'ROBLOX FISTS';
      color = '#ff0055';
    }
    hudWeaponLabel.textContent = name;
    hudWeaponLabel.style.color = color;
  }

  // Sniper Scope Overlay
  const scopeOverlay = document.getElementById('sniper-scope-overlay');
  if (scopeOverlay) {
    const isSniperAiming = finalPhys.type === 'SNIPER' && finalPhys.isAiming;
    scopeOverlay.classList.toggle('active', isSniperAiming);
  }

  // Combo
  if (result.comboName) {
    if (hudCombo) { hudCombo.textContent = result.comboName; hudCombo.classList.add('visible'); }
    comboHideTimer = 2.5;
  }
}

// ── Pointer Lock & Weapon Menu ───────────────────────────────
const lockScreen = document.getElementById('lock-screen');
const weaponMenu = document.getElementById('weapon-menu');
let weaponMenuOpen = false;

function toggleWeaponMenu(open) {
  if (open === undefined) open = !weaponMenuOpen;
  weaponMenuOpen = open;
  
  if (weaponMenuOpen) {
    if (settingsOpen) {
      settingsOpen = false;
      settingsPanel.classList.remove('visible');
    }
    weaponMenu.classList.remove('hidden');
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    lockScreen.classList.add('hidden');
    
    // Highlight the active card and equipped Primary & Secondary
    const cards = weaponMenu.querySelectorAll('.weapon-card');
    const activeType = player.weapon.type;
    const equippedPrimary = player.equippedPrimary;
    const equippedSecondary = player.equippedSecondary;
    const equippedMelee = player.equippedMelee;
    cards.forEach(card => {
      const type = card.getAttribute('data-weapon');
      card.classList.toggle('active', type === activeType);
      if (type === 'RIFLE' || type === 'SNIPER') {
        card.classList.toggle('equipped', type === equippedPrimary);
      } else if (type === 'PISTOLS' || type === 'SHOTGUN') {
        card.classList.toggle('equipped', type === equippedSecondary);
      } else if (type === 'KARAMBIT' || type === 'FISTS') {
        card.classList.toggle('equipped', type === equippedMelee);
      }
    });
  } else {
    weaponMenu.classList.add('hidden');
    if (!document.pointerLockElement && !settingsOpen) {
      renderer.domElement.requestPointerLock();
    }
  }
}

// Bind card clicks
weaponMenu.querySelectorAll('.weapon-card').forEach(card => {
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    const type = card.getAttribute('data-weapon');
    player.switchWeapon(type);
    if (type === 'RIFLE') {
      showNotif(`Slot 1: ASSAULT RIFLE 장착`, 'purple');
    } else if (type === 'SNIPER') {
      showNotif(`Slot 1: SNIPER RIFLE 장착`, 'orange');
    } else if (type === 'PISTOLS') {
      showNotif(`Slot 2: DUAL PISTOLS 장착`, 'green');
    } else if (type === 'SHOTGUN') {
      showNotif(`Slot 2: SHOTGUN 장착`, 'yellow');
    } else if (type === 'KARAMBIT') {
      showNotif(`Slot 3: KARAMBIT KNIFE 장착`, 'orange');
    } else if (type === 'FISTS') {
      showNotif(`Slot 3: ROBLOX FISTS 장착`, 'red');
    }
    toggleWeaponMenu(false);
  });
});

addGameListener(document.getElementById('lock-btn'), 'click', () => {
  renderer.domElement.requestPointerLock();
});

addGameListener(document, 'pointerlockchange', () => {
  if (!document.pointerLockElement) {
    player.stopFiring();
    player.stopAiming();
  }
  if (!settingsOpen && !weaponMenuOpen) {
    lockScreen.classList.toggle('hidden', !!document.pointerLockElement);
  }
});

addGameListener(document, 'click', (e) => {
  if (settingsOpen || e.target.closest('#settings') || weaponMenuOpen || e.target.closest('#weapon-menu')) return;
  if (!document.pointerLockElement) renderer.domElement.requestPointerLock();
});

// ── Weapon Firing & Aiming Inputs ────────────────────────────
addGameListener(document, 'mousedown', (e) => {
  if (!document.pointerLockElement || settingsOpen || weaponMenuOpen) return;
  if (e.button === 0) {
    if (window.clickTimeout) clearTimeout(window.clickTimeout);
    window.shotSpawnCount = 0;
    window.shotLoopIds = new Set();
    window.clickTimeout = setTimeout(() => {
      console.log(`[결과] 활성화된 게임 루프 개수: ${window.activeLoops.size}`);
      console.log(`[결과] 활성화된 루프 IDs: ${Array.from(window.activeLoops).join(", ")}`);
      console.log(`[결과] 이번 클릭에 spawnTracer()를 호출한 루프 IDs: ${Array.from(window.shotLoopIds).join(", ")}`);
      console.log(`[결과] 이번 클릭에 spawnTracer() 호출 횟수: ${window.shotSpawnCount}`);
      if (typeof window.sendLogToServer === 'function') {
        window.sendLogToServer("RESULT", {
          activeLoops: window.activeLoops.size,
          activeLoopIds: Array.from(window.activeLoops),
          shotLoopIds: Array.from(window.shotLoopIds),
          shotSpawnCount: window.shotSpawnCount
        });
      }
    }, 200);
    player.startFiring();
  } else if (e.button === 2) {
    player.startAiming();
  }
});

// window-level mouseup listener ensures we never miss releases
addGameListener(window, 'mouseup', (e) => {
  if (e.button === 0) {
    player.stopFiring();
  } else if (e.button === 2) {
    player.stopAiming();
  }
});

// Self-correcting safety guard on mousemove
addGameListener(document, 'mousemove', (e) => {
  if (document.pointerLockElement && !settingsOpen && !weaponMenuOpen) {
    // e.buttons is a bitmask: 1 = Left Click, 2 = Right Click
    if (player.isFiring && (e.buttons & 1) === 0) {
      player.stopFiring();
    }
    if (player.isAiming && (e.buttons & 2) === 0) {
      player.stopAiming();
    }
  }
});

// Stop firing/aiming on focus loss
addGameListener(window, 'blur', () => {
  player.stopFiring();
  player.stopAiming();
});

addGameListener(document, 'contextmenu', (e) => {
  if (document.pointerLockElement && !settingsOpen) {
    e.preventDefault();
  }
});

// ── Settings ─────────────────────────────────────────────────
const settingsPanel = document.getElementById('settings');
let settingsOpen = false;

addGameListener(document, 'keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    settingsOpen = !settingsOpen;
    settingsPanel.classList.toggle('visible', settingsOpen);
    
    if (settingsOpen) {
      if (weaponMenuOpen) {
        weaponMenuOpen = false;
        weaponMenu.classList.add('hidden');
      }
      if (document.pointerLockElement) document.exitPointerLock();
      lockScreen.classList.add('hidden');
    } else {
      if (!document.pointerLockElement) renderer.domElement.requestPointerLock();
    }
  }
  if (e.code === 'KeyG') {
    if (document.pointerLockElement || weaponMenuOpen) {
      e.preventDefault();
      toggleWeaponMenu();
    }
  }
  if (document.pointerLockElement) {
    if (e.code === 'KeyR') {
      player.reload();
    }
    if (e.code === 'KeyT') {
      player.reset();
      showNotif('🔄 RESET', 'orange');
    }
    if (e.code === 'Digit1') {
      player.selectSlot(1);
      const name = player.equippedPrimary === 'RIFLE' ? 'ASSAULT RIFLE' : 'SNIPER RIFLE';
      const color = player.equippedPrimary === 'RIFLE' ? 'purple' : 'orange';
      showNotif(`Slot 1: ${name} 장착`, color);
    }
    if (e.code === 'Digit2') {
      player.selectSlot(2);
      const name = player.equippedSecondary === 'PISTOLS' ? 'DUAL PISTOLS' : 'SHOTGUN';
      const color = player.equippedSecondary === 'PISTOLS' ? 'green' : 'yellow';
      showNotif(`Slot 2: ${name} 장착`, color);
    }
    if (e.code === 'Digit3') {
      player.selectSlot(3);
      const name = player.equippedMelee === 'KARAMBIT' ? 'KARAMBIT KNIFE' : 'ROBLOX FISTS';
      const color = player.equippedMelee === 'KARAMBIT' ? 'orange' : 'red';
      showNotif(`Slot 3: ${name} 장착`, color);
    }
  }
});

const settingsDefs = [
  { group: '🏃 이동', items: [
    { key: 'WALK_SPEED',      label: '걷기 속도',    min:3,  max:20,  step:0.5 },
    { key: 'SPRINT_SPEED',    label: '달리기 속도',  min:5,  max:40,  step:0.5 },
    { key: 'ACCEL_GROUND',    label: '걷기 가속도',  min:10, max:150, step:2 },
    { key: 'ACCEL_SPRINT',    label: '달리기 가속도',min:5,  max:80,  step:1 },
  ]},
  { group: '✈ 공중', items: [
    { key: 'ACCEL_AIR',       label: '공중 가속',   min:1,  max:40,  step:0.5 },
  ]},
  { group: '⬆ 점프', items: [
    { key: 'GRAVITY',         label: '중력',       min:10, max:100, step:1 },
    { key: 'JUMP_FORCE',      label: '점프력',     min:5,  max:35,  step:0.25 },
  ]},
  { group: '🎿 슬라이드', items: [
    { key: 'SLIDE_ENTRY_BOOST',label: '진입 부스트',min:1,  max:3,   step:0.05 },
    { key: 'SLIDE_FRICTION',   label: '마찰',      min:0.1,max:5,   step:0.05 },
    { key: 'SLIDE_CANCEL_VERT', label:'캔슬 수직',  min:1,  max:4,   step:0.05 },
    { key: 'SLIDE_MAX_SPEED',   label: '최고속력',  min:10, max:60,  step:0.5 },
  ]},

  { group: '🪝 그래플', items: [
    { key: 'GRAPPLE_SPEED',   label: '속도',       min:20, max:120, step:1 },
    { key: 'GRAPPLE_MAX_DIST',label: '최대거리',   min:30, max:250, step:5 },
    { key: 'GRAPPLE_COOLDOWN',label: '쿨타임',     min:0.5,max:10,  step:0.1 },
    { key: 'GRAPPLE_MAX_HOLD_TIME', label: '최대유지시간', min:0.1, max:3.0, step:0.05 },
    { key: 'GRAPPLE_TIME_LIMIT_ENABLED', label: '시간제한 사용', type: 'checkbox' },
  ]},

  { group: '💨 대쉬', items: [
    { key: 'DASH_SPEED',      label: '속도',       min:10, max:60,  step:1 },
    { key: 'DASH_COOLDOWN',   label: '쿨타임',     min:0.5,max:10,  step:0.1 },
  ]},

  { group: '📷 카메라', items: [
    { key: 'BASE_FOV',        label: '기본 FOV',   min:60, max:110, step:1 },
    { key: 'FOV_MAX_BOOST',   label: 'FOV 부스트', min:0,  max:50,  step:1 },
  ]},
];

const content = document.getElementById('settings-content');
if (content) content.innerHTML = '';
settingsDefs.forEach(group => {
  const g = document.createElement('div');
  g.className = 'settings-group';
  g.innerHTML = `<h3>${group.group}</h3>`;
  group.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'setting-row';
    const label = document.createElement('label');
    label.textContent = item.label;
    row.appendChild(label);

    if (item.type === 'checkbox') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!C[item.key];
      input.addEventListener('change', () => {
        C[item.key] = input.checked;
        movCtrl.C[item.key] = C[item.key];
      });
      row.appendChild(input);
    } else {
      const val = document.createElement('span');
      val.className = 'setting-val';
      val.textContent = C[item.key];
      const input = document.createElement('input');
      input.type = 'range'; input.min = item.min; input.max = item.max;
      input.step = item.step; input.value = C[item.key];
      input.addEventListener('input', () => {
        C[item.key] = parseFloat(input.value);
        movCtrl.C[item.key] = C[item.key];
        val.textContent = C[item.key];
      });
      row.appendChild(input);
      row.appendChild(val);
    }
    g.appendChild(row);
  });
  content.appendChild(g);
});

// ── Grapple Raycast ──────────────────────────────────────────
let currentGrappleRay = null;

function updateGrappleRaycast() {
  const lookDir = fpsCam.getLookDir();
  const pivot = fpsCam.pivot.position;
  currentGrappleRay = phys.raycast(
    pivot.x, pivot.y, pivot.z,
    lookDir.x, lookDir.y, lookDir.z,
    C.GRAPPLE_MAX_DIST
  );
}

// ── Game Loop ────────────────────────────────────────────────
let lastTime = performance.now();
let lastSpeedOffset = 0;

function loop(now) {
  window.activeLoops.add(myLoopId);
  window.gameLoopId = requestAnimationFrame(loop);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (!document.pointerLockElement && !settingsOpen) {
    renderer.render(scene, fpsCam.camera);
    return;
  }

  // Grapple raycast (every frame for reticle feedback)
  updateGrappleRaycast();

  // Movement (Karambit Speed Boost: add +2.0 to base speeds WALK_SPEED and SPRINT_SPEED)
  movCtrl.C.WALK_SPEED -= lastSpeedOffset;
  movCtrl.C.SPRINT_SPEED -= lastSpeedOffset;

  const speedOffset = (player.weapon.type === 'KARAMBIT' || player.weapon.type === 'FISTS') ? 2.0 : 0.0;
  movCtrl.C.WALK_SPEED += speedOffset;
  movCtrl.C.SPRINT_SPEED += speedOffset;
  lastSpeedOffset = speedOffset;

  const physResult = {
    grounded:   player._lastGrounded ?? false,
    hitCeiling: false,
    _playerY:   player.box.cy - player.box.hh,
    _prevVY:    player.prevVY,
  };
  const movResult = movCtrl.update(dt, fpsCam, physResult, currentGrappleRay);

  // Player
  const finalPhys = player.update(dt, movResult);
  player._lastGrounded = finalPhys.physResult.grounded;

  // Camera
  fpsCam.update(dt);

  // HUD
  updateHUD(movResult, movResult.hSpeed, finalPhys);

  // Handle shooting tracer and hit detection
  if (finalPhys.didShoot) {
    const camWorldPos = new THREE.Vector3();
    fpsCam.camera.getWorldPosition(camWorldPos);
    
    let lookDir = fpsCam.getLookDir();
    
    // Hipfire random spread for Sniper Rifle
    if (player.weapon.type === 'SNIPER' && !player.weapon.isAiming) {
      const spreadVal = 0.12;
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * spreadVal,
        (Math.random() - 0.5) * spreadVal,
        (Math.random() - 0.5) * spreadVal
      );
      lookDir.add(offset).normalize();
    }
    
    if (player.weapon.type === 'KARAMBIT' || player.weapon.type === 'FISTS') {
      // Melee attack: range 4.0m, no tracer
      let hitResult = phys.raycast(camWorldPos.x, camWorldPos.y, camWorldPos.z, lookDir.x, lookDir.y, lookDir.z, 4.0);
      let hitTarget = null;
      let hitPoint = null;

      if (hitResult) {
        hitTarget = targets.find(t => t.active && t.aabb === hitResult.col);
        if (hitTarget) {
          hitPoint = hitResult.point;
        }
      }

      // Proximity-based hit registration for targets in front of the player (if raycast missed)
      if (!hitTarget) {
        let closestDist = Infinity;
        for (const t of targets) {
          if (!t.active) continue;
          const toTarget = new THREE.Vector3(t.x, t.y, t.z).sub(camWorldPos);
          const dist = toTarget.length();
          // Within generous melee proximity range (5.5m)
          if (dist <= 5.5) {
            const dirToTarget = toTarget.clone().normalize();
            const dot = lookDir.dot(dirToTarget);
            // Must be in front (dot > 0.3 allows about a 145-degree cone)
            if (dot > 0.3 && dist < closestDist) {
              closestDist = dist;
              hitTarget = t;
              hitPoint = new THREE.Vector3(t.x, t.y, t.z); // use target center as hitpoint indicator
            }
          }
        }
      }

      if (hitTarget) {
        hitTarget.destroy();
        spawnHitIndicator(hitPoint || new THREE.Vector3(hitTarget.x, hitTarget.y, hitTarget.z));
        
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
          crosshair.classList.add('hit');
          if (crosshair.hitTimeout) clearTimeout(crosshair.hitTimeout);
          crosshair.hitTimeout = setTimeout(() => crosshair.classList.remove('hit'), 100);
        }
      }
    } else if (player.weapon.type === 'SHOTGUN') {
      // SHOTGUN: 8-pellet spread
      const pelletCount = 8;
      const spreadVal = 0.08;
      const startPos = new THREE.Vector3();
      if (player.weapon && player.weapon.muzzleFlash && !player.weapon.isAiming) {
        player.weapon.muzzleFlash.getWorldPosition(startPos);
      } else {
        startPos.copy(camWorldPos);
      }
      
      let hitAny = false;
      const hitsThisShot = new Set();
      
      for (let i = 0; i < pelletCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const r = Math.random() * spreadVal;
        
        const upVec = new THREE.Vector3(0, 1, 0);
        const rightVec = new THREE.Vector3().crossVectors(lookDir, upVec).normalize();
        const localUpVec = new THREE.Vector3().crossVectors(rightVec, lookDir).normalize();
        
        const pelletDir = lookDir.clone()
          .addScaledVector(rightVec, Math.cos(theta) * r)
          .addScaledVector(localUpVec, Math.sin(theta) * r)
          .normalize();

        const hitResult = phys.raycast(camWorldPos.x, camWorldPos.y, camWorldPos.z, pelletDir.x, pelletDir.y, pelletDir.z, 150);
        const endPos = new THREE.Vector3();
        
        if (hitResult) {
          endPos.set(hitResult.point.x, hitResult.point.y, hitResult.point.z);
          const hitTarget = targets.find(t => t.active && t.aabb === hitResult.col);
          if (hitTarget && !hitsThisShot.has(hitTarget)) {
            hitTarget.destroy();
            spawnHitIndicator(hitResult.point);
            hitsThisShot.add(hitTarget);
            hitAny = true;
          }
        } else {
          endPos.copy(camWorldPos).addScaledVector(pelletDir, 75);
        }
        
        spawnTracer(startPos, endPos, 'SHOTGUN');
      }
      
      if (hitAny) {
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
          crosshair.classList.add('hit');
          if (crosshair.hitTimeout) clearTimeout(crosshair.hitTimeout);
          crosshair.hitTimeout = setTimeout(() => crosshair.classList.remove('hit'), 100);
        }
      }
    } else if (player.weapon.type === 'SNIPER') {
      // Sniper rifle target penetration!
      const hits = phys.raycastAll(camWorldPos.x, camWorldPos.y, camWorldPos.z, lookDir.x, lookDir.y, lookDir.z, 250);
      const startPos = new THREE.Vector3();
      if (player.weapon && player.weapon.muzzleFlash && !player.weapon.isAiming) {
        player.weapon.muzzleFlash.getWorldPosition(startPos);
      } else {
        startPos.copy(camWorldPos);
      }
      
      let endPos = new THREE.Vector3().copy(camWorldPos).addScaledVector(lookDir, 150);
      let hitAny = false;

      for (const hit of hits) {
        const hitTarget = targets.find(t => t.active && t.aabb === hit.col);
        if (hitTarget) {
          hitTarget.destroy();
          spawnHitIndicator(hit.point);
          hitAny = true;
        } else {
          // If we hit solid level geometry, stop bullet penetration and set tracer end here!
          endPos.set(hit.point.x, hit.point.y, hit.point.z);
          break;
        }
      }
      
      if (hitAny) {
        const crosshair = document.getElementById('crosshair');
        if (crosshair) {
          crosshair.classList.add('hit');
          if (crosshair.hitTimeout) clearTimeout(crosshair.hitTimeout);
          crosshair.hitTimeout = setTimeout(() => crosshair.classList.remove('hit'), 100);
        }
      }
      
      spawnTracer(startPos, endPos, 'SNIPER');
    } else {
      // Regular weapon shooting (Assault Rifle, Pistols)
      const startPos = new THREE.Vector3();
      if (player.weapon.type === 'PISTOLS') {
        if (player.weapon.lastFiredLeft && player.weapon.leftMuzzleFlash) {
          player.weapon.leftMuzzleFlash.getWorldPosition(startPos);
        } else if (!player.weapon.lastFiredLeft && player.weapon.rightMuzzleFlash) {
          player.weapon.rightMuzzleFlash.getWorldPosition(startPos);
        } else {
          startPos.copy(camWorldPos);
        }
      } else if (player.weapon && player.weapon.muzzleFlash && !player.weapon.isAiming) {
        player.weapon.muzzleFlash.getWorldPosition(startPos);
      } else {
        startPos.copy(camWorldPos);
      }

      const hitResult = phys.raycast(camWorldPos.x, camWorldPos.y, camWorldPos.z, lookDir.x, lookDir.y, lookDir.z, 250);
      const endPos = new THREE.Vector3();
      
      if (hitResult) {
        endPos.set(hitResult.point.x, hitResult.point.y, hitResult.point.z);
        const hitTarget = targets.find(t => t.active && t.aabb === hitResult.col);
        if (hitTarget) {
          hitTarget.destroy();
          spawnHitIndicator(hitResult.point);
          
          const crosshair = document.getElementById('crosshair');
          if (crosshair) {
            crosshair.classList.add('hit');
            if (crosshair.hitTimeout) clearTimeout(crosshair.hitTimeout);
            crosshair.hitTimeout = setTimeout(() => crosshair.classList.remove('hit'), 100);
          }
        }
      } else {
        endPos.copy(camWorldPos).addScaledVector(lookDir, 150);
      }
      spawnTracer(startPos, endPos, player.weapon.type);
    }
  }

  // Update tracers
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    if (t.life <= 0) {
      scene.remove(t.line);
      t.line.geometry.dispose();
      t.line.material.dispose();
      tracers.splice(i, 1);
    } else {
      t.line.material.opacity = (t.life / t.maxLife) * 0.8;
    }
  }

  // Update floating text indicators
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.life -= dt;
    if (ft.life <= 0) {
      ft.el.remove();
      floatingTexts.splice(i, 1);
    } else {
      ft.pos3d.y += dt * 1.5;
      const proj = ft.pos3d.clone().project(fpsCam.camera);
      if (proj.z > 1) {
        ft.el.style.display = 'none';
      } else {
        ft.el.style.display = 'block';
        const x = (proj.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-proj.y * 0.5 + 0.5) * window.innerHeight;
        ft.el.style.left = `${x}px`;
        ft.el.style.top = `${y}px`;
        const pct = ft.life / ft.maxLife;
        ft.el.style.opacity = pct;
        ft.el.style.transform = `translate(-50%, -50%) scale(${1.0 + (1.0 - pct) * 0.5})`;
      }
    }
  }

  // Update targets
  targets.forEach(t => t.update(dt));

  // Combo timer
  if (comboHideTimer > 0) {
    comboHideTimer -= dt;
    if (comboHideTimer <= 0 && hudCombo) hudCombo.classList.remove('visible');
  }

  // Notifications
  if (movResult.didSlideCancel) showNotif('🚀 SLIDE CANCEL!', 'orange');
  if (movResult.didDash) showNotif('💨 DASH!', 'cyan');

  if (movResult.grappleActive && movResult.didLand === false && movCtrl.grappleCooldown >= C.GRAPPLE_COOLDOWN - 0.1)
    showNotif('🪝 GRAPPLE!', 'purple');
  if (movResult.comboName) showNotif(movResult.comboName, 'purple');

  // OOB reset
  if (player.box.cy < -30) {
    player.reset();
    showNotif('💀 RESET', 'orange');
  }

  renderer.render(scene, fpsCam.camera);
}

if (window.gameLoopId) {
  cancelAnimationFrame(window.gameLoopId);
}
window.gameLoopId = requestAnimationFrame(loop);
