// World generation: hills, a river, soil and stone layers, ore veins, gems,
// two cavern layers, a magma sea with a volcanic pipe, and an adamantine spire.
import { D, F, H, MAT, PLANT, PLANTS, T, W, isLayerStone } from './defs';
import { Rng, fbm2, hash2, noise2 } from './rng';
import { DIRS8, WH, World, idx, inMap } from './world';

const SEDIMENTARY = ['limestone', 'sandstone', 'dolomite', 'chalk', 'shale'];
const METAMORPHIC = ['granite', 'marble', 'diorite', 'schist', 'gneiss', 'quartzite', 'slate'];
const IGNEOUS = ['gabbro', 'basalt', 'andesite', 'rhyolite'];
export const SURFACE_TREES = ['oak', 'oak', 'pine', 'pine', 'birch', 'maple'];
export const SHRUBS = PLANTS.filter((p) => p.kind === 'shrub').map((p) => p.id);
/** which stone of a layer's family is found here (noise is bunched around 0.5, so stretch it) */
const layer = (list: string[], n: number) => MAT[list[Math.floor(Math.max(0, Math.min(0.999, (n - 0.2) / 0.6)) * list.length)]];

export const CAVERN1_Z = 15;
export const CAVERN2_Z = 8;
export const MAGMA_Z = 2; // top level of the magma sea

export interface GenResult {
  embark: { x: number; y: number; z: number };
  riverZ: number;
}

export function generate(w: World, seed: number): GenResult {
  const rng = new Rng(seed);
  const riverZ = 23;

  // ---------------------------------------------------------- heights + river
  const riverY = (x: number) => Math.round(H * 0.2 + noise2(x * 0.045, 3.3, seed + 5) * H * 0.22);
  const riverDist = new Float32Array(WH).fill(99);
  for (let x = 0; x < W; x++) {
    const ry = riverY(x);
    for (let y = Math.max(0, ry - 12); y < Math.min(H, ry + 12); y++) {
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= W) continue;
        const d = Math.hypot(dx, y - riverY(xx));
        riverDist[x + y * W] = Math.min(riverDist[x + y * W], d);
      }
    }
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = x + y * W;
      const rd = riverDist[c];
      let h = riverZ + 1 + Math.floor(fbm2(x * 0.035, y * 0.035, seed, 3) * 5.5 - 0.6);
      h = Math.max(riverZ + 1, Math.min(riverZ + 5, h));
      if (rd < 7) h = Math.min(h, riverZ + 1 + Math.floor(rd / 3.5)); // valley
      if (rd < 1.6) h = riverZ;
      w.surface[c] = h;
    }

  // ---------------------------------------------------------- layers
  const soilNoise = (x: number, y: number) => fbm2(x * 0.06, y * 0.06, seed + 11, 2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = x + y * W;
      const h = w.surface[c];
      const sn = soilNoise(x, y);
      const soil = riverDist[c] < 5 ? MAT.sand : sn < 0.4 ? MAT.clay : sn > 0.62 ? MAT.sand : MAT.loam;
      const soilDepth = 2 + (hash2(x >> 2, y >> 2, seed + 3) > 0.5 ? 1 : 0);
      const wob = Math.floor(noise2(x * 0.07, y * 0.07, seed + 21) * 3);
      for (let z = 0; z < D; z++) {
        const i = idx(x, y, z);
        if (z > h) {
          w.tile[i] = T.Open;
          continue;
        }
        if (z === h) {
          w.tile[i] = T.Floor;
          w.mat[i] = soil;
          continue;
        }
        w.tile[i] = T.Wall;
        const depth = h - z;
        let m: number;
        if (z === 0) m = MAT.slade;
        else if (depth <= soilDepth) m = soil;
        else if (z + wob >= 18) m = layer(SEDIMENTARY, noise2(x * 0.05, y * 0.05, seed + 31));
        else if (z + wob >= 10) m = layer(METAMORPHIC, noise2(x * 0.04, y * 0.04, seed + 41));
        else m = layer(IGNEOUS, noise2(x * 0.05, y * 0.05, seed + 51));
        w.mat[i] = m;
      }
    }

  // ---------------------------------------------------------- river water
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = x + y * W;
      if (w.surface[c] !== riverZ) continue;
      const i = idx(x, y, riverZ);
      w.water[i] = 7;
      w.mat[i] = MAT.sand;
      if (x === 0 || x === W - 1) w.flag[i] |= F.Source;
    }

  // ---------------------------------------------------------- veins & gems
  const vein = (mat: number, zLo: number, zHi: number, count: number, len: number) => {
    for (let v = 0; v < count; v++) {
      let x = rng.int(W), y = rng.int(H), z = rng.range(zLo, zHi);
      let dx = rng.range(-1, 1), dy = rng.range(-1, 1);
      if (!dx && !dy) dx = 1;
      for (let s = 0; s < len; s++) {
        for (const [ox, oy] of [[0, 0], [1, 0], [0, 1]]) {
          if (!inMap(x + ox, y + oy, z)) continue;
          const i = idx(x + ox, y + oy, z);
          const mk = w.mat[i];
          if (w.tile[i] === T.Wall && isLayerStone(mk)) w.mat[i] = mat;
        }
        if (rng.chance(0.3)) {
          dx = rng.range(-1, 1);
          dy = rng.range(-1, 1);
        }
        if (rng.chance(0.12)) z += rng.range(-1, 1);
        z = Math.max(zLo, Math.min(zHi, z));
        x += dx;
        y += dy;
      }
    }
  };
  vein(MAT.native_copper, 12, 21, 14, 22);
  vein(MAT.cassiterite, 12, 21, 9, 18);
  vein(MAT.hematite, 9, 20, 14, 24);
  vein(MAT.coal, 14, 21, 10, 22);
  vein(MAT.native_silver, 6, 16, 8, 16);
  vein(MAT.native_gold, 4, 13, 7, 14);
  vein(MAT.malachite, 14, 21, 7, 16);
  vein(MAT.tetrahedrite, 10, 20, 7, 18);
  vein(MAT.limonite, 15, 21, 6, 18);
  vein(MAT.magnetite, 5, 14, 8, 22);
  vein(MAT.galena, 8, 18, 8, 18);
  vein(MAT.sphalerite, 8, 18, 7, 16);
  vein(MAT.bismuthinite, 8, 16, 5, 12);
  vein(MAT.garnierite, 3, 9, 5, 14);
  vein(MAT.native_platinum, 3, 8, 3, 8);
  const gems = (mat: number, zLo: number, zHi: number, count: number) => {
    for (let v = 0; v < count; v++) {
      const x = rng.int(W), y = rng.int(H), z = rng.range(zLo, zHi);
      for (let k = 0; k < 4; k++) {
        const xx = x + rng.range(-1, 1), yy = y + rng.range(-1, 1);
        if (!inMap(xx, yy, z)) continue;
        const i = idx(xx, yy, z);
        if (w.tile[i] === T.Wall && isLayerStone(w.mat[i])) w.mat[i] = mat;
      }
    }
  };
  gems(MAT.rock_crystal, 10, 21, 40);
  gems(MAT.amethyst, 8, 20, 30);
  gems(MAT.emerald, 4, 12, 18);
  gems(MAT.ruby, 4, 12, 18);
  gems(MAT.diamond, 3, 9, 14);
  gems(MAT.jasper, 14, 21, 24);
  gems(MAT.onyx, 14, 21, 20);
  gems(MAT.opal, 12, 20, 16);
  gems(MAT.jade, 9, 17, 16);
  gems(MAT.lapis_lazuli, 9, 17, 16);
  gems(MAT.garnet, 8, 16, 14);
  gems(MAT.tourmaline, 6, 14, 12);
  gems(MAT.aquamarine, 5, 12, 12);
  gems(MAT.topaz, 4, 10, 10);
  gems(MAT.sapphire, 3, 9, 10);

  // ---------------------------------------------------------- caverns
  const cavern = (base: number, cseed: number, thresh: number, deep: boolean) => {
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const c = fbm2(x * 0.075, y * 0.075, cseed, 3);
        if (c < thresh) continue;
        const lift = noise2(x * 0.05, y * 0.05, cseed + 9) > 0.6 ? 1 : 0;
        const zf = base + lift;
        const height = Math.min(3, 1 + Math.floor((c - thresh) * 14));
        const pond = lift === 0 && noise2(x * 0.11, y * 0.11, cseed + 17) > 0.74 && c > thresh + 0.05;
        for (let z = zf; z < zf + height; z++) {
          const i = idx(x, y, z);
          if (z === zf) {
            w.tile[i] = T.Floor;
            w.flag[i] |= F.Mud;
            const r = hash2(x, y, cseed + 1);
            if (r < 0.035) {
              // tower-caps and fungiwood above; the cold blue nether-caps only in the deep cavern
              const kind = hash2(x, y, cseed + 3) < 0.45 ? (deep ? 'nether_cap' : 'fungiwood') : 'tower_cap';
              w.tile[i] = T.Tree;
              w.plant[i] = PLANT[kind];
              w.mat[i] = MAT[kind];
            } else if (r < 0.6) w.plant[i] = PLANT.cave_moss;
          } else w.tile[i] = T.Open;
        }
        if (pond) {
          // a sunken pool: water sits one level below the cavern floor
          const i = idx(x, y, zf);
          w.tile[i] = T.Open;
          w.plant[i] = 0;
          w.flag[i] &= ~F.Mud;
          w.tile[i - WH] = T.Floor;
          w.water[i - WH] = 7;
          if (deep && hash2(x, y, cseed + 2) < 0.04) w.flag[i - WH] |= F.Source;
        }
      }
  };
  cavern(CAVERN1_Z, seed + 101, 0.57, false);
  cavern(CAVERN2_Z, seed + 202, 0.55, true);

  // ---------------------------------------------------------- magma sea + volcanic pipe
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (fbm2(x * 0.05, y * 0.05, seed + 303, 2) < 0.36) continue;
      for (let z = 1; z <= MAGMA_Z; z++) {
        const i = idx(x, y, z);
        w.tile[i] = z === 1 ? T.Floor : T.Open;
        w.mat[i] = MAT.basalt;
        w.magma[i] = 7;
      }
    }
  // the pipe: far from the river, away from the map centre
  const px = rng.chance(0.5) ? rng.range(12, 26) : rng.range(W - 27, W - 13);
  const py = rng.range(Math.floor(H * 0.55), H - 14);
  for (let z = 1; z <= 13; z++)
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const d = Math.hypot(dx, dy);
        const i = idx(px + dx, py + dy, z);
        if (d <= 1.6) {
          w.tile[i] = z === 1 ? T.Floor : T.Open;
          w.plant[i] = 0;
          w.water[i] = 0;
          w.magma[i] = 7;
          w.flag[i] &= ~(F.Mud | F.Source);
        } else if (d <= 3.2 && w.tile[i] !== T.Wall) {
          // seal the pipe where it crosses a cavern
          w.tile[i] = T.Wall;
          w.mat[i] = MAT.obsidian;
          w.plant[i] = 0;
          w.water[i] = 0;
          w.flag[i] &= ~(F.Mud | F.Source);
        } else if (d <= 3.2) w.mat[i] = MAT.obsidian;
      }
  // cap
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) w.mat[idx(px + dx, py + dy, 14)] = MAT.obsidian;

  // ---------------------------------------------------------- adamantine spire
  const sx = W - px + rng.range(-4, 4), sy = rng.range(Math.floor(H * 0.5), H - 12);
  for (let z = 1; z <= 9; z++)
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const i = idx(sx + dx, sy + dy, z);
        w.magma[i] = 0;
        w.water[i] = 0;
        w.plant[i] = 0;
        w.flag[i] &= ~(F.Mud | F.Source);
        if (d === 0 && z < 9) {
          w.tile[i] = T.Open;
          w.flag[i] |= F.Hollow;
        } else if (d <= 1) {
          w.tile[i] = T.Wall;
          w.mat[i] = MAT.raw_adamantine;
        } else if (w.tile[i] !== T.Wall) {
          w.tile[i] = T.Wall;
          w.mat[i] = MAT.basalt;
        }
      }

  // ---------------------------------------------------------- surface plants
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = x + y * W;
      const h = w.surface[c];
      if (h === riverZ) continue;
      const i = idx(x, y, h);
      const forest = fbm2(x * 0.06, y * 0.06, seed + 71, 2);
      const r = hash2(x, y, seed + 72);
      if (r < (forest > 0.52 ? 0.11 : 0.015)) {
        // willows by the water, a mix of the rest elsewhere
        const k = hash2(x, y, seed + 73);
        const kind = riverDist[c] < 9 && k < 0.6 ? 'willow' : SURFACE_TREES[Math.floor(k * SURFACE_TREES.length)];
        w.tile[i] = T.Tree;
        w.plant[i] = PLANT[kind];
        w.mat[i] = MAT[kind];
      } else if (r < 0.15) {
        w.plant[i] = PLANT[SHRUBS[Math.floor(hash2(x, y, seed + 74) * SHRUBS.length)]];
      } else if (w.mat[i] !== MAT.sand || r < 0.5) w.plant[i] = PLANT.grass;
    }

  // ---------------------------------------------------------- embark site
  let best = { x: W >> 1, y: H >> 1, z: 0 }, bestScore = -1e9;
  for (let t = 0; t < 400; t++) {
    const x = rng.range(20, W - 21), y = rng.range(Math.floor(H * 0.42), H - 22);
    const h = w.surface[x + y * W];
    let score = -Math.hypot(x - W / 2, y - H * 0.6) * 0.3;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const hh = w.surface[x + dx + (y + dy) * W];
        if (hh !== h) score -= 3;
        if (w.tile[idx(x + dx, y + dy, hh)] === T.Tree) score -= 1;
      }
    score -= Math.hypot(x - px, y - py) < 12 ? 50 : 0;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y, z: h };
    }
  }
  // clear trees right at the wagon
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const i = idx(best.x + dx, best.y + dy, w.surface[best.x + dx + (best.y + dy) * W]);
      if (w.tile[i] === T.Tree) {
        w.tile[i] = T.Floor;
        w.mat[i] = MAT.loam;
        w.plant[i] = PLANT.grass;
      }
    }

  finishTerrain(w);
  return { embark: best, riverZ };
}

/** Ramps on slopes, initial reveal. Also used by test maps. */
export function finishTerrain(w: World) {
  // natural ramps: a floor next to a wall whose top is walkable
  for (let z = 1; z < D - 1; z++)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = idx(x, y, z);
        if (w.tile[i] !== T.Floor || w.tile[i + WH] !== T.Open || w.water[i] || w.magma[i]) continue;
        for (const [dx, dy] of DIRS8) {
          if (!inMap(x + dx, y + dy, z)) continue;
          const n = i + dx + dy * W;
          if (w.tile[n] === T.Wall && w.isWalkTile(n + WH)) {
            w.tile[i] = T.Ramp;
            if (w.plant[i] > PLANT.cave_moss) w.plant[i] = PLANT.grass;
            break;
          }
        }
      }
  // reveal everything open to the sky, and the faces of the walls next to it
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const h = w.surface[x + y * W];
      for (let z = h; z < D; z++) {
        for (let dz = -1; dz <= 1; dz++)
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) if (inMap(x + dx, y + dy, z + dz)) w.flag[idx(x + dx, y + dy, z + dz)] |= F.Revealed;
        if (z > h + 1) {
          // nothing but sky from here up
          for (let zz = z; zz < D; zz++) w.flag[idx(x, y, zz)] |= F.Revealed;
          break;
        }
      }
    }
  w.regionsDirty = true;
  w.version++;
  w.active.clear();
}

/** A tiny flat world for tests: solid granite below z=surfaceZ, soil floor at surfaceZ. */
export function generateFlat(w: World, surfaceZ = 20) {
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      w.surface[x + y * W] = surfaceZ;
      for (let z = 0; z < D; z++) {
        const i = idx(x, y, z);
        if (z < surfaceZ) {
          w.tile[i] = T.Wall;
          w.mat[i] = z >= surfaceZ - 2 ? MAT.loam : MAT.granite;
        } else if (z === surfaceZ) {
          w.tile[i] = T.Floor;
          w.mat[i] = MAT.loam;
        } else w.tile[i] = T.Open;
      }
    }
  finishTerrain(w);
}
