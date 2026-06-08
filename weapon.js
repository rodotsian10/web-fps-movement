// ============================================================
// weapon.js  –  Weapon logic (mesh, firing, ads, recoil)
// ============================================================
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class Weapon {
  constructor(cam) {
    this.cam = cam;
    
    this.ammoMax = 30;
    this.ammo = 30;
    this.ammoReserve = 120;
    
    this.isReloading = false;
    this.reloadTimer = 0;
    this.isAiming = false;
    this.isFiring = false;
    this.fireCooldown = 0;
    this.fireRate = 0.1634;

    this.weaponGroup = null;
    this.muzzleFlash = null;
    this._createWeaponMesh();
  }

  _createWeaponMesh() {
    this.weaponGroup = new THREE.Group();
    
    const matMetal = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.2 });
    const matGrip = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.5, roughness: 0.5 });
    const matGlow = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x00f0ff, emissiveIntensity: 1.5, roughness: 0.2 });
    
    // Weapon body
    const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.35);
    const body = new THREE.Mesh(bodyGeo, matMetal);
    body.castShadow = true;
    body.receiveShadow = true;
    this.weaponGroup.add(body);
    
    // Gun barrel
    const barrelGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.25, 8);
    barrelGeo.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, matMetal);
    barrel.position.set(0, 0.015, -0.22);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    this.weaponGroup.add(barrel);
    
    // Grip
    const gripGeo = new THREE.BoxGeometry(0.04, 0.1, 0.04);
    const grip = new THREE.Mesh(gripGeo, matGrip);
    grip.position.set(0, -0.07, 0.06);
    grip.rotation.x = -0.35;
    grip.castShadow = true;
    this.weaponGroup.add(grip);
    
    // Glow accents
    const glowGeo = new THREE.BoxGeometry(0.062, 0.008, 0.25);
    const glow = new THREE.Mesh(glowGeo, matGlow);
    glow.position.set(0, 0.02, -0.05);
    this.weaponGroup.add(glow);

    // Muzzle flash
    this.muzzleFlash = new THREE.PointLight(0x00f0ff, 0, 4);
    this.muzzleFlash.position.set(0, 0.015, -0.36);
    this.weaponGroup.add(this.muzzleFlash);

    this.weaponGroup.position.set(0.24, -0.22, -0.42);
    this.weaponGroup.rotation.set(0.04, -0.04, 0);
    
    this.cam.camera.add(this.weaponGroup);
  }

  reset() {
    this.ammo = this.ammoMax;
    this.ammoReserve = 120;
    this.isReloading = false;
    this.reloadTimer = 0;
    this.isAiming = false;
    this.isFiring = false;
    this.fireCooldown = 0;
    this.cam.setADS(false);
    if (this.muzzleFlash) this.muzzleFlash.intensity = 0;
  }

  startFiring() { this.isFiring = true; }
  stopFiring() { this.isFiring = false; }
  
  startAiming() {
    this.isAiming = true;
    this.cam.setADS(true);
  }
  stopAiming() {
    this.isAiming = false;
    this.cam.setADS(false);
  }

  reload() {
    if (this.isReloading || this.ammo === this.ammoMax || this.ammoReserve <= 0) return;
    this.isReloading = true;
    this.reloadTimer = 1.5;
    this.isFiring = false;
  }

  update(dt, hs) {
    let didShoot = false;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const needed = this.ammoMax - this.ammo;
        const toAdd = Math.min(needed, this.ammoReserve);
        this.ammo += toAdd;
        this.ammoReserve -= toAdd;
        this.isReloading = false;
      }
    } else if (this.isFiring && this.fireCooldown <= 0) {
      if (this.ammo <= 0) {
        this.reload();
      } else {
        this.ammo -= 1;
        this.fireCooldown = this.fireRate;
        //this.cam.shake(0.12);
        didShoot = true;
        if (this.muzzleFlash) this.muzzleFlash.intensity = 5.0;
      }
    }

    if (this.weaponGroup) {
      const targetPos = new THREE.Vector3();
      const targetRot = new THREE.Euler();

      if (this.isAiming) {
        targetPos.set(0, -0.13, -0.28);
        targetRot.set(0, 0, 0);
      } else {
        const bobSwayX = Math.cos(performance.now() * 0.005) * 0.008 * Math.min(hs / 10, 1.0);
        const bobSwayY = Math.sin(performance.now() * 0.01) * 0.006 * Math.min(hs / 10, 1.0);
        targetPos.set(0.24 + bobSwayX, -0.22 + bobSwayY, -0.42);
        targetRot.set(0.04, -0.04, 0);
      }

      this.weaponGroup.position.lerp(targetPos, Math.min(1, dt * 16));
      this.weaponGroup.quaternion.slerp(new THREE.Quaternion().setFromEuler(targetRot), Math.min(1, dt * 16));

      if (this.muzzleFlash && this.muzzleFlash.intensity > 0) {
        this.muzzleFlash.intensity = Math.max(0, this.muzzleFlash.intensity - dt * 45.0);
      }
    }

    return { didShoot, ammo: this.ammo, ammoReserve: this.ammoReserve, isReloading: this.isReloading, isAiming: this.isAiming };
  }
}
