// ============================================================
// camera.js  –  FPS camera (no wall-run roll)
// ============================================================
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

import { addGameListener } from './reload.js';

export class FPSCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);

    this.yaw   = 0;
    this.pitch = 0;
    this.mouseSensitivity = 0.0017;

    this.fov       = 75;
    this.targetFov = 75;
    this.adsZoom   = 0;
    this.targetAdsZoom = 0;

    this.tiltZ      = 0;
    this.targetTilt = 0;

    this.shakeMag   = 0;
    this.shakeDecay = 0.80;

    this.bobPhase  = 0;
    this.bobAmount = 0;

    this.grappleZoomFov = 0;

    this.pivot = new THREE.Object3D();
    this.pivot.add(this.camera);

    this._yawQuat   = new THREE.Quaternion();
    this._pitchQuat = new THREE.Quaternion();
    this._UP    = new THREE.Vector3(0, 1, 0);
    this._RIGHT = new THREE.Vector3(1, 0, 0);

    addGameListener(document, 'mousemove', (e) => this._onMouse(e));
    addGameListener(window, 'resize', () => this._onResize());
  }

  _onMouse(e) {
    if (!document.pointerLockElement) return;
    const sensScale = this.targetAdsZoom > 0 ? 0.45 : 1.0;
    const sens = this.mouseSensitivity * sensScale;
    this.yaw   -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch  = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, this.pitch));
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  shake(strength) {
    this.shakeMag = Math.min(this.shakeMag + strength * 0.22, 0.35);
  }

  setSpeedFOV(speed, maxRefSpeed, baseFOV, fovBoost = 22) {
    const t = Math.min(speed / maxRefSpeed, 1.0);
    const curve = t * t * (3 - 2 * t);
    this.targetFov = baseFOV + curve * fovBoost - this.grappleZoomFov - this.adsZoom;
  }

  setTilt(tilt) { this.targetTilt = tilt; }

  setGrappleZoom(active) { this.grappleZoomFov = active ? 6 : 0; }

  setADS(active, zoomValue = 25) {
    this.targetAdsZoom = active ? zoomValue : 0;
  }

  updateBob(speed, isGrounded, dt) {
    if (isGrounded && speed > 0.5) {
      const freq = 0.45 + speed * 0.04;
      this.bobPhase += dt * speed * freq;
      const maxBob = 0.022 * Math.min(speed / 12, 1.0);
      this.bobAmount = THREE.MathUtils.lerp(this.bobAmount, maxBob, Math.min(1, dt * 9));
    } else {
      this.bobAmount = THREE.MathUtils.lerp(this.bobAmount, 0, Math.min(1, dt * 12));
    }
  }

  update(dt) {
    this.adsZoom = THREE.MathUtils.lerp(this.adsZoom, this.targetAdsZoom, Math.min(1, dt * 10));
    this.fov = THREE.MathUtils.lerp(this.fov, this.targetFov, Math.min(1, dt * 10));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();

    this._yawQuat.setFromAxisAngle(this._UP, this.yaw);
    this._pitchQuat.setFromAxisAngle(this._RIGHT, this.pitch);
    this.pivot.quaternion.copy(this._yawQuat);
    this.camera.quaternion.copy(this._pitchQuat);

    // Slide tilt only
    this.tiltZ = THREE.MathUtils.lerp(this.tiltZ, this.targetTilt, Math.min(1, dt * 14));
    this.camera.rotation.z = this.tiltZ;

    let cx = 0, cy = 0;
    if (this.shakeMag > 0.0005) {
      cx = (Math.random() - 0.5) * 2 * this.shakeMag;
      cy = (Math.random() - 0.5) * 2 * this.shakeMag;
      this.shakeMag *= this.shakeDecay;
      if (this.shakeMag < 0.0005) this.shakeMag = 0;
    }

    const bobY = Math.sin(this.bobPhase) * this.bobAmount;
    const bobX = Math.cos(this.bobPhase * 0.5) * this.bobAmount * 0.35;
    this.camera.position.set(bobX + cx, bobY + cy, 0);
  }

  getForward() {
    const d = new THREE.Vector3(0, 0, -1);
    d.applyQuaternion(this._yawQuat);
    return d;
  }

  getRight() {
    const d = new THREE.Vector3(1, 0, 0);
    d.applyQuaternion(this._yawQuat);
    return d;
  }

  getLookDir() {
    const d = new THREE.Vector3(0, 0, -1);
    const q = new THREE.Quaternion();
    q.multiplyQuaternions(this._yawQuat, this._pitchQuat);
    d.applyQuaternion(q);
    return d;
  }
}
