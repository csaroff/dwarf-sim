// The map: 3D grids of tiles, materials, fluids + pathfinding and connectivity.
// z = 0 is the bottom of the world, z = D-1 is the sky.
//
// A cell holds ONE tile:
//   Wall  - solid rock/soil            Floor - walkable ground
//   Open  - air (nothing to stand on)  Ramp  - walkable, links to the level above
//   Stair - walkable, links to stairs directly above/below
//   Tree  - tree trunk (not walkable)
import { D, F, H, MAT, MATS, N, T, W } from './defs';
import { Rng } from './rng';

export const WH = W * H;
export const idx = (x: number, y: number, z: number) => x + y * W + z * WH;
export const X = (i: number) => i % W;
export const Y = (i: number) => Math.floor(i / W) % H;
export const Z = (i: number) => Math.floor(i / WH);
export const inMap = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D;
export const cheb = (a: number, b: number) => Math.max(Math.abs(X(a) - X(b)), Math.abs(Y(a) - Y(b)));
/** distance used for "nearest": horizontal distance plus a penalty for z changes */
export const dist = (a: number, b: number) => cheb(a, b) + Math.abs(Z(a) - Z(b)) * 4;

export const DIRS8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const DIRS4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// block bits
export const BLOCK_WALK = 1; // statue, closed floodgate, raised bridge, locked door, river
export const BLOCK_DECK = 2; // lowered bridge: walkable even over open space
export const BLOCK_FLUID = 4; // door, closed floodgate, raised bridge

export class World {
  tile = new Uint8Array(N);
  mat = new Uint8Array(N);
  flag = new Uint8Array(N);
  plant = new Uint8Array(N);
  water = new Uint8Array(N);
  magma = new Uint8Array(N);
  desig = new Uint8Array(N);
  block = new Uint8Array(N);
  surface = new Uint8Array(WH); // z of the ground surface for each column

  // connectivity
  region = new Int32Array(N);
  regionsDirty = true;
  version = 0; // bumped on every map change (renderer / caches)

  // fluids
  active = new Set<number>();

  // pathfinding scratch
  private g = new Float32Array(N);
  private from = new Int32Array(N);
  private stamp = new Uint32Array(N);
  private closed = new Uint32Array(N);
  private stampN = 0;
  private heap: number[] = [];
  private heapF: number[] = [];

  // ------------------------------------------------------------ tiles
  isWalkTile(i: number) {
    const t = this.tile[i];
    return t === T.Floor || t === T.Ramp || t === T.Stair;
  }
  /** Can a creature stand here? (ignores fluids and other creatures) */
  passable(i: number) {
    const b = this.block[i];
    if (b & BLOCK_WALK) return false;
    if (b & BLOCK_DECK) return true;
    return this.isWalkTile(i);
  }
  /** passable and not drowning / burning */
  safe(i: number) {
    return this.passable(i) && !(this.water[i] >= 4 || this.magma[i] > 0);
  }
  solid(i: number) {
    const t = this.tile[i];
    return t === T.Wall || t === T.Tree;
  }
  fluidOpen(i: number) {
    return this.tile[i] !== T.Wall && !(this.block[i] & BLOCK_FLUID);
  }
  /** deep fluid or any magma: do not walk here */
  dangerous(i: number) {
    return this.water[i] >= 4 || this.magma[i] > 0;
  }
  revealed(i: number) {
    return (this.flag[i] & F.Revealed) !== 0;
  }
  /** no solid tile anywhere above this cell */
  outside(i: number) {
    for (let j = i + WH; j < N; j += WH) if (this.tile[j] !== T.Open) return false;
    return true;
  }

  setTile(i: number, t: number, mat?: number) {
    this.tile[i] = t;
    if (mat !== undefined) this.mat[i] = mat;
    this.changed(i);
  }
  setBlock(i: number, bits: number) {
    this.block[i] = bits;
    this.changed(i);
  }
  changed(i: number) {
    this.regionsDirty = true;
    this.version++;
    this.wake(i);
  }

  // ------------------------------------------------------------ movement graph
  /** Calls cb(neighbourIdx, cost) for every cell a walker can step to from i. */
  neighbors(i: number, cb: (n: number, cost: number) => void, brave = false) {
    const ok = brave ? (c: number) => this.passable(c) : (c: number) => this.safe(c);
    const x = X(i), y = Y(i), z = Z(i);
    const t = this.tile[i];
    const rampUp = t === T.Ramp && z + 1 < D && this.tile[i + WH] === T.Open;
    for (let d = 0; d < 8; d++) {
      const dx = DIRS8[d][0], dy = DIRS8[d][1];
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = i + dx + dy * W;
      const diag = d >= 4;
      if (ok(n)) {
        // no squeezing diagonally between two walls
        if (!diag || !(this.solid(i + dx) || this.solid(i + dy * W))) cb(n, diag ? 1.41 : 1);
      }
      // up a ramp
      if (rampUp && ok(n + WH)) cb(n + WH, diag ? 1.9 : 1.5);
      // down a ramp: neighbour column is open at our level with a ramp below
      if (z > 0 && this.tile[n] === T.Open && this.tile[n - WH] === T.Ramp && ok(n - WH)) cb(n - WH, diag ? 1.9 : 1.5);
    }
    if (t === T.Stair) {
      if (z + 1 < D && this.tile[i + WH] === T.Stair && ok(i + WH)) cb(i + WH, 1.5);
      if (z > 0 && this.tile[i - WH] === T.Stair && ok(i - WH)) cb(i - WH, 1.5);
    }
  }

  ensureRegions() {
    if (!this.regionsDirty) return;
    this.regionsDirty = false;
    const reg = this.region;
    reg.fill(0);
    let next = 1;
    const stack: number[] = [];
    for (let s = 0; s < N; s++) {
      if (reg[s] || !this.safe(s)) continue;
      const id = next++;
      reg[s] = id;
      stack.push(s);
      while (stack.length) {
        const c = stack.pop()!;
        this.neighbors(c, (n) => {
          if (!reg[n]) {
            reg[n] = id;
            stack.push(n);
          }
        });
      }
    }
  }
  regionOf(i: number) {
    this.ensureRegions();
    return this.region[i];
  }
  /** Is there any walking route from a to b? */
  connected(a: number, b: number) {
    this.ensureRegions();
    return this.region[a] !== 0 && this.region[a] === this.region[b];
  }
  /**
   * Cells a worker can stand on to work on target cell `t`:
   * the cell itself (if standable), the 8 around it, and stairs directly above/below.
   */
  workSpots(t: number, includeSelf = true): number[] {
    const out: number[] = [];
    const x = X(t), y = Y(t), z = Z(t);
    if (includeSelf && this.safe(t)) out.push(t);
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = t + dx + dy * W;
      if (this.safe(n)) out.push(n);
    }
    if (z + 1 < D && this.tile[t + WH] === T.Stair && this.safe(t + WH)) out.push(t + WH);
    if (z > 0 && this.tile[t - WH] === T.Stair && this.safe(t - WH)) out.push(t - WH);
    // a ramp next to the target, one level down (digging/chopping from the slope)
    if (z > 0) {
      for (const [dx, dy] of DIRS8) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = t + dx + dy * W - WH;
        if (this.tile[n] === T.Ramp && this.safe(n) && this.tile[n + WH] === T.Open) out.push(n);
      }
    }
    return out;
  }
  /** Can someone standing at `from` get to (or next to) `t`? */
  canReach(from: number, t: number, adjacent: boolean, includeSelf = true): boolean {
    this.ensureRegions();
    const r = this.region[from];
    if (!r) return false;
    if (!adjacent) return this.region[t] === r;
    for (const s of this.workSpots(t, includeSelf)) if (this.region[s] === r) return true;
    return false;
  }

  /**
   * A* from `a` to `b`. If adjacent, stops at any work spot of b.
   * Returns the list of cells to step through (excluding a), or null.
   * Avoids deep water and magma unless `brave`.
   */
  findPath(a: number, b: number, adjacent: boolean, brave = false, includeSelf = true): number[] | null {
    if (!brave && !this.canReach(a, b, adjacent, includeSelf)) return null;
    let goals: Set<number> | null = null;
    if (adjacent) {
      goals = new Set(this.workSpots(b, includeSelf));
      if (goals.has(a)) return [];
    } else if (a === b) return [];
    const stampN = ++this.stampN;
    const { g, from, stamp, closed, heap, heapF } = this;
    heap.length = 0;
    heapF.length = 0;
    const bx = X(b), by = Y(b), bz = Z(b);
    const hfun = (i: number) => {
      const dx = Math.abs(X(i) - bx), dy = Math.abs(Y(i) - by);
      return Math.max(dx, dy) + 0.41 * Math.min(dx, dy) + Math.abs(Z(i) - bz) * 1.5;
    };
    const push = (i: number, f: number) => {
      let c = heap.length;
      heap.push(i);
      heapF.push(f);
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (heapF[p] <= f) break;
        heap[c] = heap[p];
        heapF[c] = heapF[p];
        c = p;
      }
      heap[c] = i;
      heapF[c] = f;
    };
    const pop = () => {
      const top = heap[0];
      const li = heap.pop()!;
      const lf = heapF.pop()!;
      const n = heap.length;
      if (n > 0) {
        let c = 0;
        for (;;) {
          let k = c * 2 + 1;
          if (k >= n) break;
          if (k + 1 < n && heapF[k + 1] < heapF[k]) k++;
          if (heapF[k] >= lf) break;
          heap[c] = heap[k];
          heapF[c] = heapF[k];
          c = k;
        }
        heap[c] = li;
        heapF[c] = lf;
      }
      return top;
    };
    g[a] = 0;
    from[a] = -1;
    stamp[a] = stampN;
    push(a, hfun(a));
    let found = -1;
    let expanded = 0;
    while (heap.length) {
      const c = pop();
      if (closed[c] === stampN) continue;
      closed[c] = stampN;
      if (goals ? goals.has(c) : c === b) {
        found = c;
        break;
      }
      const gc = g[c];
      this.neighbors(c, (n, cost) => {
        if (closed[n] === stampN) return;
        const ng = gc + cost + (this.water[n] > 0 ? 1 : 0) + (brave && this.dangerous(n) ? 20 : 0);
        if (stamp[n] !== stampN || ng < g[n]) {
          stamp[n] = stampN;
          g[n] = ng;
          from[n] = c;
          push(n, ng + hfun(n));
        }
      }, brave);
      if (brave && ++expanded > 30000) break;
    }
    if (found < 0) return null;
    const path: number[] = [];
    for (let c = found; c !== a; c = from[c]) path.push(c);
    path.reverse();
    return path;
  }

  // ------------------------------------------------------------ reveal
  /**
   * Reveal cell i. If it is an unrevealed non-wall cell (a cave!), flood-reveal the whole
   * open space. Returns what was discovered so the game can announce it.
   */
  discover(i: number): { cavern: boolean; magma: boolean; hollow: boolean; count: number } {
    const res = { cavern: false, magma: false, hollow: false, count: 0 };
    const stack = [i];
    const mark = (c: number) => {
      if (this.flag[c] & F.Revealed) return false;
      this.flag[c] |= F.Revealed;
      res.count++;
      return true;
    };
    mark(i);
    while (stack.length) {
      const c = stack.pop()!;
      const x = X(c), y = Y(c), z = Z(c);
      for (let dz = -1; dz <= 1; dz++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!inMap(x + dx, y + dy, z + dz)) continue;
            const n = idx(x + dx, y + dy, z + dz);
            if (this.flag[n] & F.Revealed) continue;
            mark(n);
            if (this.tile[n] !== T.Wall) {
              // open space we had not seen: keep flooding
              if (this.flag[n] & F.Hollow) res.hollow = true;
              else if (this.magma[n] > 0) res.magma = true;
              else res.cavern = true;
              stack.push(n);
            }
          }
    }
    this.version++;
    return res;
  }

  // ------------------------------------------------------------ fluids
  wake(i: number) {
    this.active.add(i);
    const x = X(i), y = Y(i), z = Z(i);
    if (x > 0) this.active.add(i - 1);
    if (x < W - 1) this.active.add(i + 1);
    if (y > 0) this.active.add(i - W);
    if (y < H - 1) this.active.add(i + W);
    if (z < D - 1) this.active.add(i + WH);
    if (z > 0) this.active.add(i - WH);
  }
  private canFall(i: number) {
    if (Z(i) === 0) return false;
    const t = this.tile[i];
    if (t !== T.Open && t !== T.Stair) return false;
    if (this.block[i] & BLOCK_DECK) return false;
    return this.fluidOpen(i - WH);
  }
  /** water and magma in one cell: instant obsidian */
  private mix(i: number, onObsidian: (i: number) => void) {
    if (this.water[i] > 0 && this.magma[i] > 0) {
      this.water[i] = 0;
      this.magma[i] = 0;
      this.plant[i] = 0;
      this.flag[i] &= ~(F.Mud | F.Built | F.Smooth | F.Engraved);
      this.setTile(i, T.Wall, MAT.obsidian);
      onObsidian(i);
    }
  }
  /** One step of the fluid simulation. `magmaToo` = also move magma (it is slower). */
  tickFluids(rng: Rng, magmaToo: boolean, onObsidian: (i: number) => void) {
    if (!this.active.size) return;
    const cells = Array.from(this.active);
    this.active.clear();
    let moved = false;
    for (const i of cells) {
      if (this.flag[i] & F.Source && this.water[i] < 7 && this.tile[i] !== T.Wall) {
        if (this.water[i] < 4) this.regionsDirty = true;
        this.water[i] = 7;
        this.wake(i);
        moved = true;
      }
      if (this.water[i] > 0) moved = this.flow(i, this.water, rng, true, onObsidian) || moved;
      if (this.magma[i] > 0) {
        if (magmaToo) moved = this.flow(i, this.magma, rng, false, onObsidian) || moved;
        else if (this.magmaRestless(i)) this.active.add(i);
      }
    }
    if (moved) this.version++;
  }
  private magmaRestless(i: number) {
    if (this.canFall(i) && this.magma[i - WH] < 7) return true;
    const m = this.magma[i];
    const x = X(i), y = Y(i);
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = i + dx + dy * W;
      if (this.fluidOpen(n) && m - this.magma[n] >= 2) return true;
    }
    return false;
  }
  /** after fluid moved between a and b: if either became (un)safe to walk, connectivity changed */
  private fluidMoved(a: number, b: number, da: boolean, db: boolean) {
    if (this.dangerous(a) !== da || this.dangerous(b) !== db) this.regionsDirty = true;
    this.wake(a);
    this.wake(b);
  }
  private flow(i: number, f: Uint8Array, rng: Rng, isWater: boolean, onObsidian: (i: number) => void): boolean {
    let lvl = f[i];
    const di = this.dangerous(i);
    // fall
    if (this.canFall(i)) {
      const b = i - WH;
      const room = 7 - f[b];
      if (room > 0) {
        const amt = Math.min(room, lvl);
        const db = this.dangerous(b);
        f[b] += amt;
        f[i] -= amt;
        if (isWater && this.tile[b] === T.Floor && !(this.flag[b] & F.Built)) this.flag[b] |= F.Mud;
        this.mix(b, onObsidian);
        this.fluidMoved(i, b, di, db);
        return true;
      }
    }
    // spread sideways to the lowest neighbour
    const x = X(i), y = Y(i);
    let best = -1, bestL = 99, ties = 0;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = i + dx + dy * W;
      if (!this.fluidOpen(n)) continue;
      const l = f[n];
      if (l < bestL) {
        best = n;
        bestL = l;
        ties = 1;
      } else if (l === bestL && rng.int(++ties) === 0) best = n;
    }
    if (best >= 0 && bestL < lvl) {
      const diff = lvl - bestL;
      // a difference of one only sloshes around some of the time, so thin sheets spread out and dry up
      if (diff >= 2 || (isWater && rng.chance(0.25))) {
        const amt = diff >= 2 ? diff >> 1 : 1;
        const db = this.dangerous(best);
        f[best] += amt;
        f[i] -= amt;
        if (isWater && this.tile[best] === T.Floor && !(this.flag[best] & F.Built)) this.flag[best] |= F.Mud;
        this.mix(best, onObsidian);
        this.fluidMoved(i, best, di, db);
        return true;
      }
      if (isWater) this.active.add(i); // uneven: try again later
    }
    lvl = f[i];
    // shallow puddles dry up
    if (isWater && lvl <= 2 && !(this.flag[i] & F.Source)) {
      if (rng.chance(0.02)) {
        f[i]--;
        this.fluidMoved(i, i, di, di);
        return true;
      }
      this.active.add(i);
    }
    return false;
  }

  /** Is there water to drink / fish next to cell i (same level or one below an open edge)? */
  waterNear(i: number): number {
    const x = X(i), y = Y(i);
    if (this.water[i] > 0 && this.water[i] < 4) return i;
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = i + dx + dy * W;
      if (this.water[n] > 0) return n;
      if (this.tile[n] === T.Open && n - WH >= 0 && this.water[n - WH] > 0) return n - WH;
    }
    return -1;
  }
  nearMagma(i: number, depth = 3): boolean {
    const x = X(i), y = Y(i), z = Z(i);
    for (let dz = 0; dz <= depth; dz++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) if (inMap(x + dx, y + dy, z - dz) && this.magma[idx(x + dx, y + dy, z - dz)] > 0) return true;
    return false;
  }

  matName(i: number) {
    return MATS[this.mat[i]].name;
  }

  // ------------------------------------------------------------ save / load
  private static GRIDS = ['tile', 'mat', 'flag', 'plant', 'water', 'magma', 'desig', 'block', 'surface'] as const;
  save(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of World.GRIDS) out[k] = rle(this[k]);
    out.active = JSON.stringify(Array.from(this.active));
    return out;
  }
  load(data: Record<string, string>) {
    for (const k of World.GRIDS) unrle(data[k], this[k]);
    this.active = new Set(JSON.parse(data.active || '[]'));
    this.regionsDirty = true;
    this.version++;
  }
}

// run-length encode a byte grid into a compact string: pairs of (count, value) in base 36
function rle(a: Uint8Array): string {
  const parts: string[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i];
    let j = i + 1;
    while (j < a.length && a[j] === v) j++;
    parts.push((j - i).toString(36) + ':' + v.toString(36));
    i = j;
  }
  return parts.join(',');
}
function unrle(s: string, a: Uint8Array) {
  let i = 0;
  if (!s) return;
  for (const p of s.split(',')) {
    const [c, v] = p.split(':');
    const n = parseInt(c, 36), val = parseInt(v, 36);
    a.fill(val, i, i + n);
    i += n;
  }
}
