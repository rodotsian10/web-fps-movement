// ============================================================
// physics.js  –  AABB collision, wall surface detection, raycast
// ============================================================

export class AABB {
  constructor(cx, cy, cz, hw, hh, hd) {
    this.cx = cx; this.cy = cy; this.cz = cz;
    this.hw = hw; this.hh = hh; this.hd = hd;
  }

  get minX() { return this.cx - this.hw; }
  get maxX() { return this.cx + this.hw; }
  get minY() { return this.cy - this.hh; }
  get maxY() { return this.cy + this.hh; }
  get minZ() { return this.cz - this.hd; }
  get maxZ() { return this.cz + this.hd; }

  overlaps(b) {
    return this.minX < b.maxX && this.maxX > b.minX &&
           this.minY < b.maxY && this.maxY > b.minY &&
           this.minZ < b.maxZ && this.maxZ > b.minZ;
  }

  penetration(b) {
    return {
      x: Math.min(this.maxX - b.minX, b.maxX - this.minX),
      y: Math.min(this.maxY - b.minY, b.maxY - this.minY),
      z: Math.min(this.maxZ - b.minZ, b.maxZ - this.minZ),
    };
  }

  center() { return { x: this.cx, y: this.cy, z: this.cz }; }
}

export class PhysicsWorld {
  constructor() {
    /** @type {AABB[]} */
    this.colliders = [];
  }

  addCollider(aabb) {
    this.colliders.push(aabb);
    return aabb;
  }

  removeCollider(aabb) {
    const idx = this.colliders.indexOf(aabb);
    if (idx !== -1) {
      this.colliders.splice(idx, 1);
    }
  }

  /**
   * Move player AABB by (dx,dy,dz) with split-axis collision resolution.
   */
  move(box, dx, dy, dz) {
    let grounded   = false;
    let hitCeiling = false;
    let wallNormalX = null;
    let wallNormalZ = null;

    // --- X axis ---
    box.cx += dx;
    for (const col of this.colliders) {
      if (!box.overlaps(col)) continue;
      if (box.minY >= col.maxY - 0.05 || box.maxY <= col.minY + 0.05) continue;
      if (dx > 0) { box.cx = col.minX - box.hw; wallNormalX = { x: -1, z: 0, col }; }
      else if (dx < 0) { box.cx = col.maxX + box.hw; wallNormalX = { x: 1, z: 0, col }; }
    }

    // --- Z axis ---
    box.cz += dz;
    for (const col of this.colliders) {
      if (!box.overlaps(col)) continue;
      if (box.minY >= col.maxY - 0.05 || box.maxY <= col.minY + 0.05) continue;
      if (dz > 0) { box.cz = col.minZ - box.hd; wallNormalZ = { x: 0, z: -1, col }; }
      else if (dz < 0) { box.cz = col.maxZ + box.hd; wallNormalZ = { x: 0, z: 1, col }; }
    }

    // --- Y axis ---
    box.cy += dy;
    for (const col of this.colliders) {
      if (!box.overlaps(col)) continue;
      
      const wasAbove = (box.cy - dy - box.hh) >= (col.maxY - 0.1);
      const wasBelow = (box.cy - dy + box.hh) <= (col.minY + 0.1);
      
      if (dy <= 0 && wasAbove) {
        box.cy = col.maxY + box.hh;
        grounded = true;
      } else if (dy > 0 && wasBelow) {
        box.cy = col.minY - box.hh;
        hitCeiling = true;
      }
    }

    // Check grounding with a tiny downward tolerance to prevent jittering on flat surfaces
    if (!grounded && dy <= 0.001) {
      // Shrink horizontally to avoid wall-hugging false positives
      const checkDown = new AABB(box.cx, box.cy - 0.02, box.cz, box.hw - 0.02, box.hh, box.hd - 0.02);
      for (const col of this.colliders) {
        if (checkDown.overlaps(col)) {
          if ((box.cy - box.hh) >= (col.maxY - 0.1)) {
            grounded = true;
            if (box.cy - box.hh < col.maxY + 0.02) {
              box.cy = col.maxY + box.hh;
            }
            break;
          }
        }
      }
    }

    // Combine wall normals
    let wallNormal = wallNormalX || wallNormalZ;

    return { box, grounded, hitCeiling, wallNormal };
  }

  /**
   * Probe for walls near the player (for wall-running).
   * Returns array of { normal: {x,z}, distance, col, side } sorted by distance.
   */
  probeWalls(box, radius) {
    const results = [];
    const probeBox = new AABB(box.cx, box.cy, box.cz,
      box.hw + radius, box.hh * 0.6, box.hd + radius);

    for (const col of this.colliders) {
      if (!probeBox.overlaps(col)) continue;

      // Check each face — only lateral faces (not top/bottom)
      const faces = [
        { dist: col.minX - box.maxX, nx: -1, nz: 0, side: 'left' },
        { dist: box.minX - col.maxX, nx:  1, nz: 0, side: 'right' },
        { dist: col.minZ - box.maxZ, nx:  0, nz: -1, side: 'front' },
        { dist: box.minZ - col.maxZ, nx:  0, nz:  1, side: 'back' },
      ];

      for (const f of faces) {
        // Must be close but not penetrating too deep
        if (f.dist > -0.1 && f.dist < radius) {
          // Check vertical overlap (player must be next to wall, not above/below)
          const yOverlap = Math.min(box.maxY, col.maxY) - Math.max(box.minY, col.minY);
          if (yOverlap > box.hh * 0.5) {
            results.push({
              normal:   { x: f.nx, z: f.nz },
              distance: Math.abs(f.dist),
              col,
              side:     f.side,
              wallTop:  col.maxY,
            });
          }
        }
      }
    }

    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  /**
   * Simple 3D raycast against AABB colliders.
   * Returns { hit: bool, point: {x,y,z}, distance, col, normal } or null.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 200) {
    let closest = null;
    let minT = maxDist;

    for (const col of this.colliders) {
      const t = this._rayAABB(ox, oy, oz, dx, dy, dz, col);
      if (t !== null && t > 0 && t < minT) {
        minT = t;
        const px = ox + dx * t;
        const py = oy + dy * t;
        const pz = oz + dz * t;

        // Determine hit normal
        const eps = 0.01;
        let nx = 0, ny = 0, nz = 0;
        if (Math.abs(px - col.minX) < eps) nx = -1;
        else if (Math.abs(px - col.maxX) < eps) nx = 1;
        else if (Math.abs(py - col.minY) < eps) ny = -1;
        else if (Math.abs(py - col.maxY) < eps) ny = 1;
        else if (Math.abs(pz - col.minZ) < eps) nz = -1;
        else if (Math.abs(pz - col.maxZ) < eps) nz = 1;

        closest = {
          hit: true,
          point: { x: px, y: py, z: pz },
          distance: t,
          col,
          normal: { x: nx, y: ny, z: nz },
        };
      }
    }
    return closest;
  }

  raycastAll(ox, oy, oz, dx, dy, dz, maxDist = 200) {
    const hits = [];

    for (const col of this.colliders) {
      const t = this._rayAABB(ox, oy, oz, dx, dy, dz, col);
      if (t !== null && t > 0 && t < maxDist) {
        const px = ox + dx * t;
        const py = oy + dy * t;
        const pz = oz + dz * t;

        const eps = 0.01;
        let nx = 0, ny = 0, nz = 0;
        if (Math.abs(px - col.minX) < eps) nx = -1;
        else if (Math.abs(px - col.maxX) < eps) nx = 1;
        else if (Math.abs(py - col.minY) < eps) ny = -1;
        else if (Math.abs(py - col.maxY) < eps) ny = 1;
        else if (Math.abs(pz - col.minZ) < eps) nz = -1;
        else if (Math.abs(pz - col.maxZ) < eps) nz = 1;

        hits.push({
          hit: true,
          point: { x: px, y: py, z: pz },
          distance: t,
          col,
          normal: { x: nx, y: ny, z: nz },
        });
      }
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits;
  }

  _rayAABB(ox, oy, oz, dx, dy, dz, box) {
    let tmin = -Infinity, tmax = Infinity;

    for (const [o, d, min, max] of [
      [ox, dx, box.minX, box.maxX],
      [oy, dy, box.minY, box.maxY],
      [oz, dz, box.minZ, box.maxZ],
    ]) {
      if (Math.abs(d) < 1e-8) {
        if (o < min || o > max) return null;
      } else {
        let t1 = (min - o) / d;
        let t2 = (max - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : null);
  }
}
