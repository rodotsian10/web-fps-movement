// ============================================================
// player.js  –  Player (physics, camera, grapple visuals)
// ============================================================
import { AABB } from './physics.js';
import { Weapon } from './weapon.js';
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const STAND_HEIGHT     = 1.8;
const PLAYER_WIDTH     = 0.4;
const PLAYER_DEPTH     = 0.4;
const EYE_OFFSET_STAND = 0.7;
const EYE_OFFSET_SLIDE = -0.3;

export class Player {
  constructor(physics, fpsCam, movCtrl, scene) {
    this.physics = physics;
    this.cam     = fpsCam;
    this.mov     = movCtrl;
    this.scene   = scene;

    this.box = new AABB(0, STAND_HEIGHT / 2 + 0.05, 0, PLAYER_WIDTH, STAND_HEIGHT / 2, PLAYER_DEPTH);

    this.eyeHeight  = EYE_OFFSET_STAND;
    this.targetEyeH = EYE_OFFSET_STAND;
    this.prevVY     = 0;
    this._lastGrounded = false;

    this.weapon = new Weapon(fpsCam);

    // Grapple line visual
    this.grappleLine = null;
    this._createGrappleLine();

    this.reset();
  }



  _createGrappleLine() {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(6); // 2 points × 3 coords
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.8,
      linewidth: 2,
    });
    this.grappleLine = new THREE.Line(geo, mat);
    this.grappleLine.visible = false;
    this.grappleLine.frustumCulled = false;
    this.scene.add(this.grappleLine);
  }

  reset() {
    this.box.cx = 0;
    this.box.cy = STAND_HEIGHT / 2 + 0.5;
    this.box.cz = 0;
    this.mov.velocity.set(0, 0, 0);
    this.mov.isGrappling = false;
    this.mov.slideTime = 0;
    this.mov.slideCooldown = 0;
    this.mov.dashTimer = 0;
    this.mov.dashCooldown = 0;
    this.grappleLine.visible = false;

    this.weapon.reset();
  }

  startFiring() { this.weapon.startFiring(); }
  stopFiring() { this.weapon.stopFiring(); }
  startAiming() { this.weapon.startAiming(); }
  stopAiming() { this.weapon.stopAiming(); }
  reload() { this.weapon.reload(); }

  update(dt, movResult) {
    const { velocity, state, didLand, didSlideCancel,
            grappleActive, grappleTarget, hSpeed: hs } = movResult;

    const sliding = state === 'SLIDE';

    // Pass info for movement system
    movResult._prevVY  = this.prevVY;
    movResult._playerY = this.box.cy - this.box.hh; // feet Y

    // Collider height remains constant at standing height
    this.box.hh = STAND_HEIGHT / 2;

    // ── Physics move ──
    const physResult = this.physics.move(
      this.box,
      velocity.x * dt,
      velocity.y * dt,
      velocity.z * dt
    );

    // ── Landing effects ──
    if (physResult.grounded && !this._lastGrounded) {
      const impact = Math.abs(this.prevVY);
      if (impact > 4) {
        this.cam.shake(Math.min((impact - 4) / 14, 1.0));
        const flash = document.getElementById('landing-flash');
        if (flash && impact > 6) {
          flash.style.opacity = Math.min((impact - 4) / 20, 0.3).toFixed(2);
          setTimeout(() => flash.style.opacity = 0, 100);
        }
      }
    }

    // Slide cancel flash
    if (didSlideCancel) {
      this.cam.shake(0.5);
      const flash = document.getElementById('landing-flash');
      if (flash) {
        flash.style.background = 'rgba(255, 107, 53, 0.08)';
        flash.style.opacity = '0.4';
        setTimeout(() => { flash.style.opacity = 0; flash.style.background = ''; }, 120);
      }
    }

    // Dash flash and shake
    if (movResult.didDash) {
      this.cam.shake(0.4);
      const flash = document.getElementById('landing-flash');
      if (flash) {
        flash.style.background = 'rgba(255, 107, 53, 0.1)';
        flash.style.opacity = '0.35';
        setTimeout(() => { flash.style.opacity = 0; flash.style.background = ''; }, 100);
      }
    }

    // Weapon Logic
    const weaponState = this.weapon.update(dt, hs);

    // ── Eye height ──
    this.targetEyeH = sliding ? EYE_OFFSET_SLIDE : EYE_OFFSET_STAND;
    this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, this.targetEyeH, Math.min(1, dt * 16));

    // ── Camera position ──
    this.cam.pivot.position.set(
      this.box.cx,
      this.box.cy + this.eyeHeight,
      this.box.cz
    );

    // ── Camera effects ──
    const C = this.mov.C;
    const maxRefSpeed = C.SPRINT_SPEED * 2.5;
    this.cam.setSpeedFOV(hs, maxRefSpeed, C.BASE_FOV, C.FOV_MAX_BOOST);

    // Slide tilt
    this.cam.setTilt(sliding ? 0.14 : 0);

    // Grapple zoom
    this.cam.setGrappleZoom(grappleActive);

    // Head bob (not during grapple or ads)
    this.cam.updateBob(hs, physResult.grounded && !sliding && !this.isAiming, dt);

    // ── Grapple line visual ──
    if (grappleActive) {
      this.grappleLine.visible = true;
      const pos = this.grappleLine.geometry.attributes.position.array;
      // Start: player position (slightly in front)
      pos[0] = this.box.cx; pos[1] = this.box.cy + this.eyeHeight * 0.5; pos[2] = this.box.cz;
      // End: grapple target
      pos[3] = grappleTarget.x; pos[4] = grappleTarget.y; pos[5] = grappleTarget.z;
      this.grappleLine.geometry.attributes.position.needsUpdate = true;
    } else {
      this.grappleLine.visible = false;
    }

    // ── Speed lines ──
    const sl = document.getElementById('speedlines');
    if (sl) {
      const t = Math.max(0, (hs - C.SPRINT_SPEED * 0.8) / (C.SPRINT_SPEED * 1.2));
      sl.style.opacity = Math.min(t * 0.7, 0.7).toFixed(2);
    }

    // ── Crosshair ──
    const ch = document.getElementById('crosshair');
    if (ch) {
      if (grappleActive) ch.className = 'grappling';
      else if (sliding) ch.className = 'sliding';
      else if (this.isAiming) ch.className = 'ads';
      else ch.className = '';
    }

    this.prevVY = velocity.y;
    this._lastGrounded = physResult.grounded;

    return {
      physResult,
      ...weaponState
    };
  }

  get position() {
    return new THREE.Vector3(this.box.cx, this.box.cy, this.box.cz);
  }
}
