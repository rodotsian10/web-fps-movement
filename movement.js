// ============================================================
// movement.js  –  HyperShot movement (no wall-run, real bhop)
//
// REAL BUNNY HOP:
//   Ground has friction → standing still slows you
//   Air has ZERO friction → speed preserved
//   accelerate() adds speed only in wish direction
//   Air-strafe: strafe perpendicular to velocity = free speed gain
//   Bhop = land → instantly jump → skip ground friction → keep speed
//   Speed builds NATURALLY through physics, not artificial bonuses
// ============================================================
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { addGameListener } from './reload.js';

// ── TUNING ──────────────────────────────────────────────────
export const CONSTANTS = {

  // ── Ground Movement
  WALK_SPEED:           9.0,
  SPRINT_SPEED:         16.5,
  ACCEL_GROUND:         135.0,   // near-instant ground acceleration for Walk
  ACCEL_SPRINT:         30.0,    // smooth sprint acceleration
  DECEL_MOMENTUM:       18.0,    // speed decay from slides down to sprint speed

  // ── Air Movement (Predictable, controlled momentum)
  ACCEL_AIR:            22.5,    // moderate air control
  MAX_AIR_SPEED:        40.0,

  // ── Jump & Gravity (Heavy, snappy, fast fall)
  GRAVITY:              65.0,
  JUMP_FORCE:           24.0,
  COYOTE_TIME:          0.10,
  JUMP_BUFFER:          0.15,

  // ── Slide
  SLIDE_BUFFER:         0.12,   // 공중에서 C키 눌러도 착지 직후 슬라이드 가능한 버퍼 시간
  SLIDE_COOLDOWN:       1.2,
  SLIDE_ENTRY_BOOST:    1.15,    // 15% speed boost on slide entry
  SLIDE_FRICTION:       0.25,    // very low friction for momentum preservation
  SLIDE_SPEED_MIN:      9.0,     // end slide when speed drops below WALK_SPEED (9.0)
  SLIDE_MAX_SPEED:      52.5,
  SLIDE_DURATION:       0.8,

  // ── Slide Cancel (slide → jump)
  SLIDE_CANCEL_VERT:    1.15,    // vertical lift boost on slide jump
  SLIDE_CANCEL_WINDOW:  0.45,

  // ── Dash
  DASH_SPEED:           26.0,
  DASH_DURATION:        0.15,
  DASH_COOLDOWN:        1.2,

  // ── Grapple Hook
  GRAPPLE_SPEED:        35.0,
  GRAPPLE_MAX_DIST:     120.0,
  GRAPPLE_COOLDOWN:     1.8,
  GRAPPLE_ARRIVE_DIST:  3.0,
  GRAPPLE_JUMP_BOOST:   1.3,
  GRAPPLE_ARC:          0.25,
  GRAPPLE_MAX_HOLD_TIME: 0.5,   // 그래플 최대 유지시간 (초)
  GRAPPLE_TIME_LIMIT_ENABLED: true, // 그래플 시간 제한 on/off

  // ── Camera
  BASE_FOV:             75,
  FOV_MAX_BOOST:        22,
  DIAGONAL_CORRECTION:  true,
};

export const STATE = {
  IDLE:     'IDLE',
  WALK:     'WALK',
  SPRINT:   'SPRINT',
  SLIDE:    'SLIDE',
  AIR:      'AIR',
  DASH:     'DASH',
  GRAPPLE:  'GRAPPLE',
};

// ── Quake-style accelerate ──────────────────────────────────
// This is THE function that makes real bunny hopping work.
// It only adds speed along wishDir up to wishSpeed.
// When strafing perpendicular to velocity, currentSpeed ≈ 0,
// so you always get the full acceleration → speed builds.
function accelerate(vel, wishDir, wishSpeed, accel, dt) {
  const currentSpeed = vel.x * wishDir.x + vel.z * wishDir.z;
  const addSpeed = wishSpeed - currentSpeed;
  if (addSpeed <= 0) return;
  const accelSpeed = Math.min(accel * wishSpeed * dt, addSpeed);
  vel.x += wishDir.x * accelSpeed;
  vel.z += wishDir.z * accelSpeed;
}

// ── Friction ────────────────────────────────────────────────
function applyFriction(vel, friction, dt) {
  const sp = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
  if (sp < 0.1) { vel.x = vel.z = 0; return; }
  // Use a minimum control speed for friction calculation to prevent slidey slow-down tails
  const control = Math.max(sp, 5.0);
  const drop = control * friction * dt;
  const s = Math.max(sp - drop, 0) / sp;
  vel.x *= s; vel.z *= s;
}

function hSpeed(vel) {
  return Math.sqrt(vel.x * vel.x + vel.z * vel.z);
}

// ─────────────────────────────────────────────────────────────
export class MovementController {
  constructor(C = CONSTANTS) {
    this.C = C;

    this.keys = {
      forward: false, backward: false,
      left: false,    right: false,
      sprint: false,
    };

    this.velocity = new THREE.Vector3();
    this.state    = STATE.IDLE;
    this.wasGrounded = false;

    // Jump
    this.jumpBufferTimer = 0;
    this.coyoteTimer     = 0;

    // Slide
    this.slideTime = 0;
    this.slideCooldown = 0;
    this.slideBuffer = 0;   // 공중 slide 입력 버퍼

    // Dash
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.dashDir = new THREE.Vector3();

    // Grapple
    this.grappleCooldown = 0;
    this.isGrappling     = false;
    this.grappleTarget   = new THREE.Vector3();
    this.grappleDir      = new THREE.Vector3();
    this.grappleHoldTimer = 0;  // 그래플 유지시간 추적

    // Landing Recovery
    this.landingDecelTimer = 0;
    this.wasGrappleOrDash  = false;

    // Combo
    this.comboStack   = [];
    this.comboTimeout = 0;
    this._comboReported = false;

    // Speed tracking
    this.maxSpeedReached = 0;

    // Raw input flags
    this._jumpPressed        = false;
    this._slidePressedThisFrame = false;
    this._dashPressed        = false;
    this._grappleDown        = false;
    this._logSlideFrame      = false;

    addGameListener(document, 'keydown', (e) => this._keyDown(e));
    addGameListener(document, 'keyup',   (e) => this._keyUp(e));
  }

  _keyDown(e) {
    if (!document.pointerLockElement) return;
    switch (e.code) {
      case 'KeyW':       this.keys.forward  = true;  break;
      case 'KeyS':       this.keys.backward = true;  break;
      case 'KeyA':       this.keys.left     = true;  break;
      case 'KeyD':       this.keys.right    = true;  break;
      case 'ShiftLeft':  this.keys.sprint   = true;  break;
      case 'Space':
        if (!e.repeat) this._jumpPressed = true;
        break;
      case 'KeyC':
        if (!e.repeat) {
          this._slidePressedThisFrame = true;
          this._logSlideFrame = true;
        }
        break;
      case 'KeyQ':
        if (!e.repeat) this._dashPressed = true;
        break;
      case 'KeyE':
        this._grappleDown = true;
        break;
    }
  }

  _keyUp(e) {
    switch (e.code) {
      case 'KeyW':       this.keys.forward  = false; break;
      case 'KeyS':       this.keys.backward = false; break;
      case 'KeyA':       this.keys.left     = false; break;
      case 'KeyD':       this.keys.right    = false; break;
      case 'ShiftLeft':  this.keys.sprint   = false; break;
      case 'KeyE':
        this._grappleDown = false;
        break;
    }
  }

  // ── Combo ──
  detectCombo() {
    if (this._comboReported) return null;
    const s = this.comboStack.join('-');
    let combo = null;
    if (s.includes('GRAPPLE-DASH'))             combo = '⚡ SLINGSHOT';
    if (s.includes('DASH-SLIDECANCEL'))         combo = '☄️ METEOR LAUNCH';
    if (s.includes('SLIDE-SLIDECANCEL'))         combo = '🚀 SLIDE CANCEL';
    if (s.includes('GRAPPLE-SLIDECANCEL'))       combo = '🔥 GRAPPLE LAUNCH';
    if (combo) this._comboReported = true;
    return combo;
  }

  pushCombo(action) {
    this.comboStack.push(action);
    this.comboTimeout = 2.0;
  }

  // ─────────────────────────────────────────────────────────
  // MAIN UPDATE
  // ─────────────────────────────────────────────────────────
  update(dt, fpsCam, physResult, grappleRayResult) {
    const C = this.C;
    let { grounded, hitCeiling } = physResult;
    const justLanded     = grounded && !this.wasGrounded;
    const justLeftGround = !grounded && this.wasGrounded;

    // ── Timers ──
    if (this.grappleCooldown > 0) this.grappleCooldown -= dt;
    if (this.jumpBufferTimer > 0) this.jumpBufferTimer -= dt;
    if (this.comboTimeout    > 0) this.comboTimeout    -= dt;
    else { this.comboStack = []; this._comboReported = false; }
    if (this.slideCooldown   > 0) this.slideCooldown   -= dt;
    if (this.slideBuffer     > 0) this.slideBuffer     -= dt;
    if (this.dashCooldown    > 0) this.dashCooldown    -= dt;
    if (this.dashTimer       > 0) this.dashTimer       -= dt;
    if (this.landingDecelTimer > 0) this.landingDecelTimer -= dt;

    // Coyote time
    if (justLeftGround && this.velocity.y <= 0.1) {
      this.coyoteTimer = C.COYOTE_TIME;
    }
    if (this.coyoteTimer > 0) this.coyoteTimer -= dt;

    // Jump buffer
    if (this._jumpPressed) {
      this.jumpBufferTimer = C.JUMP_BUFFER;
      this._jumpPressed = false;
    }

    // Slide buffer (공중에서 C 눌렀을 때 착지 직후 슬라이드 가능)
    if (this._slidePressedThisFrame) {
      this.slideBuffer = C.SLIDE_BUFFER;
    }

    // Ceiling collision
    if (hitCeiling && this.velocity.y > 0) this.velocity.y = 0;

    // ── Input Flags ──

    const dPressed = this._dashPressed;
    this._dashPressed = false;

    // ── Camera directions ──
    const fwd   = fpsCam.getForward();
    const right = fpsCam.getRight();

    // ── Wish direction ──
    let mx = (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0);
    let mz = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0);
    if (C.DIAGONAL_CORRECTION && mx !== 0 && mz !== 0) {
      const inv = 1 / Math.SQRT2;
      mx *= inv; mz *= inv;
    }
    const wishDir = new THREE.Vector3(
      right.x * mx + fwd.x * mz, 0,
      right.z * mx + fwd.z * mz,
    );
    const wishLen = wishDir.length();
    if (wishLen > 0.001) wishDir.divideScalar(wishLen);
    const hasInput = wishLen > 0.001;

    if (this._logSlideFrame) {
      this._groundedCaptured = grounded;
      this._hasInputCaptured = hasInput;
      this._keysSprintCaptured = this.keys.sprint;
      this._slidePressedCaptured = this._slidePressedThisFrame;
      this._currentStateCaptured = this.state;
    }

    // Slide time
    if (this.state === STATE.SLIDE) this.slideTime += dt;
    else if (grounded) this.slideTime = 0;

    // Result flags
    let didLand        = false;
    let didSlideCancel = false;
    let didDash        = false;
    let grappleActive  = false;

    // ═══════════════════════════════════════════════════
    // 1. DASH (High priority)
    // ═══════════════════════════════════════════════════
    if (dPressed && !this.isGrappling && this.dashCooldown <= 0 && this.state !== STATE.DASH) {
      this.state = STATE.DASH;
      this.dashTimer = C.DASH_DURATION;
      this.dashCooldown = C.DASH_COOLDOWN;
      
      // Dash in movement direction, or forward if no input
      if (hasInput) {
        this.dashDir.copy(wishDir);
      } else {
        this.dashDir.copy(fwd);
        this.dashDir.y = 0;
        this.dashDir.normalize();
      }
      this.velocity.x = this.dashDir.x * C.DASH_SPEED;
      this.velocity.z = this.dashDir.z * C.DASH_SPEED;
      this.velocity.y = 0; // horizontal dash ignores gravity
      this.pushCombo('DASH');
      didDash = true;
    }

    if (this.state === STATE.DASH) {
      this.wasGrappleOrDash = true;
      if (this.dashTimer <= 0) {
        // Exit dash state
        this.state = grounded ? (this.keys.sprint ? STATE.SPRINT : STATE.WALK) : STATE.AIR;
      } else {
        // Maintain dash velocity
        this.velocity.x = this.dashDir.x * C.DASH_SPEED;
        this.velocity.z = this.dashDir.z * C.DASH_SPEED;
        this.velocity.y = 0;
        grappleActive = false; // Grapple canceled by active dash
        this.isGrappling = false;
      }
    }

    // ═══════════════════════════════════════════════════
    // 2. GRAPPLE HOOK
    // ═══════════════════════════════════════════════════
    if (this.state !== STATE.DASH) {
      if (this._grappleDown && !this.isGrappling && this.grappleCooldown <= 0
          && grappleRayResult && grappleRayResult.hit) {
        this.isGrappling = true;
        this.grappleHoldTimer = 0; // 유지시간 초기화
        this.grappleTarget.set(
          grappleRayResult.point.x,
          grappleRayResult.point.y,
          grappleRayResult.point.z
        );
        this.grappleCooldown = C.GRAPPLE_COOLDOWN;
        this.pushCombo('GRAPPLE');
      }

      if (this.isGrappling) {
        this.wasGrappleOrDash = true;
        this.grappleHoldTimer += dt; // 유지시간 누적

        const px = this.grappleTarget.x;
        const py = this.grappleTarget.y;
        const pz = this.grappleTarget.z;
        this.grappleDir.set(
          px - fpsCam.pivot.position.x,
          py - fpsCam.pivot.position.y,
          pz - fpsCam.pivot.position.z
        );
        const dist = this.grappleDir.length();

        // 그래플 시간 제한 체크
        const timeLimitReached = C.GRAPPLE_TIME_LIMIT_ENABLED
          && this.grappleHoldTimer >= C.GRAPPLE_MAX_HOLD_TIME;

        if (dist < C.GRAPPLE_ARRIVE_DIST || (grounded && dist < C.GRAPPLE_ARRIVE_DIST * 2) || timeLimitReached) {
          this.isGrappling = false;
        } else {
          this.grappleDir.divideScalar(dist);
          this.velocity.x = this.grappleDir.x * C.GRAPPLE_SPEED;
          this.velocity.y = this.grappleDir.y * C.GRAPPLE_SPEED + C.GRAPPLE_ARC * C.GRAPPLE_SPEED;
          this.velocity.z = this.grappleDir.z * C.GRAPPLE_SPEED;
          grappleActive = true;

          // Grapple-cancel jump — height boost, keep horizontal velocity as is
          if (this.jumpBufferTimer > 0) {
            this.isGrappling = false;
            this.jumpBufferTimer = 0;
            this.velocity.y = Math.max(this.velocity.y, C.JUMP_FORCE * 1.1);
            this.pushCombo('GRAPPLECANCEL');
          }

          if (!this._grappleDown) {
            this.isGrappling = false;
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════
    // 3. LANDING
    // ═══════════════════════════════════════════════════
    if (justLanded && !this.isGrappling && this.state !== STATE.DASH) {
      didLand = true;
      this.velocity.y = 0;
      if (this.wasGrappleOrDash && hSpeed(this.velocity) > C.SPRINT_SPEED) {
        this.landingDecelTimer = 0.4;
      }
      this.wasGrappleOrDash = false;
    }

    // ═══════════════════════════════════════════════════
    // 4. JUMP / SLIDE-CANCEL JUMP
    // ═══════════════════════════════════════════════════
    if (this.state !== STATE.DASH && !this.isGrappling) {
      const canJumpNow = (grounded || this.coyoteTimer > 0);

      if (canJumpNow && this.jumpBufferTimer > 0) {
        const isSliding = this.state === STATE.SLIDE;

        if (isSliding) {
          // Slide cancel jump — height boost, keep horizontal velocity
          this.velocity.y = C.JUMP_FORCE * C.SLIDE_CANCEL_VERT;
          didSlideCancel = true;
          this.pushCombo('SLIDECANCEL');
          this.slideCooldown = C.SLIDE_COOLDOWN;
        } else {
          // Normal jump
          this.velocity.y = C.JUMP_FORCE;
        }
        this.jumpBufferTimer = 0;
        this.coyoteTimer = 0;
        grounded = false; // Skip ground physics for this frame
      }
    }

    // ═══════════════════════════════════════════════════
    // 5. STATE MACHINE (Only if not in Dash or Grapple)
    // ═══════════════════════════════════════════════════
    if (this.state !== STATE.DASH && !this.isGrappling) {
      if (!grounded) {
        this.state = STATE.AIR;
      } else if (this.state === STATE.SLIDE) {
        const hs2 = hSpeed(this.velocity);
        const slidePressed = this._slidePressedThisFrame;
        this._slidePressedThisFrame = false;

        if (slidePressed) {
          // Cancel slide instantly -> Sprint or Walk
          this.state = this.keys.sprint ? STATE.SPRINT : STATE.WALK;
          this.slideCooldown = C.SLIDE_COOLDOWN;
          this.slideBuffer = 0; // Clear buffer so we don't re-trigger slide
        } else if (this.slideTime > C.SLIDE_DURATION || hs2 < C.SLIDE_SPEED_MIN) {
          // Natural slide end -> Sprint or Walk
          this.state = (this.keys.sprint && hasInput) ? STATE.SPRINT : STATE.WALK;
          this.slideCooldown = C.SLIDE_COOLDOWN;
        }
      } else {
        this._slidePressedThisFrame = false;

        // Ground states — slide buffer도 체크 (공중에서 눌렀어도 착지 직후 슬라이드 가능)
        const slideTriggered = this.slideBuffer > 0;
        if (slideTriggered) {
          // Slide trigger conditions: grounded, sprinting, wishDir input required, and cooldown ready
          if ((this.state === STATE.SPRINT || this.keys.sprint) && hasInput && this.slideCooldown <= 0) {
            this.state = STATE.SLIDE;
            this.slideTime = 0;
            this.slideBuffer = 0; // 버퍼 소모
            
            // Speed boost: 1.15x current speed
            const currentSp = hSpeed(this.velocity);
            const slideSp = Math.max(currentSp * C.SLIDE_ENTRY_BOOST, C.SPRINT_SPEED * C.SLIDE_ENTRY_BOOST);
            this.velocity.x = wishDir.x * slideSp;
            this.velocity.z = wishDir.z * slideSp;
            this.pushCombo('SLIDE');
          }
        }

        // Evaluate active state if not sliding
        if (this.state !== STATE.SLIDE) {
          if (this.keys.sprint && hasInput) {
            this.state = STATE.SPRINT;
          } else if (hasInput) {
            this.state = STATE.WALK;
          } else {
            this.state = STATE.IDLE;
          }
        }
      }
    } else if (this.isGrappling) {
      this.state = STATE.GRAPPLE;
    }

    // ═══════════════════════════════════════════════════
    // 6. VELOCITY COMPUTATION (Only if not Dash or Grapple)
    // ═══════════════════════════════════════════════════
    if (this.state !== STATE.DASH && !grappleActive) {
      if (this.state === STATE.SLIDE) {
        // Slide: low friction, 90% momentum + 10% steering
        applyFriction(this.velocity, C.SLIDE_FRICTION, dt);
        const newSpeed = hSpeed(this.velocity);
        
        if (hasInput) {
          // Blend 90% current velocity with 10% target wish direction
          this.velocity.x = this.velocity.x * 0.9 + wishDir.x * newSpeed * 0.1;
          this.velocity.z = this.velocity.z * 0.9 + wishDir.z * newSpeed * 0.1;
          
          // Re-normalize to preserve speed
          const sp = hSpeed(this.velocity);
          if (sp > 0.01) {
            this.velocity.x *= (newSpeed / sp);
            this.velocity.z *= (newSpeed / sp);
          }
        }
        
        const hs2 = hSpeed(this.velocity);
        if (hs2 > C.SLIDE_MAX_SPEED) {
          const s = C.SLIDE_MAX_SPEED / hs2;
          this.velocity.x *= s; this.velocity.z *= s;
        }
      } else if (this.state === STATE.AIR) {
        // Air: Moderate control, preserve momentum without constant lerping
        const speed = hSpeed(this.velocity);
        if (hasInput) {
          this.velocity.x += wishDir.x * C.ACCEL_AIR * dt;
          this.velocity.z += wishDir.z * C.ACCEL_AIR * dt;

          const newSpeed = hSpeed(this.velocity);
          const maxAllowed = Math.max(speed, C.SPRINT_SPEED);
          if (newSpeed > maxAllowed) {
            const ratio = maxAllowed / newSpeed;
            this.velocity.x *= ratio;
            this.velocity.z *= ratio;
          }
        }
      } else if (grounded && !didSlideCancel) {
        // Ground: Perfect Direction Alignment & Immediate response
        if (this.landingDecelTimer > 0) {
          const currentSp = hSpeed(this.velocity);
          const targetSp = this.state === STATE.SPRINT ? C.SPRINT_SPEED : C.WALK_SPEED;
          const newSpeed = THREE.MathUtils.lerp(currentSp, targetSp, dt * 7.5);
          
          if (hasInput) {
            this.velocity.x = wishDir.x * newSpeed;
            this.velocity.z = wishDir.z * newSpeed;
          } else {
            if (currentSp > 0.1) {
              const ratio = newSpeed / currentSp;
              this.velocity.x *= ratio;
              this.velocity.z *= ratio;
            } else {
              this.velocity.x = 0;
              this.velocity.z = 0;
            }
          }
        } else if (hasInput) {
          let targetSp = C.WALK_SPEED;
          if (this.state === STATE.SPRINT) targetSp = C.SPRINT_SPEED;

          const currentSp = hSpeed(this.velocity);
          let newSpeed;
          if (currentSp > targetSp) {
            // Decay high momentum (e.g. from slide cancel) back to target speed
            newSpeed = Math.max(currentSp - C.DECEL_MOMENTUM * dt, targetSp);
          } else {
            // Snappy ground acceleration
            const accelRate = (this.state === STATE.SPRINT) ? C.ACCEL_SPRINT : C.ACCEL_GROUND;
            newSpeed = Math.min(currentSp + accelRate * dt, targetSp);
          }

          // Set velocity vector perfectly along input direction (NO skating/slipping!)
          this.velocity.x = wishDir.x * newSpeed;
          this.velocity.z = wishDir.z * newSpeed;
        } else {
          // Instant stop when releasing keys
          this.velocity.x = 0;
          this.velocity.z = 0;
        }
      }
    }

    // ═══════════════════════════════════════════════════
    // 7. GRAVITY
    // ═══════════════════════════════════════════════════
    if (!grounded && !grappleActive && this.state !== STATE.DASH) {
      this.velocity.y -= C.GRAVITY * dt;
    } else if (grounded && !didSlideCancel && this.state !== STATE.DASH) {
      if (this.velocity.y < 0) this.velocity.y = 0;
    }

    // ═══════════════════════════════════════════════════
    // 8. OUTPUT
    // ═══════════════════════════════════════════════════
    const hSpeedNow = hSpeed(this.velocity);
    if (hSpeedNow > this.maxSpeedReached) this.maxSpeedReached = hSpeedNow;
    const comboName = this.detectCombo();
    this.wasGrounded = grounded;

    if (this._logSlideFrame) {
      const condGrounded = this._groundedCaptured;
      const condSprint = (this._currentStateCaptured === STATE.SPRINT || this._keysSprintCaptured);
      const condInput = this._hasInputCaptured;
      const condCooldown = (this.slideCooldown <= 0);
      
      console.log("[RUNTIME_SLIDE_FRAME]", {
        grounded: condGrounded,
        hasInput: condInput,
        "keys.sprint": this._keysSprintCaptured,
        slidePressed: this._slidePressedCaptured,
        "current state": this._currentStateCaptured,
        "next state": this.state,
        conditions: {
          grounded: condGrounded,
          sprintState: condSprint,
          hasInput: condInput,
          cooldownReady: condCooldown
        }
      });
      if (typeof window.sendLogToServer === 'function') {
        window.sendLogToServer('SLIDE_FRAME', {
          grounded: condGrounded,
          hasInput: condInput,
          "keys.sprint": this._keysSprintCaptured,
          slidePressed: this._slidePressedCaptured,
          "current state": this._currentStateCaptured,
          "next state": this.state,
          conditions: {
            grounded: condGrounded,
            sprintState: condSprint,
            hasInput: condInput,
            cooldownReady: condCooldown
          }
        });
      }
      if (this.state === STATE.SLIDE) {
        this._logSlideFrame = false;
      }
    }

    return {
      velocity:      this.velocity,
      state:         this.state,
      didSlideCancel,
      didDash,
      dashReady:     this.dashCooldown <= 0,
      comboName,
      didLand,
      grappleActive: this.isGrappling,
      grappleTarget: this.grappleTarget,
      grappleReady:  this.grappleCooldown <= 0,
      hSpeed:        hSpeedNow,
      maxSpeed:      this.maxSpeedReached,
    };
  }
}
