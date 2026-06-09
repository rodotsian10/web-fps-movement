// ============================================================
// weapon.js  –  Weapon logic (mesh, firing, ads, recoil)
// ============================================================
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class Weapon {
  constructor(cam, type = 'RIFLE') {
    this.cam = cam;
    this.type = type;
    
    // Weapon configurations
    if (type === 'SNIPER') {
      this.ammoMax = 5;
      this.ammo = 5;
      this.ammoReserve = 30;
      this.fireRate = 1.2;
      this.reloadTime = 2.2;
      this.adsZoom = 50;
      this.recoilCamShake = 0.45;
      this.glowColor = 0xff3b30; // Red/Orange glow
    } else if (type === 'PISTOLS') {
      this.ammoMax = 24;
      this.ammo = 24;
      this.ammoReserve = Infinity;
      this.fireRate = 0.09;
      this.reloadTime = 1.6;
      this.adsZoom = 15;
      this.recoilCamShake = 0.08;
      this.glowColor = 0x22c55e; // Green glow
    } else if (type === 'SHOTGUN') {
      this.ammoMax = 2;
      this.ammo = 2;
      this.ammoReserve = 32;
      this.fireRate = 0.8;
      this.reloadTime = 2.0;
      this.adsZoom = 15;
      this.recoilCamShake = 0.5;
      this.glowColor = 0xfacc15; // Yellow glow
    } else if (type === 'KARAMBIT') {
      this.ammoMax = 0;
      this.ammo = 0;
      this.ammoReserve = 0;
      this.fireRate = 1.0; // 1 second cooldown
      this.reloadTime = 0.1;
      this.adsZoom = 0; // right click is custom finger inspect spin
      this.recoilCamShake = 0.03;
      //this.glowColor = 0x7c3aed; // Purple glow
      this.glowColor = 0xffd700;
    } else if (type === 'FISTS') {
      this.ammoMax = 0;
      this.ammo = 0;
      this.ammoReserve = 0;
      this.fireRate = 0.22;
      this.reloadTime = 0.1;
      this.adsZoom = 0;
      this.recoilCamShake = 0.05;
      this.glowColor = 0xff0055;
      
      this.lastPunchTime = 0;
      this.punchSequence = 0;
      this.lastFiredLeftFist = false;
    } else {
      // Default RIFLE
      this.ammoMax = 30;
      this.ammo = 30;
      this.ammoReserve = 120;
      this.fireRate = 0.1634;
      this.reloadTime = 1.5;
      this.adsZoom = 25;
      this.recoilCamShake = 0.12;
      this.glowColor = 0x00f0ff; // Cyan glow
    }
    
    this.isReloading = false;
    this.reloadTimer = 0;
    this.isAiming = false;
    this.wantsToAim = false;
    this.isFiring = false;
    this.queuedFire = false;
    this.fireCooldown = 0;

    this.weaponGroup = null;
    this.muzzleFlash = null;
    this.boltMesh = null;
    this.leftPistol = null;
    this.rightPistol = null;
    this.leftMuzzleFlash = null;
    this.rightMuzzleFlash = null;
    this.karambitMesh = null;
    this.leftFist = null;
    this.rightFist = null;
    this.lastFiredLeft = false;

    this._createWeaponMesh();
  }

  _createWeaponMesh() {
    this.weaponGroup = new THREE.Group();
    
    const matMetal = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.2 });
    const matGrip = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.5, roughness: 0.5 });
    const matGlow = new THREE.MeshStandardMaterial({ color: this.glowColor, emissive: this.glowColor, emissiveIntensity: 1.5, roughness: 0.2 });
    
    if (this.type === 'SNIPER') {
      // Sniper body
      const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.45);
      const body = new THREE.Mesh(bodyGeo, matMetal);
      body.castShadow = true;
      body.receiveShadow = true;
      this.weaponGroup.add(body);
      
      // Sniper long barrel
      const barrelGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.55, 8);
      barrelGeo.rotateX(Math.PI / 2);
      const barrel = new THREE.Mesh(barrelGeo, matMetal);
      barrel.position.set(0, 0.015, -0.37);
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      this.weaponGroup.add(barrel);

      // Scope body (on top of sniper body)
      const scopeBodyGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.18, 12);
      scopeBodyGeo.rotateX(Math.PI / 2);
      const scopeBody = new THREE.Mesh(scopeBodyGeo, matMetal);
      scopeBody.position.set(0, 0.065, -0.05);
      scopeBody.castShadow = true;
      this.weaponGroup.add(scopeBody);

      // Scope mounts
      const mountGeo = new THREE.BoxGeometry(0.015, 0.03, 0.02);
      const mount1 = new THREE.Mesh(mountGeo, matGrip);
      mount1.position.set(0, 0.045, -0.1);
      const mount2 = new THREE.Mesh(mountGeo, matGrip);
      mount2.position.set(0, 0.045, 0.0);
      this.weaponGroup.add(mount1);
      this.weaponGroup.add(mount2);

      // Scope lens glow accents
      const lensGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.01, 12);
      lensGeo.rotateX(Math.PI / 2);
      const lens = new THREE.Mesh(lensGeo, matGlow);
      lens.position.set(0, 0.065, -0.141);
      this.weaponGroup.add(lens);

      // Bolt cylinder and handle
      const boltGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.08, 8);
      boltGeo.rotateX(Math.PI / 2);
      this.boltMesh = new THREE.Mesh(boltGeo, matGrip);
      this.boltMesh.position.set(0.028, 0.03, -0.05);
      this.weaponGroup.add(this.boltMesh);

      const boltHandleGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.025, 8);
      const boltHandle = new THREE.Mesh(boltHandleGeo, matGrip);
      boltHandle.position.set(0.016, 0, 0);
      boltHandle.rotation.z = Math.PI / 2;
      this.boltMesh.add(boltHandle);
      
      const knobGeo = new THREE.SphereGeometry(0.006, 8, 8);
      const knob = new THREE.Mesh(knobGeo, matGlow);
      knob.position.set(0, 0.016, 0);
      boltHandle.add(knob);
      
      // Grip
      const gripGeo = new THREE.BoxGeometry(0.04, 0.1, 0.04);
      const grip = new THREE.Mesh(gripGeo, matGrip);
      grip.position.set(0, -0.07, 0.08);
      grip.rotation.x = -0.35;
      grip.castShadow = true;
      this.weaponGroup.add(grip);
      
      // Glow accents on body
      const glowGeo = new THREE.BoxGeometry(0.062, 0.008, 0.35);
      const glow = new THREE.Mesh(glowGeo, matGlow);
      glow.position.set(0, 0.02, -0.05);
      this.weaponGroup.add(glow);

      // Muzzle flash
      this.muzzleFlash = new THREE.PointLight(this.glowColor, 0, 5);
      this.muzzleFlash.position.set(0, 0.015, -0.66);
      this.weaponGroup.add(this.muzzleFlash);
    } else if (this.type === 'PISTOLS') {
      // Create right and left pistol meshes
      const createPistolMesh = (isLeft) => {
        const pGroup = new THREE.Group();
        
        // Body
        const bodyGeo = new THREE.BoxGeometry(0.04, 0.05, 0.16);
        const body = new THREE.Mesh(bodyGeo, matMetal);
        body.castShadow = true;
        pGroup.add(body);
        
        // Barrel
        const barrelGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.12, 8);
        barrelGeo.rotateX(Math.PI / 2);
        const barrel = new THREE.Mesh(barrelGeo, matMetal);
        barrel.position.set(0, 0.01, -0.08);
        barrel.castShadow = true;
        pGroup.add(barrel);
        
        // Grip
        const gripGeo = new THREE.BoxGeometry(0.026, 0.07, 0.03);
        const grip = new THREE.Mesh(gripGeo, matGrip);
        grip.position.set(0, -0.05, 0.03);
        grip.rotation.x = -0.35;
        grip.castShadow = true;
        pGroup.add(grip);
        
        // Glow accent
        const glowGeo = new THREE.BoxGeometry(0.042, 0.005, 0.1);
        const glow = new THREE.Mesh(glowGeo, matGlow);
        glow.position.set(0, 0.015, -0.02);
        pGroup.add(glow);
        
        return pGroup;
      };

      this.leftPistol = createPistolMesh(true);
      this.leftPistol.position.set(-0.18, -0.18, -0.32);
      this.leftPistol.rotation.set(0.04, 0.04, 0);
      this.weaponGroup.add(this.leftPistol);

      this.rightPistol = createPistolMesh(false);
      this.rightPistol.position.set(0.18, -0.18, -0.32);
      this.rightPistol.rotation.set(0.04, -0.04, 0);
      this.weaponGroup.add(this.rightPistol);

      // Muzzle flashes
      this.leftMuzzleFlash = new THREE.PointLight(this.glowColor, 0, 3);
      this.leftMuzzleFlash.position.set(0, 0.01, -0.16);
      this.leftPistol.add(this.leftMuzzleFlash);

      this.rightMuzzleFlash = new THREE.PointLight(this.glowColor, 0, 3);
      this.rightMuzzleFlash.position.set(0, 0.01, -0.16);
      this.rightPistol.add(this.rightMuzzleFlash);
    } else if (this.type === 'SHOTGUN') {
      // Shotgun body
      const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.32);
      const body = new THREE.Mesh(bodyGeo, matMetal);
      body.castShadow = true;
      body.receiveShadow = true;
      this.weaponGroup.add(body);

      // Shotgun double barrel
      const barrelGeo1 = new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8);
      barrelGeo1.rotateX(Math.PI / 2);
      const barrel1 = new THREE.Mesh(barrelGeo1, matMetal);
      barrel1.position.set(-0.015, 0.01, -0.22);
      barrel1.castShadow = true;
      barrel1.receiveShadow = true;
      this.weaponGroup.add(barrel1);

      const barrelGeo2 = new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8);
      barrelGeo2.rotateX(Math.PI / 2);
      const barrel2 = new THREE.Mesh(barrelGeo2, matMetal);
      barrel2.position.set(0.015, 0.01, -0.22);
      barrel2.castShadow = true;
      barrel2.receiveShadow = true;
      this.weaponGroup.add(barrel2);

      // Grip
      const gripGeo = new THREE.BoxGeometry(0.035, 0.09, 0.035);
      const grip = new THREE.Mesh(gripGeo, matGrip);
      grip.position.set(0, -0.06, 0.08);
      grip.rotation.x = -0.35;
      grip.castShadow = true;
      this.weaponGroup.add(grip);

      // Handguard/pump slide
      const pumpGeo = new THREE.BoxGeometry(0.055, 0.04, 0.16);
      const pump = new THREE.Mesh(pumpGeo, matGrip);
      pump.position.set(0, -0.02, -0.15);
      pump.castShadow = true;
      this.weaponGroup.add(pump);

      // Glow accents
      const glowGeo = new THREE.BoxGeometry(0.062, 0.006, 0.22);
      const glow = new THREE.Mesh(glowGeo, matGlow);
      glow.position.set(0, 0.02, -0.05);
      this.weaponGroup.add(glow);

      // Muzzle flash light (yellow)
      this.muzzleFlash = new THREE.PointLight(this.glowColor, 0, 4);
      this.muzzleFlash.position.set(0, 0.01, -0.42);
      this.weaponGroup.add(this.muzzleFlash);
    } else if (this.type === 'KARAMBIT') {
      // Create a main pivot for the Karambit, centered at the finger ring
      const karambitPivot = new THREE.Group();
      // Position the pivot in screen space so it is visible in the lower right
      karambitPivot.position.set(0.24, -0.2, -0.38);
      // Give it a cool default rotation to present the curved blade nicely
      karambitPivot.rotation.set(0.3, 0.2, -0.4);
      this.weaponGroup.add(karambitPivot);

      // 1. The Ring (Finger loop) - centered at the pivot (0, 0, 0)
      const ringGeo = new THREE.TorusGeometry(0.016, 0.005, 8, 24);
      const ring = new THREE.Mesh(ringGeo, matMetal);
      karambitPivot.add(ring);

      // Glowing inner ring insert for premium golden aesthetic
      const innerRingGeo = new THREE.TorusGeometry(0.015, 0.002, 8, 24);
      const innerRing = new THREE.Mesh(innerRingGeo, matGlow);
      ring.add(innerRing);

      // 2. The Handle - extends from the ring
      const handleGeo = new THREE.BoxGeometry(0.024, 0.09, 0.024);
      const handle = new THREE.Mesh(handleGeo, matGrip);
      // Offset so its bottom end aligns with the ring edge
      handle.position.set(0, 0.05, 0); 
      ring.add(handle);

      // Finger grooves on the grip for higher tier detail
      const grooveGeo = new THREE.BoxGeometry(0.028, 0.01, 0.012);
      for (let i = 0; i < 3; i++) {
        const groove = new THREE.Mesh(grooveGeo, matMetal);
        groove.position.set(-0.008, 0.02 + i * 0.02, 0);
        handle.add(groove);
      }

      // 3. The Curved Blade - attaches to the top of the handle
      const bladeGroup = new THREE.Group();
      bladeGroup.position.set(0, 0.045, 0);
      handle.add(bladeGroup);

      const overlap = 0.004;

      // Joint 1
      const joint1 = new THREE.Group();
      bladeGroup.add(joint1);

      const H1 = 0.035;
      const seg1Geo = new THREE.BoxGeometry(0.02, H1, 0.008);
      const seg1 = new THREE.Mesh(seg1Geo, matMetal);
      seg1.position.set(0, H1 / 2 - overlap, 0);
      joint1.add(seg1);

      const edge1Geo = new THREE.BoxGeometry(0.004, H1 + 0.002, 0.01);
      const edge1 = new THREE.Mesh(edge1Geo, matGlow);
      edge1.position.set(-0.01, H1 / 2 - overlap, 0);
      joint1.add(edge1);

      joint1.rotation.z = -0.25;

      // Joint 2 (placed relative to joint 1)
      const joint2 = new THREE.Group();
      joint2.position.set(0, H1 - overlap * 2, 0);
      joint1.add(joint2);

      const H2 = 0.035;
      const seg2Geo = new THREE.BoxGeometry(0.016, H2, 0.006);
      const seg2 = new THREE.Mesh(seg2Geo, matMetal);
      seg2.position.set(0, H2 / 2 - overlap, 0);
      joint2.add(seg2);

      const edge2Geo = new THREE.BoxGeometry(0.004, H2 + 0.002, 0.008);
      const edge2 = new THREE.Mesh(edge2Geo, matGlow);
      edge2.position.set(-0.008, H2 / 2 - overlap, 0);
      joint2.add(edge2);

      joint2.rotation.z = -0.4;

      // Joint 3 (placed relative to joint 2)
      const joint3 = new THREE.Group();
      joint3.position.set(0, H2 - overlap * 2, 0);
      joint2.add(joint3);

      const H3 = 0.03;
      const seg3Geo = new THREE.BoxGeometry(0.012, H3, 0.004);
      const seg3 = new THREE.Mesh(seg3Geo, matMetal);
      seg3.position.set(0, H3 / 2 - overlap, 0);
      joint3.add(seg3);

      const edge3Geo = new THREE.BoxGeometry(0.004, H3 + 0.002, 0.006);
      const edge3 = new THREE.Mesh(edge3Geo, matGlow);
      edge3.position.set(-0.006, H3 / 2 - overlap, 0);
      joint3.add(edge3);

      joint3.rotation.z = -0.5;
      
      this.karambitMesh = karambitPivot;
    } else if (this.type === 'FISTS') {
      // Roblox blocky fists!
      this.leftFist = new THREE.Group();
      this.leftFist.frustumCulled = false;
      this.rightFist = new THREE.Group();
      this.rightFist.frustumCulled = false;
      
      const armColor = 0xe0a96d; // Skin tone box color
      const matArm = new THREE.MeshStandardMaterial({ color: armColor, roughness: 0.8, metalness: 0.1 });
      const matShirt = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.1 }); // Black sleeve/shirt
      
      // Roblox blocky arm: larger size
      // Sleeve part
      const sleeveGeo = new THREE.BoxGeometry(0.14, 0.14, 0.28);
      const leftSleeve = new THREE.Mesh(sleeveGeo, matShirt);
      leftSleeve.position.set(0, 0, 0.10);
      leftSleeve.castShadow = true;
      leftSleeve.frustumCulled = false;
      this.leftFist.add(leftSleeve);

      const rightSleeve = new THREE.Mesh(sleeveGeo, matShirt);
      rightSleeve.position.set(0, 0, 0.10);
      rightSleeve.castShadow = true;
      rightSleeve.frustumCulled = false;
      this.rightFist.add(rightSleeve);

      // Hand/Fist part (Roblox yellow skin block)
      const handGeo = new THREE.BoxGeometry(0.13, 0.13, 0.18);
      const leftHand = new THREE.Mesh(handGeo, matArm);
      leftHand.position.set(0, 0, -0.13);
      leftHand.castShadow = true;
      leftHand.frustumCulled = false;
      this.leftFist.add(leftHand);

      const rightHand = new THREE.Mesh(handGeo, matArm);
      rightHand.position.set(0, 0, -0.13);
      rightHand.castShadow = true;
      rightHand.frustumCulled = false;
      this.rightFist.add(rightHand);
      
      // Glow band around wrist for premium touch
      const bandGeo = new THREE.BoxGeometry(0.145, 0.145, 0.02);
      const leftBand = new THREE.Mesh(bandGeo, matGlow);
      leftBand.position.set(0, 0, -0.04);
      leftBand.frustumCulled = false;
      this.leftFist.add(leftBand);

      const rightBand = new THREE.Mesh(bandGeo, matGlow);
      rightBand.position.set(0, 0, -0.04);
      rightBand.frustumCulled = false;
      this.rightFist.add(rightBand);

      // Initial positions for screen coordinates (starting from left & right bottom corners, tilted INWARD)
      this.leftFist.position.set(-0.32, -0.36, -0.45);
      this.leftFist.rotation.set(0.15, 0.6, 0.15);
      this.weaponGroup.add(this.leftFist);

      this.rightFist.position.set(0.32, -0.36, -0.45);
      this.rightFist.rotation.set(0.15, -0.6, -0.15);
      this.weaponGroup.add(this.rightFist);
    } else {
      // Rifle body
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
      this.muzzleFlash = new THREE.PointLight(this.glowColor, 0, 4);
      this.muzzleFlash.position.set(0, 0.015, -0.36);
      this.weaponGroup.add(this.muzzleFlash);
    }

    this.weaponGroup.position.set(0.24, -0.22, -0.42);
    this.weaponGroup.rotation.set(0.04, -0.04, 0);
    
    this.cam.camera.add(this.weaponGroup);
    // Hide by default if set by player management
    this.weaponGroup.visible = false;
  }

  setActive(active) {
    if (this.weaponGroup) {
      this.weaponGroup.visible = active;
    }
    if (!active) {
      this.isAiming = false;
      this.wantsToAim = false;
      this.isFiring = false;
      this.isReloading = false;
      this.cam.setADS(false);
      if (this.muzzleFlash) this.muzzleFlash.intensity = 0;
      if (this.leftMuzzleFlash) this.leftMuzzleFlash.intensity = 0;
      if (this.rightMuzzleFlash) this.rightMuzzleFlash.intensity = 0;
    }
  }

  destroy() {
    if (this.weaponGroup) {
      this.cam.camera.remove(this.weaponGroup);
      this.weaponGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
  }

  reset() {
    this.ammo = this.ammoMax;
    if (this.type === 'SNIPER') {
      this.ammoReserve = 30;
      if (this.boltMesh) {
        this.boltMesh.position.set(0.028, 0.03, -0.05);
      }
    } else if (this.type === 'PISTOLS') {
      this.ammoReserve = Infinity;
      if (this.leftPistol) {
        this.leftPistol.position.set(-0.18, -0.18, -0.32);
        this.leftPistol.rotation.set(0.04, 0.04, 0);
      }
      if (this.rightPistol) {
        this.rightPistol.position.set(0.18, -0.18, -0.32);
        this.rightPistol.rotation.set(0.04, -0.04, 0);
      }
    } else if (this.type === 'SHOTGUN') {
      this.ammoReserve = 32;
    } else if (this.type === 'KARAMBIT') {
      this.ammoReserve = 0;
      if (this.karambitMesh) {
        this.karambitMesh.rotation.set(0.3, 0.2, -0.4);
      }
    } else if (this.type === 'FISTS') {
      this.ammoReserve = 0;
      this.lastPunchTime = 0;
      this.punchSequence = 0;
      this.lastFiredLeftFist = false;
      if (this.leftFist) {
        this.leftFist.position.set(-0.32, -0.36, -0.45);
        this.leftFist.rotation.set(0.15, 0.6, 0.15);
      }
      if (this.rightFist) {
        this.rightFist.position.set(0.32, -0.36, -0.45);
        this.rightFist.rotation.set(0.15, -0.6, -0.15);
      }
    } else {
      this.ammoReserve = 120;
    }
    this.isReloading = false;
    this.reloadTimer = 0;
    this.isAiming = false;
    this.wantsToAim = false;
    this.isFiring = false;
    this.queuedFire = false;
    this.fireCooldown = 0;
    this.cam.setADS(false);
    if (this.muzzleFlash) this.muzzleFlash.intensity = 0;
    if (this.leftMuzzleFlash) this.leftMuzzleFlash.intensity = 0;
    if (this.rightMuzzleFlash) this.rightMuzzleFlash.intensity = 0;
  }

  startFiring() { 
    this.isFiring = true; 
    this.queuedFire = true; 
  }
  stopFiring() { 
    this.isFiring = false; 
  }
  
  startAiming() {
    this.wantsToAim = true;
  }
  stopAiming() {
    this.wantsToAim = false;
    this.isAiming = false;
    this.cam.setADS(false);
  }

  reload() {
    if (this.type === 'KARAMBIT') return; // Melee doesn't reload
    if (this.isReloading || this.ammo === this.ammoMax || this.ammoReserve <= 0) return;
    this.isReloading = true;
    this.reloadTimer = this.reloadTime;
    this.isFiring = false;
  }

  update(dt, hs) {
    let didShoot = false;
    if (this.fireCooldown > 0) this.fireCooldown -= dt;

    // Automatic zoom state machine
    const canAim = !(this.type === 'SNIPER' && this.fireCooldown > 0) && !this.isReloading && (this.type !== 'KARAMBIT' && this.type !== 'FISTS');
    if (this.wantsToAim && canAim) {
      if (!this.isAiming) {
        this.isAiming = true;
        this.cam.setADS(true, this.adsZoom);
      }
    } else {
      if (this.isAiming) {
        this.isAiming = false;
        this.cam.setADS(false);
      }
    }

    // Inspect spin for Karambit on holding right click (only if not in attack cooldown)
    if (this.type === 'KARAMBIT') {
      if (this.wantsToAim && this.fireCooldown <= 0) {
        this.isAiming = true;
      } else {
        this.isAiming = false;
      }
    }

    const shouldFire = (this.isFiring || this.queuedFire) && this.fireCooldown <= 0;
    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const needed = this.ammoMax - this.ammo;
        const toAdd = Math.min(needed, this.ammoReserve);
        this.ammo += toAdd;
        this.ammoReserve -= toAdd;
        this.isReloading = false;
      }
    } else if (shouldFire) {
      this.queuedFire = false;
      if (this.type === 'KARAMBIT') {
        this.fireCooldown = this.fireRate;
        this.cam.shake(this.recoilCamShake);
        didShoot = true;
      } else if (this.type === 'FISTS') {
        const now = performance.now() / 1000;
        if (now - this.lastPunchTime > 0.8) {
          this.punchSequence = 0;
        }
        this.lastFiredLeftFist = (this.punchSequence === 0);
        this.punchSequence = this.lastFiredLeftFist ? 1 : 0;
        this.lastPunchTime = now;
        
        this.fireCooldown = this.fireRate;
        this.cam.shake(this.recoilCamShake);
        didShoot = true;
      } else if (this.ammo <= 0) {
        this.reload();
      } else {
        this.ammo -= 1;
        this.fireCooldown = this.fireRate;
        this.cam.shake(this.recoilCamShake);
        didShoot = true;
        
        if (this.type === 'PISTOLS') {
          this.lastFiredLeft = !this.lastFiredLeft;
          if (this.lastFiredLeft && this.leftMuzzleFlash) this.leftMuzzleFlash.intensity = 5.0;
          if (!this.lastFiredLeft && this.rightMuzzleFlash) this.rightMuzzleFlash.intensity = 5.0;
        } else {
          if (this.muzzleFlash) this.muzzleFlash.intensity = 5.0;
        }
      }
    }

    if (this.weaponGroup && this.weaponGroup.visible) {
      const targetPos = new THREE.Vector3();
      const targetRot = new THREE.Euler();

      if (this.isAiming && this.type !== 'KARAMBIT') {
        if (this.type === 'SNIPER') {
          targetPos.set(0, -1.0, 0);
          targetRot.set(0, 0, 0);
        } else if (this.type === 'PISTOLS') {
          // Bring dual pistols closer to center for unified aiming
          targetPos.set(0, -0.15, -0.22);
          targetRot.set(0.02, 0, 0);
        } else {
          targetPos.set(0, -0.13, -0.28);
          targetRot.set(0, 0, 0);
        }
      } else {
        const bobSwayX = Math.cos(performance.now() * 0.005) * 0.008 * Math.min(hs / 10, 1.0);
        const bobSwayY = Math.sin(performance.now() * 0.01) * 0.006 * Math.min(hs / 10, 1.0);
        
        if (this.type === 'SNIPER') {
          targetPos.set(0.24 + bobSwayX, -0.25 + bobSwayY, -0.52);
          targetRot.set(0.04, -0.04, 0);
        } else if (this.type === 'PISTOLS' || this.type === 'FISTS') {
          targetPos.set(bobSwayX, -0.08 + bobSwayY, -0.1);
          targetRot.set(0.02, 0, 0);
        } else if (this.type === 'KARAMBIT') {
          targetPos.set(bobSwayX * 1.5, bobSwayY * 1.5, 0);
          targetRot.set(0, 0, 0);
        } else {
          targetPos.set(0.24 + bobSwayX, -0.22 + bobSwayY, -0.42);
          targetRot.set(0.04, -0.04, 0);
        }
      }

      // Procedural animations
      const animOffsetPos = new THREE.Vector3();
      const animOffsetRot = new THREE.Euler();

      // A. Reloading Animation
      if (this.isReloading) {
        const reloadProgress = 1.0 - (this.reloadTimer / this.reloadTime);
        
        if (this.type === 'PISTOLS') {
          // Double Gun Spin Reload!
          if (reloadProgress < 0.25) {
            const p = reloadProgress / 0.25;
            animOffsetPos.y = -0.12 * p;
            animOffsetRot.x = -0.25 * p;
          } else if (reloadProgress < 0.75) {
            const p = (reloadProgress - 0.25) / 0.5;
            animOffsetPos.y = -0.12;
            animOffsetRot.x = -0.25;
            if (this.leftPistol) this.leftPistol.rotation.z = p * Math.PI * 2;
            if (this.rightPistol) this.rightPistol.rotation.z = -p * Math.PI * 2;
          } else {
            const p = (reloadProgress - 0.75) / 0.25;
            animOffsetPos.y = -0.12 * (1.0 - p);
            animOffsetRot.x = -0.25 * (1.0 - p);
            if (this.leftPistol) this.leftPistol.rotation.z = 0;
            if (this.rightPistol) this.rightPistol.rotation.z = 0;
          }
        } else {
          // Standard reload animation
          if (reloadProgress < 0.35) {
            const p = reloadProgress / 0.35;
            animOffsetPos.set(-0.04 * p, -0.12 * p, -0.03 * p);
            animOffsetRot.set(-0.35 * p, 0.08 * p, -0.25 * p);
          } else if (reloadProgress < 0.75) {
            const shake = Math.sin(performance.now() * 0.06) * 0.012;
            animOffsetPos.set(-0.04, -0.12 + shake, -0.03);
            animOffsetRot.set(-0.35, 0.08, -0.25 + shake * 2);
          } else {
            const p = (reloadProgress - 0.75) / 0.25;
            animOffsetPos.set(-0.04 * (1.0 - p), -0.12 * (1.0 - p), -0.03 * (1.0 - p));
            animOffsetRot.set(-0.35 * (1.0 - p), 0.08 * (1.0 - p), -0.25 * (1.0 - p));
          }
        }
      }

      // B. Recoil / Melee Attack & Melee Inspect Spin Animation
      if (!this.isReloading) {
        if (this.type === 'SNIPER') {
          if (this.boltMesh) this.boltMesh.position.set(0.028, 0.03, -0.05);

          if (this.fireCooldown > 0) {
            const progress = 1.0 - (this.fireCooldown / this.fireRate);
            if (progress < 0.15) {
              const recoilT = progress / 0.15;
              const kick = Math.sin(recoilT * Math.PI) * -0.08;
              animOffsetPos.z = kick;
              animOffsetRot.x = Math.sin(recoilT * Math.PI) * 0.15;
            } else if (progress > 0.2 && progress < 0.85) {
              const boltP = (progress - 0.2) / 0.65;
              let zOffset = 0;
              if (boltP < 0.5) {
                zOffset = (boltP / 0.5) * 0.055;
              } else {
                zOffset = (1.0 - ((boltP - 0.5) / 0.5)) * 0.055;
              }
              if (this.boltMesh) this.boltMesh.position.z = -0.05 + zOffset;

              const tiltT = Math.sin(boltP * Math.PI);
              animOffsetRot.z = -0.12 * tiltT;
              animOffsetRot.y = -0.06 * tiltT;
              animOffsetPos.y = -0.015 * tiltT;
            }
          }
        } else if (this.type === 'PISTOLS') {
          if (this.leftPistol) {
            this.leftPistol.position.set(-0.18, -0.18, -0.32);
            this.leftPistol.rotation.set(0.04, 0.04, 0);
          }
          if (this.rightPistol) {
            this.rightPistol.position.set(0.18, -0.18, -0.32);
            this.rightPistol.rotation.set(0.04, -0.04, 0);
          }

          if (this.fireCooldown > 0) {
            const progress = 1.0 - (this.fireCooldown / this.fireRate);
            const kick = Math.sin(progress * Math.PI) * -0.06;
            const pitch = Math.sin(progress * Math.PI) * 0.15;
            
            if (this.lastFiredLeft) {
              if (this.leftPistol) {
                this.leftPistol.position.z = -0.32 + kick;
                this.leftPistol.rotation.x = 0.04 + pitch;
              }
            } else {
              if (this.rightPistol) {
                this.rightPistol.position.z = -0.32 + kick;
                this.rightPistol.rotation.x = 0.04 + pitch;
              }
            }
          }
        } else if (this.type === 'SHOTGUN') {
          if (this.fireCooldown > 0) {
            const progress = 1.0 - (this.fireCooldown / this.fireRate);
            if (progress < 0.15) {
              const recoilT = progress / 0.15;
              animOffsetPos.z = -0.12 * Math.sin(recoilT * Math.PI);
              animOffsetRot.x = 0.22 * Math.sin(recoilT * Math.PI);
            } else if (progress > 0.3 && progress < 0.7) {
              const pumpP = (progress - 0.3) / 0.4;
              const tilt = Math.sin(pumpP * Math.PI);
              animOffsetRot.x = -0.06 * tilt;
              animOffsetPos.y = -0.01 * tilt;
            }
          }
        } else if (this.type === 'FISTS') {
          if (this.leftFist) {
            this.leftFist.position.set(-0.32, -0.36, -0.45);
            this.leftFist.rotation.set(0.15, 0.6, 0.15);
          }
          if (this.rightFist) {
            this.rightFist.position.set(0.32, -0.36, -0.45);
            this.rightFist.rotation.set(0.15, -0.6, -0.15);
          }

          if (this.fireCooldown > 0) {
            const progress = 1.0 - (this.fireCooldown / this.fireRate);
            const thrust = Math.sin(progress * Math.PI);
            
            const thrustZ = -0.55 * thrust;
            const thrustX = 0.24 * thrust;
            const thrustY = 0.22 * thrust;
            const rotY = 0.25 * thrust;
            const rotX = 0.15 * thrust;

            if (this.lastFiredLeftFist) {
              if (this.leftFist) {
                this.leftFist.position.set(-0.32 + thrustX, -0.36 + thrustY, -0.45 + thrustZ);
                this.leftFist.rotation.set(0.15 + rotX, -0.6 + rotY, 0.15);
              }
            } else {
              if (this.rightFist) {
                this.rightFist.position.set(0.32 - thrustX, -0.36 + thrustY, -0.45 + thrustZ);
                this.rightFist.rotation.set(0.15 + rotX, 0.6 - rotY, -0.15);
              }
            }
          }
        } else if (this.type === 'KARAMBIT') {
          if (this.karambitMesh) {
            if (this.isAiming) {
              // Inspect spin: keep X/Y tilt, spin Z
              const spinAngle = performance.now() * 0.015;
              this.karambitMesh.rotation.set(0.3, 0.2, -0.4 + spinAngle);
            } else {
              // Rest rotation
              this.karambitMesh.rotation.set(0.3, 0.2, -0.4);
            }
          }

          if (this.fireCooldown > 0) {
            // Snappy stab/thrust animation: 0.04s instant thrust, 0.96s recover
            const progress = 1.0 - (this.fireCooldown / this.fireRate);
            const thrustDuration = 0.04;
            if (progress < thrustDuration) {
              const p = progress / thrustDuration;
              // Rapid thrust forward
              animOffsetPos.z = -0.35 * p;
              animOffsetPos.y = 0.06 * p;
              animOffsetPos.x = -0.06 * p;
              animOffsetRot.x = 0.3 * p;
              animOffsetRot.y = -0.12 * p;
            } else {
              const p = (progress - thrustDuration) / (1.0 - thrustDuration);
              // Cubic ease-out recovery for a very natural pullback
              const ease = Math.pow(1.0 - p, 3);
              animOffsetPos.z = -0.35 * ease;
              animOffsetPos.y = 0.06 * ease;
              animOffsetPos.x = -0.06 * ease;
              animOffsetRot.x = 0.3 * ease;
              animOffsetRot.y = -0.12 * ease;
            }
          }
        } else if (this.type === 'RIFLE') {
          if (this.fireCooldown > 0) {
            const progress = 1.0 - (this.fireCooldown / this.fireRate);
            const kick = Math.sin(progress * Math.PI) * -0.015;
            animOffsetPos.z = kick;
            animOffsetRot.x = Math.sin(progress * Math.PI) * 0.025;
          }
        }
      }

      // Add animation offsets
      targetPos.add(animOffsetPos);
      targetRot.x += animOffsetRot.x;
      targetRot.y += animOffsetRot.y;
      targetRot.z += animOffsetRot.z;

      // Use a much faster lerp speed during the thrust phase of the Karambit melee attack
      let lerpSpeed = 16;
      if (this.type === 'KARAMBIT' && this.fireCooldown > 0) {
        const progress = 1.0 - (this.fireCooldown / this.fireRate);
        if (progress < 0.15) {
          lerpSpeed = 60; // Snaps forward instantly
        } else {
          lerpSpeed = 20; // Smooth but snappy recovery
        }
      }

      this.weaponGroup.position.lerp(targetPos, Math.min(1, dt * lerpSpeed));
      this.weaponGroup.quaternion.slerp(new THREE.Quaternion().setFromEuler(targetRot), Math.min(1, dt * lerpSpeed));

      // Dim muzzle flashes
      if (this.type === 'PISTOLS') {
        if (this.leftMuzzleFlash && this.leftMuzzleFlash.intensity > 0) {
          this.leftMuzzleFlash.intensity = Math.max(0, this.leftMuzzleFlash.intensity - dt * 45.0);
        }
        if (this.rightMuzzleFlash && this.rightMuzzleFlash.intensity > 0) {
          this.rightMuzzleFlash.intensity = Math.max(0, this.rightMuzzleFlash.intensity - dt * 45.0);
        }
      } else {
        if (this.muzzleFlash && this.muzzleFlash.intensity > 0) {
          this.muzzleFlash.intensity = Math.max(0, this.muzzleFlash.intensity - dt * 45.0);
        }
      }
    }

    return { didShoot, ammo: this.ammo, ammoReserve: this.ammoReserve, isReloading: this.isReloading, isAiming: this.isAiming, type: this.type };
  }
}
