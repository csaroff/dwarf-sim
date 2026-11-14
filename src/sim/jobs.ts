// Work: everything a dwarf can be told to do.
//
// The pattern used throughout:
//   tryX(g, u, target)  -> a Job the dwarf could start right now, or a string explaining why not.
//   assign(g, u, job)   -> reserve what the job needs and start it.
//   RUN[job.type]       -> advance the job one tick: 'run' (keep going), 'done', or a failure reason.
//
// Because every task goes through a tryX function, the game can always answer "why is nobody doing this?"
// (explainTask) and "why can't this dwarf do it?" (the right-click menu shows the reason).
import {
  BUILDINGS, CREATURES, CROPS, F, ITEMS, TRAP_WEAPONS, Ing, LABORS, LABOR_NAME, Labor, MAT, MATS, PLANT, PLANTS, RECIPES, Recipe, T, TICKS_DAY, plantOf, matOf,
} from './defs';
import { Game, MAX_AMMO, MAX_STACK } from './game';
import type { Bill, Building, Can, Item, Job, Unit, Zone } from './types';
import { BLOCK_DECK, DIRS8, WH, X, Y, Z, cheb, dist, idx, inMap } from './world';

export type Try = Job | string;
export const isJob = (t: Try): t is Job => typeof t !== 'string';

// ------------------------------------------------------------------ designations
export const DG = { None: 0, Dig: 1, Channel: 2, Stair: 3, Ramp: 4, Chop: 5, Gather: 6, Smooth: 7, Engrave: 8, Remove: 9 } as const;
export const DG_NAME = ['', 'Mine', 'Channel', 'Carve stairs', 'Carve ramp', 'Chop tree', 'Gather plant', 'Smooth stone', 'Engrave', 'Remove construction'];
export const DG_ING = ['', 'Mining', 'Channelling', 'Carving stairs in', 'Carving a ramp in', 'Felling', 'Gathering', 'Smoothing', 'Engraving', 'Removing'];
export const DG_LABOR: Labor[] = ['haul', 'mine', 'mine', 'mine', 'mine', 'chop', 'farm', 'mason', 'mason', 'build'];
export const DG_GLYPH = ['', '▒', '▼', 'X', '▲', '♣', '"', '░', '▓', 'x'];

const NO: (why: string) => Can = (why) => ({ ok: false, why });
const OK: Can = { ok: true };

export function validDesig(g: Game, cell: number, d: number): Can {
  const w = g.w;
  const t = w.tile[cell];
  const hidden = !w.revealed(cell);
  const m = MATS[w.mat[cell]];
  const digLike = d === DG.Dig || d === DG.Channel || d === DG.Stair || d === DG.Ramp;
  if (digLike && Z(cell) === 0) return NO('This is the bottom of the world');
  if (digLike && hidden) return OK; // you cannot know what is there
  if (digLike && t === T.Wall && m.id === 'slade') return NO('Slade cannot be mined');
  if (digLike && w.flag[cell] & F.Built && t === T.Wall) return NO('That is a constructed wall: use Remove Construction');
  switch (d) {
    case DG.Dig: return t === T.Wall ? OK : NO('Only solid walls can be mined out');
    case DG.Channel:
      if (Z(cell) < 2) return NO('Too deep to channel');
      return t === T.Floor || t === T.Ramp || t === T.Wall ? OK : NO('Nothing to channel here');
    case DG.Stair: return t === T.Wall || t === T.Floor || t === T.Ramp ? OK : NO('Stairs can be carved into walls or floors');
    case DG.Ramp: return t === T.Wall ? OK : NO('Ramps are carved out of walls');
    case DG.Chop: return t === T.Tree ? OK : NO('No tree here');
    case DG.Gather: return PLANTS[w.plant[cell]].kind === 'shrub' ? OK : NO('No gatherable plant here');
    case DG.Smooth:
      if (t !== T.Wall && t !== T.Floor) return NO('Only walls and floors can be smoothed');
      if (w.flag[cell] & F.Built) return NO('Constructions cannot be smoothed');
      if (m.kind === 'soil' || m.kind === 'wood') return NO(`${m.name} cannot be smoothed, only stone`);
      return w.flag[cell] & F.Smooth ? NO('Already smooth') : OK;
    case DG.Engrave:
      if (!(w.flag[cell] & F.Smooth)) return NO('Smooth it first');
      return w.flag[cell] & F.Engraved ? NO('Already engraved') : OK;
    case DG.Remove: return w.flag[cell] & F.Built ? OK : NO('Not a construction');
  }
  return NO('?');
}

function digDrop(g: Game, cell: number, at: number) {
  const m = MATS[g.w.mat[cell]];
  if (g.w.flag[cell] & F.Built) return;
  if (m.kind === 'stone' && g.rng.chance(0.5)) g.spawnItem('boulder', g.w.mat[cell], at);
  else if (m.kind === 'ore') g.spawnItem('ore', g.w.mat[cell], at);
  else if (m.kind === 'gem') g.spawnItem('gem', g.w.mat[cell], at);
  else if ((m.id === 'sand' || m.id === 'clay') && g.rng.chance(0.25)) g.spawnItem(m.id, g.w.mat[cell], at); // for the glass furnace and the kiln
}
function digOut(g: Game, cell: number, tile: number, dropAt = cell) {
  const w = g.w;
  if (w.tile[cell] === T.Wall) digDrop(g, cell, dropAt);
  w.flag[cell] &= ~(F.Smooth | F.Engraved | F.Built);
  w.plant[cell] = 0;
  w.setTile(cell, tile);
  g.reveal(cell);
}

/** Things in a cell with nothing under them fall. */
export function settle(g: Game, cell: number) {
  const w = g.w;
  if (w.tile[cell] !== T.Open || w.block[cell] & BLOCK_DECK) return;
  let c = cell;
  while (Z(c) > 0 && w.tile[c] === T.Open && !(w.block[c] & BLOCK_DECK)) {
    if (w.tile[c - WH] === T.Wall) {
      // the top of a wall is a floor
      w.setTile(c, T.Floor, w.mat[c - WH]);
      break;
    }
    c -= WH;
  }
  if (c === cell) return;
  const dz = Z(cell) - Z(c);
  for (const it of g.itemsIn(cell)) g.placeItem(it, c);
  for (const u of g.unitsIn(cell)) {
    if (CREATURES[u.kind].flies) continue;
    g.moveUnit(u, c);
    u.path = null;
    fallDamage(g, u, dz);
  }
}
// ------------------------------------------------------------------ cave-ins
const CAVE_LIMIT = 400;
/**
 * The piece of rock / floor that cell c belongs to, if it is small and touches nothing else: [] when it is held up.
 * Tiles hold each other up sideways (not diagonally), and a solid wall holds up whatever sits on top of it.
 * A floor over a dug-out room is held only by its neighbours.
 */
function looseChunk(g: Game, c: number, seen: Set<number>): number[] {
  const w = g.w;
  const solid = (k: number) => w.tile[k] === T.Wall || w.tile[k] === T.Tree;
  const chunk: number[] = [c];
  const mine = new Set<number>([c]);
  let held = false;
  for (let q = 0; q < chunk.length && !held; q++) {
    const k = chunk[q];
    const x = X(k), y = Y(k), z = Z(k);
    if (z === 0 || x === 0 || y === 0 || x === 95 || y === 95 || seen.has(k) || chunk.length > CAVE_LIMIT) {
      held = true;
      break;
    }
    const add = (n: number) => {
      if (!mine.has(n)) {
        mine.add(n);
        chunk.push(n);
      }
    };
    if (w.tile[k - 1] !== T.Open) add(k - 1);
    if (w.tile[k + 1] !== T.Open) add(k + 1);
    if (w.tile[k - 96] !== T.Open) add(k - 96);
    if (w.tile[k + 96] !== T.Open) add(k + 96);
    if (solid(k - WH)) add(k - WH);
    if (z < 31 && solid(k) && w.tile[k + WH] !== T.Open) add(k + WH);
  }
  if (held) {
    // remember everything explored: it is all attached to something big
    for (const k of chunk) seen.add(k);
    return [];
  }
  return chunk;
}
/** After the map changed at these cells: does anything nearby now hang in mid-air? If so it comes down. */
export function checkCaveIn(g: Game, cells: number[]) {
  const w = g.w;
  const seen = new Set<number>();
  for (const c of cells) {
    const x = X(c), y = Y(c), z = Z(c);
    const around = [c, c - 1, c + 1, c - 96, c + 96, c - WH, c + WH];
    for (const n of around) {
      if (n < 0 || n >= w.tile.length || !inMap(x, y, z) || w.tile[n] === T.Open || seen.has(n)) continue;
      const chunk = looseChunk(g, n, seen);
      if (chunk.length) collapse(g, chunk);
    }
  }
}
function collapse(g: Game, chunk: number[]) {
  const w = g.w;
  const set = new Set(chunk);
  const rock: [number, number][] = [];
  for (const c of chunk) {
    const b = g.buildingAt(c);
    if (b) g.removeBuilding(b);
    if (w.desig[c]) g.designate(c, 0);
    g.crops.delete(c);
    if (w.tile[c] === T.Wall && !(w.flag[c] & F.Built)) rock.push([c, w.mat[c]]);
    w.plant[c] = 0;
    w.flag[c] &= F.Revealed;
    w.setTile(c, T.Open);
  }
  // where each piece lands, and who is standing there
  const land = (c: number) => {
    let k = c;
    while (Z(k) > 0 && w.tile[k] === T.Open && w.tile[k - WH] !== T.Wall) k -= WH;
    return k;
  };
  const victims = new Set<Unit>();
  for (const c of chunk) for (const u of g.unitsIn(land(c))) if (!set.has(g.cellOf(u))) victims.add(u);
  for (const c of chunk) settle(g, c); // whatever stood on the chunk rides it down
  for (const [c, mat] of rock) {
    const m = MATS[mat];
    if (m.kind === 'stone' || m.kind === 'ore' || m.kind === 'gem') g.spawnItem(m.kind === 'stone' ? 'boulder' : m.kind === 'ore' ? 'ore' : 'gem', mat, land(c));
  }
  const at = land(chunk[0]);
  g.reveal(at);
  g.say(`A section of the ${w.outside(chunk[0]) ? 'ground' : 'cavern'} has collapsed!`, 'bad', at, true);
  for (const u of victims) {
    if (u.dead) continue;
    u.hp -= 25 + g.rng.int(45);
    g.say(`${u.isDwarf ? u.name : g.unitName(u)} is caught under the falling rock!`, u.faction === 'fort' ? 'bad' : 'good', g.cellOf(u));
    if (u.hp <= 0) killUnit(g, u, 'been crushed in a cave-in');
    else fallDamage(g, u, 1);
  }
}

export let fallDamage: (g: Game, u: Unit, dz: number) => void = () => {};
export let killUnit: (g: Game, u: Unit, cause: string, by?: Unit) => void = () => {};
export let attack: (g: Game, a: Unit, b: Unit) => void = () => {};
/** close with a target and attack it, shooting instead when armed for it; false = cannot get to it */
export let engage: (g: Game, a: Unit, b: Unit) => boolean = () => false;
/** life.ts plugs its functions in here (avoids a circular import). */
export function hook(f: { fallDamage: typeof fallDamage; killUnit: typeof killUnit; attack: typeof attack; engage: typeof engage }) {
  engage = f.engage;
  fallDamage = f.fallDamage;
  killUnit = f.killUnit;
  attack = f.attack;
}

export function applyDesig(g: Game, u: Unit, cell: number) {
  const w = g.w;
  const d = w.desig[cell];
  g.designate(cell, 0);
  const t = w.tile[cell];
  switch (d) {
    case DG.Dig:
      digOut(g, cell, T.Floor);
      break;
    case DG.Stair:
      digOut(g, cell, T.Stair);
      break;
    case DG.Ramp: {
      digOut(g, cell, T.Ramp);
      const up = cell + WH;
      if (inMap(X(up), Y(up), Z(up)) && w.tile[up] !== T.Open && w.tile[up] !== T.Tree) {
        digOut(g, up, T.Open, cell);
        settle(g, up);
      }
      break;
    }
    case DG.Channel: {
      const below = cell - WH;
      if (w.tile[below] === T.Wall && MATS[w.mat[below]].id !== 'slade') digOut(g, below, T.Ramp);
      digOut(g, cell, T.Open, below);
      w.flag[cell] &= ~F.Mud;
      g.reveal(below);
      settle(g, cell);
      break;
    }
    case DG.Chop: {
      const p = PLANTS[w.plant[cell]];
      const wood = MAT[p.wood || 'oak'];
      w.plant[cell] = p.under ? PLANT.cave_moss : PLANT.grass;
      const under = !!p.under;
      w.setTile(cell, T.Floor, under ? w.mat[cell] : MAT.loam);
      // the trunk tile remembers the ground poorly; use what is next to it
      for (const [dx, dy] of DIRS8) {
        const n = cell + dx + dy * 96;
        if (inMap(X(cell) + dx, Y(cell) + dy, Z(cell)) && w.tile[n] === T.Floor && MATS[w.mat[n]].kind !== 'wood') {
          w.mat[cell] = w.mat[n];
          break;
        }
      }
      g.spawnItem('log', wood, cell, 2 + g.rng.int(2));
      break;
    }
    case DG.Gather: {
      const p = PLANTS[w.plant[cell]];
      w.plant[cell] = PLANT.grass;
      w.version++;
      const n = 1 + (g.rng.chance(0.3 + g.skillLevel(u, 'farm') * 0.05) ? 1 : 0);
      g.spawnItem('plant', MAT.none, cell, n, { sub: p.id });
      break;
    }
    case DG.Smooth:
      w.flag[cell] |= F.Smooth;
      w.version++;
      break;
    case DG.Engrave:
      w.flag[cell] |= F.Engraved;
      w.version++;
      break;
    case DG.Remove: {
      const m = w.mat[cell];
      const type = MATS[m].kind === 'wood' ? 'log' : MATS[m].kind === 'metal' ? 'bar' : 'boulder';
      w.flag[cell] &= ~F.Built;
      const below = cell - WH;
      if (t === T.Floor && !g.w.solid(below) && w.tile[below] !== T.Ramp) {
        w.setTile(cell, T.Open);
        g.spawnItem(type, m, cell);
        settle(g, cell);
      } else {
        const bm = w.solid(below) ? w.mat[below] : m;
        if (!w.solid(below)) w.flag[cell] |= F.Built;
        w.setTile(cell, T.Floor, bm);
        g.spawnItem(type, m, cell);
      }
      break;
    }
  }
  // digging can leave rock hanging with nothing to hold it
  if (d === DG.Dig || d === DG.Channel || d === DG.Stair || d === DG.Ramp || d === DG.Remove) checkCaveIn(g, d === DG.Ramp ? [cell, cell + WH] : [cell]);
}

// ------------------------------------------------------------------ job plumbing
function mk(type: string, label: string, cell: number, extra: Partial<Job> = {}): Job {
  return { type, label, step: 0, x: X(cell), y: Y(cell), z: Z(cell), t: 0, started: 0, ...extra };
}
const jcell = (j: Job) => idx(j.x, j.y, j.z);
const first = (u: Unit) => u.name.split(' ')[0];

export function assign(g: Game, u: Unit, job: Job, forced = false) {
  if (u.job) endJob(g, u, forced ? 'interrupted by your order' : '');
  u.job = job;
  u.path = null;
  u.whyIdle = '';
  for (let j: Job | undefined = job; j; j = j.next) {
    j.started = g.tick;
    j.forced = forced;
    if (j.key) g.claims.set(j.key, u.id);
    if (j.item) reserve(g, u, j.item);
    if (j.items) for (const i of j.items) reserve(g, u, i);
    if (j.dest !== undefined) g.spRes.set(j.dest, u.id);
  }
}
function reserve(g: Game, u: Unit, id: number) {
  const it = g.items.get(id);
  if (it) it.res = u.id;
}
function release(g: Game, u: Unit, id?: number) {
  const it = id ? g.items.get(id) : undefined;
  if (it && it.res === u.id) it.res = 0;
}
/** Stop the current job. A non-empty `why` is remembered so the UI can show what went wrong. */
export function endJob(g: Game, u: Unit, why = '') {
  const job = u.job;
  if (!job) return;
  if (why && job.type !== 'idle') {
    u.lastFail = `${job.label}: ${why}`;
    u.lastFailTick = g.tick;
    if (job.forced && !why.startsWith('interrupted')) g.say(`${first(u)} cancels ${job.label}: ${why}.`, 'bad', g.cellOf(u));
  }
  for (let j: Job | undefined = job; j; j = j.next) {
    if (j.key && g.claims.get(j.key) === u.id) g.claims.delete(j.key);
    release(g, u, j.item);
    if (j.items) for (const i of j.items) release(g, u, i);
    if (j.dest !== undefined && g.spRes.get(j.dest) === u.id) g.spRes.delete(j.dest);
    if (j.u) {
      const p = g.units.get(j.u);
      if (p && p.carriedBy === u.id) p.carriedBy = 0;
    }
  }
  if (u.carry) {
    const it = g.drop(u);
    if (it && why) it.skipHaul = g.tick + 100;
  }
  if (u.inBed && job.type !== 'rest') u.inBed = 0;
  u.job = null;
  u.path = null;
  u.target = 0;
  u.idleSince = g.tick;
}

/** ticks per tile for this unit right now */
export function moveDelay(g: Game, u: Unit): number {
  let s = CREATURES[u.kind].speed;
  if (u.isDwarf) {
    if (u.wounds.some((w) => w.part >= 5 && w.sev === 2)) s *= 3; // hobbling on a crutch
    else if (u.wounds.some((w) => w.part >= 5)) s *= 1.5;
    if (u.sober > TICKS_DAY * 6) s *= 1.4;
    if (u.carry) {
      const it = g.items.get(u.carry);
      if (it && (it.type === 'boulder' || it.type === 'corpse')) s *= 1.3;
    }
  }
  if (g.w.water[idx(u.x, u.y, u.z)] > 1) s *= 1.5;
  return Math.round(s);
}

/**
 * Move one tick towards `target`. Returns 'there' on arrival, 'going', or 'blocked' when there is no route.
 * adjacent: stop next to the target. selfOk: standing on the target itself also counts.
 */
export function walk(g: Game, u: Unit, target: number, adjacent = false, selfOk = true, brave = false): 'there' | 'going' | 'blocked' {
  const key = target * 4 + (adjacent ? 1 : 0) + (selfOk ? 0 : 2);
  const here = idx(u.x, u.y, u.z);
  if (!u.path || u.pathGoal !== key) {
    const p = g.w.findPath(here, target, adjacent, brave, selfOk);
    if (!p) return 'blocked';
    u.path = p;
    u.pathGoal = key;
  }
  if (!u.path.length) return 'there';
  if (u.moveCd > 0) {
    u.moveCd--;
    return 'going';
  }
  const next = u.path[0];
  if (brave ? !g.w.passable(next) : !g.w.safe(next)) {
    u.path = null; // something changed: find another way next tick
    return 'going';
  }
  u.path.shift();
  g.moveUnit(u, next);
  u.moveCd = moveDelay(g, u);
  if (u.carry) {
    const it = g.items.get(u.carry);
    if (it) {
      it.x = u.x;
      it.y = u.y;
      it.z = u.z;
    }
  }
  return u.path.length ? 'going' : 'there';
}

const isDown = (u: Unit) => u.downSince > 0;
export const canWalk = (u: Unit) => !u.dead && !isDown(u) && u.state !== 'caged' && !u.carriedBy;

// ------------------------------------------------------------------ tools & equipment
function hasTool(g: Game, u: Unit, tool: 'pick' | 'axe'): boolean {
  if (u.equip[tool]) return true;
  // a battle axe in the weapon hand works too
  const wpn = g.items.get(u.equip.weapon);
  return !!wpn && ITEMS[wpn.type].tool === tool;
}
export function tryEquip(g: Game, u: Unit, it: Item): Try {
  const slot = g.slotFor(it);
  if (!slot) return 'That cannot be equipped';
  if (it.held === u.id) return 'Already equipped';
  if (!g.onGround(it)) return 'Someone else has it';
  if (it.forbid) return 'It is forbidden (right-click it to allow)';
  if (!g.itemFree(it, u)) return 'It is reserved for another job';
  if (!g.w.canReach(g.cellOf(u), g.cellOf(it), true)) return 'No path to it';
  return mk('equip', `Picking up ${g.itemName(it, true)}`, g.cellOf(it), { item: it.id });
}
function toolJob(g: Game, u: Unit, tool: 'pick' | 'axe', then: Job): Try {
  if (hasTool(g, u, tool)) return then;
  const info = {};
  const it = g.findItem(u, (i) => ITEMS[i.type].tool === tool, info);
  if (!it) {
    const held = Array.from(g.units.values()).filter((o) => o.isDwarf && !o.dead && o !== u && hasTool(g, o, tool)).length;
    const name = tool === 'pick' ? 'a pick' : 'an axe';
    if (held && !('unreachable' in info)) return `needs ${name}: all ${held} are held by other dwarves (forge another, or trade for one)`;
    return g.whyNoItem(`needs ${name}`, info);
  }
  const eq = tryEquip(g, u, it);
  if (!isJob(eq)) return eq;
  eq.next = then;
  return eq;
}

// ------------------------------------------------------------------ digging & other designations
export function desigTime(g: Game, u: Unit, cell: number, d: number): number {
  const m = MATS[g.w.mat[cell]];
  const sk = g.speedMul(u, DG_LABOR[d]);
  switch (d) {
    case DG.Chop: return 160 / sk;
    case DG.Gather: return 50 / sk;
    case DG.Smooth: return 160 / sk;
    case DG.Engrave: return 320 / sk;
    case DG.Remove: return 60 / sk;
    default: return (g.w.tile[cell] === T.Wall ? 70 * m.hard : 40) / sk;
  }
}
export function tryDesig(g: Game, u: Unit, cell: number): Try {
  const w = g.w;
  const d = w.desig[cell];
  if (!d) return 'Nothing is designated here';
  const v = validDesig(g, cell, d);
  if (!v.ok) {
    g.designate(cell, 0);
    return v.why;
  }
  const key = 'd' + cell;
  const other = g.claimant(key);
  if (other && other !== u) return `${first(other)} is already doing it`;
  const selfOk = d !== DG.Channel && d !== DG.Dig && d !== DG.Ramp;
  const from = g.cellOf(u);
  if (!w.canReach(from, cell, true, selfOk)) {
    if (!w.workSpots(cell, selfOk).length) {
      if (w.dangerous(cell) || DIRS8.some(([dx, dy]) => inMap(X(cell) + dx, Y(cell) + dy, Z(cell)) && w.dangerous(cell + dx + dy * 96))) return 'the area is flooded';
      return 'nowhere to stand next to it yet: it becomes reachable as digging gets closer (stairs need stairs directly above or below, or an open tile beside them)';
    }
    // a stairwell that broke through a cavern roof: the gap is open air, which cannot be carved
    for (let k = 1, up = cell + WH; k <= 3 && up < w.tile.length; k++, up += WH) {
      if (w.tile[up] !== T.Open) break;
      if (w.tile[up + WH] === T.Stair || k > 1) return `no path to it: there is open air above (level ${Z(up) - g.embark.z}). Stairs cannot be carved out of air — construct them there instead (Build > Structure > Stairs) to join the stairwell up`;
    }
    return 'no path to it (blocked off, or on a level with no stairs/ramp connection)';
  }
  const what = d === DG.Chop ? `${PLANTS[w.plant[cell]].name} tree` : d === DG.Gather ? PLANTS[w.plant[cell]].name : !w.revealed(cell) ? 'unknown stone' : MATS[w.mat[cell]].name;
  const job = mk('dig', `${DG_ING[d]} ${what}`, cell, { key, data: d, labor: DG_LABOR[d] });
  if (DG_LABOR[d] === 'mine') return toolJob(g, u, 'pick', job);
  if (d === DG.Chop) return toolJob(g, u, 'axe', job);
  return job;
}

// ------------------------------------------------------------------ hauling
export function tryHaul(g: Game, u: Unit, it: Item): Try {
  if (!g.onGround(it)) return 'It is not lying on the ground';
  if (it.forbid) return 'It is forbidden (right-click it to allow)';
  if (!g.itemFree(it, u)) return 'It is reserved for another job';
  if (g.stored(it)) return 'It is already in a stockpile';
  const from = g.cellOf(u);
  if (!g.w.canReach(from, g.cellOf(it), true)) return 'no path to it';
  const info: { any?: boolean; full?: boolean; unreachable?: boolean } = {};
  const dest = g.stockpileSpot(it, u, info);
  const cat = ITEMS[it.type].cat;
  if (dest < 0) {
    if (!info.any) return `no stockpile accepts ${cat} (create one in Zones, or enable ${cat} on an existing stockpile)`;
    if (info.unreachable) return `no path to a stockpile that accepts ${cat}`;
    return `every stockpile that accepts ${cat} is full`;
  }
  return mk('haul', `Hauling ${g.itemName(it, true)} to stockpile`, g.cellOf(it), { item: it.id, dest, labor: 'haul' });
}

// ------------------------------------------------------------------ construction
/** How many units of ingredient k have been delivered to the building? */
function delivered(g: Game, b: Building, ing: Ing): number {
  let n = 0;
  for (const id of b.mats) {
    const it = g.items.get(id);
    if (it && g.matches(it, ing)) n += it.n;
  }
  return n;
}
export function missingFor(g: Game, b: Building): Ing | null {
  // deliveries are matched against needs in order, so two needs never share an item type
  for (const ing of g.needsFor(b.type, b.w, b.h)) if (delivered(g, b, ing) < ing.n) return ing;
  return null;
}
function ingName(ing: Ing): string {
  const types = Array.isArray(ing.type) ? ing.type : [ing.type];
  let s = types.map((t) => ITEMS[t].name).join(' / ');
  if (ing.mat) s = `${matOf(ing.mat).name} ${s}`;
  if (ing.sub) s = plantOf(ing.sub).name || ing.sub;
  if (ing.tag === 'brewable') s = 'brewable plant';
  if (ing.tag === 'cookable') s = 'cookable food';
  if (ing.tag === 'butcherable') s = 'animal corpse';
  if (ing.tag === 'emptybarrel') s = 'empty barrel';
  if (ing.type === TRAP_WEAPONS) s = 'melee weapon (sword, axe, spear, mace…)';
  if (ing.tag === 'flux') s = 'flux stone (limestone, marble, dolomite or chalk)';
  return s;
}
export function canPlace(g: Game, type: string, x: number, y: number, z: number, bw?: number, bh?: number): Can {
  const d = BUILDINGS[type];
  const w = g.w;
  const cells = g.cellsOf({ x, y, z, w: bw ?? d.w, h: bh ?? d.h });
  if (x < 0 || y < 0 || x + (bw ?? d.w) > 96 || y + (bh ?? d.h) > 96) return NO('Off the edge of the map');
  for (const c of cells) {
    if (!w.revealed(c)) return NO('Unexplored');
    if (g.bAt.has(c)) return NO('Something is already built here');
    // digging orders are never dropped silently; an order to pick a shrub simply gives way to the building
    if (g.w.desig[c] && g.w.desig[c] !== DG.Gather) return NO(`There is a "${DG_NAME[g.w.desig[c]]}" order on this tile: cancel it first (Orders > Cancel orders)`);
    const t = w.tile[c];
    if (w.water[c] > 1 || w.magma[c] > 0) {
      if (type !== 'wall' && type !== 'floor' && type !== 'bridge') return NO('Flooded');
    }
    switch (type) {
      case 'wall':
        if (t !== T.Floor && t !== T.Open && t !== T.Ramp) return NO('Walls go on floors or over open space');
        break;
      case 'floor':
        if (t !== T.Open) return NO('Floors are built over open space');
        break;
      case 'stairs':
        if (t !== T.Floor && t !== T.Open && t !== T.Ramp) return NO('Stairs go on floors or over open space');
        break;
      case 'ramp':
        if (t !== T.Floor) return NO('Ramps are built on a floor');
        break;
      case 'bridge':
        if (t !== T.Floor && t !== T.Open && t !== T.Ramp) return NO('Bridges span floors or open space');
        break;
      case 'windmill':
        if (t !== T.Floor) return NO('Needs a floor');
        if (!w.outside(c)) return NO('A windmill needs open sky above it');
        break;
      case 'waterwheel':
        if (t !== T.Floor) return NO('Needs a floor');
        if (!wheelWater(g, c)) return NO('A water wheel goes on the bank, right next to deep water');
        break;
      case 'well': case 'pump': {
        if (t !== T.Open) return NO(type === 'pump' ? 'A pump goes over a hole (channel one) with water or magma below' : 'A well goes over a hole (channel one) with water below');
        let c2 = c - WH, found = false;
        while (c2 >= 0 && w.tile[c2] !== T.Wall) {
          if (w.water[c2] > 0 || (type === 'pump' && w.magma[c2] > 0)) {
            found = true;
            break;
          }
          c2 -= WH;
        }
        if (!found) return NO(type === 'pump' ? 'Nothing to pump below this hole' : 'No water below this hole');
        break;
      }
      default:
        if (t !== T.Floor) return NO(t === T.Wall ? 'Solid rock: mine it out first' : t === T.Tree ? 'A tree is in the way' : 'Needs a floor');
    }
  }
  if (d.magma && !w.nearMagma(idx(x + 1, y + 1, z))) return NO('Needs magma within 3 levels below (dig down to the magma sea and build above it)');
  if (type === 'floor' || type === 'bridge' || type === 'stairs' || type === 'wall' || type === 'well' || type === 'pump') {
    // someone has to be able to stand next to it
    if (!cells.some((c) => w.workSpots(c, type !== 'wall' && type !== 'well' && type !== 'pump').length > 0)) return NO('No floor next to it to build from');
  }
  return OK;
}
export function placeBuilding(g: Game, type: string, x: number, y: number, z: number, bw?: number, bh?: number): Building | null {
  if (!canPlace(g, type, x, y, z, bw, bh).ok) return null;
  const b = g.addBuilding(type, x, y, z, bw, bh);
  for (const c of g.cellsOf(b)) if (g.w.desig[c] === DG.Gather) g.designate(c, 0);
  g.w.version++;
  return b;
}
const standOn = (b: Building) => !['wall', 'statue', 'fortification', 'floodgate', 'well', 'pump', 'floor', 'bridge'].includes(b.type);
/** deep water right beside a cell (or one level down past an open edge): what a water wheel needs */
export function wheelWater(g: Game, c: number): boolean {
  const w = g.w;
  for (const n of [c - 1, c + 1, c - 96, c + 96]) {
    if (n < 0 || n >= w.tile.length || cheb(n, c) !== 1) continue;
    if (w.water[n] >= 4 || (w.tile[n] === T.Open && n >= WH && w.water[n - WH] >= 4)) return true;
  }
  return false;
}

export function trySupply(g: Game, u: Unit, b: Building): Try {
  if (b.built) return 'Already built';
  if (b.suspended) return 'Construction is suspended (click the building to resume)';
  const ing = missingFor(g, b);
  if (!ing) return 'All materials have been delivered';
  const key = 'b' + b.id;
  const other = g.claimant(key);
  if (other && other !== u) return `${first(other)} is already working on it`;
  const c = g.center(b);
  if (!g.w.canReach(g.cellOf(u), c, true, standOn(b))) return 'no path to the building site';
  const info = {};
  const it = g.findItem(u, (i) => g.matches(i, ing), info);
  if (!it) return g.whyNoItem(`needs ${ingName(ing)}`, info);
  const n = Math.min(it.n, ing.n - delivered(g, b, ing));
  return mk('supply', `Bringing ${g.itemName(it, true)} to ${BUILDINGS[b.type].name}`, g.cellOf(it), { item: it.id, b: b.id, n, key, labor: 'build' });
}
export function tryConstruct(g: Game, u: Unit, b: Building): Try {
  if (b.built) return 'Already built';
  if (b.suspended) return 'Construction is suspended (click the building to resume)';
  const ing = missingFor(g, b);
  if (ing) return `still needs ${ingName(ing)}`;
  const key = 'b' + b.id;
  const other = g.claimant(key);
  if (other && other !== u) return `${first(other)} is already working on it`;
  if (!g.w.canReach(g.cellOf(u), g.center(b), true, standOn(b))) return 'no path to the building site';
  return mk('construct', `Building ${BUILDINGS[b.type].name}`, g.center(b), { b: b.id, key, labor: 'build' });
}
export function tryBuild(g: Game, u: Unit, b: Building): Try {
  return missingFor(g, b) ? trySupply(g, u, b) : tryConstruct(g, u, b);
}
export function tryDeconstruct(g: Game, u: Unit, b: Building): Try {
  const key = 'b' + b.id;
  const other = g.claimant(key);
  if (other && other !== u) return `${first(other)} is already working on it`;
  if (!g.w.canReach(g.cellOf(u), g.center(b), true)) return 'no path to it';
  return mk('deconstruct', `Removing ${BUILDINGS[b.type].name}`, g.center(b), { b: b.id, key, labor: 'build' });
}

export function finishBuilding(g: Game, u: Unit | null, b: Building) {
  const d = BUILDINGS[b.type];
  const w = g.w;
  const firstMat = g.items.get(b.mats[0]);
  b.mat = firstMat ? firstMat.mat : MAT.granite;
  b.built = true;
  if (d.tile !== undefined) {
    // constructions become part of the map
    const c = g.center(b);
    g.removeBuilding(b, false);
    w.plant[c] = 0;
    w.flag[c] = (w.flag[c] | F.Built | F.Revealed) & ~(F.Mud | F.Smooth | F.Engraved);
    w.setTile(c, d.tile, b.mat);
    if (d.tile === T.Wall) {
      for (const it of g.itemsIn(c)) g.placeItem(it, g.nearestFree(c));
      for (const o of g.unitsIn(c)) {
        g.moveUnit(o, g.nearestFree(c));
        o.path = null;
      }
      const up = c + WH;
      if (Z(up) < 32 && w.tile[up] === T.Open) {
        w.flag[up] |= F.Built;
        w.setTile(up, T.Floor, b.mat);
      }
    }
    if (d.tile === T.Ramp && Z(c) < 31 && w.tile[c + WH] !== T.Open && w.tile[c + WH] !== T.Wall) w.setTile(c + WH, T.Open);
    return;
  }
  if (firstMat && d.item) b.q = firstMat.q;
  else if (u) b.q = 0;
  if (b.type === 'bridge') b.open = false;
  if (b.type === 'floodgate') b.open = false;
  if (b.type === 'slab') {
    // a memorial quiets a ghost whose body is lost
    const ghost = Array.from(g.units.values()).find((o) => o.kind === 'ghost' && !Array.from(g.items.values()).some((i) => i.ghost === o.id && g.onGround(i)))
      || Array.from(g.units.values()).find((o) => o.kind === 'ghost');
    if (ghost) {
      b.corpse = ghost.name.replace(/^the ghost of /, '');
      g.units.delete(ghost.id);
      ghost.dead = true;
      g.say(`${b.corpse} has been memorialised. The ghost is at peace.`, 'good', g.center(b));
    } else b.corpse = 'the fallen';
  }
  g.applyBlock(b);
  if (d.blocks || b.type === 'well')
    for (const c of g.cellsOf(b))
      for (const o of g.unitsIn(c)) {
        g.moveUnit(o, g.nearestFree(c));
        o.path = null;
      }
  w.version++;
}

// ------------------------------------------------------------------ workshops
const isMagma = (b: Building) => !!BUILDINGS[b.type].magma;
export function recipeIngs(b: Building, r: Recipe): Ing[] {
  const ings = r.in.slice();
  if (r.fuel && !isMagma(b)) {
    if (!ings.some((i) => i.type === 'fuel')) ings.push({ type: 'fuel', n: 1 });
  } else if (isMagma(b)) return ings.filter((i) => i.type !== 'fuel' || r.id === 'steel');
  return ings;
}
/** stock of what a bill produces, for "until you have N" bills */
export function billStock(g: Game, r: Recipe): number {
  const s = g.stocks();
  if (r.special === 'brew') return s.drink || 0;
  if (r.special === 'cook') return s.meal || 0;
  if (r.special === 'butcher') return s.meat || 0;
  const o = r.out[0];
  if (!o) return 0;
  if (o.mat) return g.count((i) => i.type === o.type && MATS[i.mat].id === o.mat);
  return s[o.type] || 0;
}
export function tryBill(g: Game, u: Unit, b: Building, k: number): Try {
  const bill = b.bills[k];
  if (!bill) return 'No such work order';
  const r = RECIPES[bill.recipe];
  if (!b.built) return 'The workshop is not built yet';
  if (bill.paused) return 'This work order is paused';
  if (bill.mode === 'count' && bill.n <= 0) return 'This work order is complete';
  if (bill.mode === 'until' && billStock(g, r) >= bill.n) return `Target reached (have ${billStock(g, r)}, want ${bill.n})`;
  const key = 'b' + b.id;
  const other = g.claimant(key);
  if (other && other !== u) return `${first(other)} is using the workshop`;
  const c = g.center(b);
  if (!g.w.canReach(g.cellOf(u), c, false)) return 'no path to the workshop';
  if (isMagma(b) && !g.w.nearMagma(c)) return 'the magma below has drained away';
  if (BUILDINGS[b.type].machine && !b.powered) return `the ${BUILDINGS[b.type].name.toLowerCase()} is not turning: ${b.pwr || 'no power'}`;
  const items: number[] = [], counts: number[] = [];
  const used = new Set<number>();
  for (const ing of recipeIngs(b, r)) {
    let need = ing.n;
    while (need > 0) {
      const info = {};
      const it = g.findItem(u, (i) => !used.has(i.id) && g.matches(i, ing) && (ing.tag !== 'emptybarrel' || true), info);
      if (!it) return g.whyNoItem(`needs ${ing.n > 1 ? ing.n + ' × ' : ''}${ingName(ing)}`, info);
      used.add(it.id);
      const n = Math.min(need, it.n);
      items.push(it.id);
      counts.push(n);
      need -= n;
    }
  }
  return mk('craft', r.name.replace(/^(Make|Brew|Cook|Cut|Forge|Smelt|Carve|Weave|Tan|Butcher)\b/, (m) => ING[m] || m), c, { b: b.id, bill: k, recipe: r.id, items, counts, key, labor: r.labor });
}
const ING: Record<string, string> = { Make: 'Making', Brew: 'Brewing', Cook: 'Cooking', Cut: 'Cutting', Forge: 'Forging', Smelt: 'Smelting', Carve: 'Carving', Weave: 'Weaving', Tan: 'Tanning', Butcher: 'Butchering' };

function produce(g: Game, u: Unit, b: Building, r: Recipe, ins: Item[]) {
  const c = g.center(b);
  const firstIn = ins[0];
  const mat = firstIn ? firstIn.mat : 0;
  const lvl = g.skillLevel(u, r.labor);
  g.train(u, r.labor, 30);
  const out = (type: string, m: number, n: number, extra: Partial<Item> = {}) => {
    const it = g.spawnItem(type, m, c, n, extra);
    g.placeItem(it, c);
    // anything made in a workshop counts towards the mayor's mandate
    const md = g.ev.mandate;
    if (md && md.type === type) md.made += n;
    return it;
  };
  switch (r.special) {
    case 'brew': {
      const plant = ins.find((i) => i.type === 'plant')!;
      const barrel = ins.find((i) => i.type === 'barrel')!;
      const p = plantOf(plant.sub || '');
      out('drink', barrel.mat, 5, { sub: p.drink, q: g.qualityRoll(u, 'brew') });
      if (p.grow) out('seed', MAT.none, 1, { sub: p.id });
      break;
    }
    case 'cook': {
      const names = ins.filter((i) => i.type !== 'fuel').map((i) => g.itemName(i, true).replace(/ meat$/, '').replace(/^dwarven (wheat )?/, ''));
      const n = ins.reduce((a, i) => a + (i.type === 'fuel' ? 0 : i.n), 0);
      const style = r.id === 'feast' ? g.rng.pick(['roast', 'stew', 'feast']) : g.rng.pick(['biscuits', 'stew', 'hash']);
      // the cook saves the seeds, so cooking never starves the farm
      for (const i of ins) {
        const p = i.type === 'plant' ? plantOf(i.sub || '') : null;
        if (p && p.grow) out('seed', MAT.none, i.n, { sub: p.id });
      }
      out('meal', MAT.none, n * 2 + (r.id === 'feast' ? 2 : 0), { sub: `${names[0]} ${style}`, q: Math.min(5, g.qualityRoll(u, 'cook') + (r.id === 'feast' ? 1 : 0)) });
      break;
    }
    case 'butcher': {
      const corpse = ins[0];
      const cd = CREATURES[corpse.sub || ''] || CREATURES.deer;
      out('meat', MAT.flesh, Math.max(1, Math.round((cd.meat || 1) * (0.8 + lvl * 0.05))), { sub: cd.name });
      out('bone', MAT.bone, Math.max(1, Math.round(cd.size * 2)), { sub: cd.name });
      out('skull', MAT.bone, 1, { sub: cd.name });
      if (cd.size >= 0.5) out('hide', MAT.leather, 1, { sub: cd.name });
      break;
    }
    default:
      for (const o of r.out) {
        const m = o.mat ? MAT[o.mat] : mat;
        const d = ITEMS[o.type];
        const hasQ = !!(d.build || d.weapon || d.armor || d.cat === 'goods' || o.type === 'cutgem');
        const sub = o.sub ?? (o.type === 'cheese' ? firstIn?.sub : undefined); // yak milk makes yak cheese
        if (g.stackable({ type: o.type } as Item)) out(o.type, m, o.n, { q: hasQ ? g.qualityRoll(u, r.labor) : 0, sub });
        else for (let k = 0; k < o.n; k++) out(o.type, m, 1, { q: hasQ ? g.qualityRoll(u, r.labor) : 0 });
      }
  }
  for (const it of ins) g.removeItem(it);
}

// ------------------------------------------------------------------ farming
export function cropCan(g: Game, cell: number, crop: string): Can {
  const w = g.w;
  const p = plantOf(crop);
  if (w.tile[cell] !== T.Floor) return NO('needs a floor');
  const soil = MATS[w.mat[cell]].kind === 'soil';
  if (!soil && !(w.flag[cell] & F.Mud)) return NO('bare stone: farm on soil, or flood the floor with a little water to make mud');
  if (w.flag[cell] & F.Built) return NO('cannot farm on a constructed floor');
  const out = w.outside(cell);
  if (p.under && out) return NO(`${p.name} only grows underground (dig a room in the soil layer)`);
  if (!p.under && !out) return NO(`${p.name} only grows outdoors under the sky`);
  if (!p.under && g.season === 3) return NO('nothing grows outdoors in winter');
  return OK;
}
export function tryPlant(g: Game, u: Unit, zone: Zone, cell: number): Try {
  if (g.crops.has(cell)) return 'Something is already growing here';
  const can = cropCan(g, cell, zone.crop);
  if (!can.ok) return can.why;
  const key = 'f' + cell;
  const other = g.claimant(key);
  if (other && other !== u) return `${first(other)} is already planting here`;
  if (!g.w.canReach(g.cellOf(u), cell, false)) return 'no path to the farm plot';
  const info = {};
  const seed = g.findItem(u, (i) => i.type === 'seed' && i.sub === zone.crop, info);
  if (!seed) return g.whyNoItem(`needs ${plantOf(zone.crop).name} seeds (brewing, cooking or eating the plant gives its seeds back; caravans sell them)`, info);
  return mk('plant', `Planting ${plantOf(zone.crop).name}`, cell, { item: seed.id, key, labor: 'farm', sub: zone.crop });
}
export const ripe = (g: Game, cell: number) => {
  const c = g.crops.get(cell);
  return !!c && g.tick - c.t >= (plantOf(c.plant).grow || 1);
};
export function tryHarvest(g: Game, u: Unit, cell: number): Try {
  const c = g.crops.get(cell);
  if (!c) return 'Nothing is planted here';
  if (!ripe(g, cell)) return `Not ripe yet (${Math.ceil(((plantOf(c.plant).grow || 0) - (g.tick - c.t)) / TICKS_DAY)} more days)`;
  const key = 'f' + cell;
  const other = g.claimant(key);
  if (other && other !== u) return `${first(other)} is already harvesting here`;
  if (!g.w.canReach(g.cellOf(u), cell, false)) return 'no path to the farm plot';
  return mk('harvest', `Harvesting ${plantOf(c.plant).name}`, cell, { key, labor: 'farm' });
}

// ------------------------------------------------------------------ fishing & hunting
export function tryFish(g: Game, u: Unit, zone: Zone): Try {
  const from = g.cellOf(u);
  let best = -1, bd = 1e9, anyWater = false;
  for (const c of zone.cells) {
    if (!g.w.safe(c) || g.w.waterNear(c) < 0) continue;
    anyWater = true;
    if (g.claimed('fish' + c, u)) continue;
    const d = dist(from, c);
    if (d < bd && g.w.connected(from, c)) {
      best = c;
      bd = d;
    }
  }
  if (best < 0) return anyWater ? 'no path to the fishing spot (or every spot is taken)' : 'the fishing zone has no shore: it must include walkable tiles next to water';
  return mk('fish', 'Fishing', best, { key: 'fish' + best, labor: 'fish', zone: zone.id });
}
export function tryHunt(g: Game, u: Unit, prey: Unit): Try {
  if (prey.dead) return 'It is already dead';
  if (g.claimed('u' + prey.id, u)) return `${first(g.claimant('u' + prey.id)!)} is already hunting it`;
  if (CREATURES[prey.kind].water) return 'it is in the water where no dwarf can follow';
  if (prey.kind === 'ghost') return 'a ghost cannot be harmed: bury the body, or place a memorial slab';
  if (!g.w.canReach(g.cellOf(u), g.cellOf(prey), true)) return 'no path to it';
  const hunt = mk('hunt', `Hunting ${g.unitName(prey)}`, g.cellOf(prey), { u: prey.id, key: 'u' + prey.id, labor: 'hunt' });
  const held = g.items.get(u.equip.weapon);
  if (held && ITEMS[held.type].weapon?.ranged) {
    // a crossbow hunter tops up on bolts before setting out (and hunts with the stock if there are none)
    const quiver = g.items.get(u.equip.ammo);
    if (!quiver || quiver.n < 5) {
      const bolts = g.findItem(u, (i) => i.type === ITEMS[held.type].weapon!.ranged!.ammo);
      const eq = bolts ? tryEquip(g, u, bolts) : 'no bolts';
      if (isJob(eq)) {
        eq.next = hunt;
        return eq;
      }
    }
    return hunt;
  }
  if (u.equip.weapon || u.equip.axe || u.equip.pick) return hunt;
  // nobody wrestles a boar bare-handed: fetch a weapon first (picks are left for the miners)
  const info = {};
  const wpn = g.findItem(u, (i) => !!ITEMS[i.type].weapon && ITEMS[i.type].tool !== 'pick', info);
  if (!wpn) return g.whyNoItem('needs a weapon to hunt with (spear, sword, axe, hammer)', info);
  const eq = tryEquip(g, u, wpn);
  if (!isJob(eq)) return eq;
  eq.next = hunt;
  return eq;
}
export function trySlaughter(g: Game, u: Unit, a: Unit): Try {
  if (a.dead) return 'It is already dead';
  if (g.claimed('u' + a.id, u)) return `${first(g.claimant('u' + a.id)!)} is already on it`;
  if (!g.w.canReach(g.cellOf(u), g.cellOf(a), true)) return 'no path to it';
  return mk('slaughter', `Slaughtering ${g.unitName(a)}`, g.cellOf(a), { u: a.id, key: 'u' + a.id, labor: 'cook' });
}

// ------------------------------------------------------------------ livestock
const DAY = TICKS_DAY;
/** war training turns a dog into a war dog: tougher, and it goes for enemies from further off */
export function tryTrain(g: Game, u: Unit, a: Unit): Try {
  if (a.dead) return 'It is dead';
  if (a.kind !== 'dog') return a.kind === 'war_dog' ? 'Already trained for war' : 'Only dogs can be trained for war';
  if (g.claimed('u' + a.id, u)) return `${first(g.claimant('u' + a.id)!)} is already training it`;
  if (!g.w.canReach(g.cellOf(u), g.cellOf(a), true)) return 'no path to it';
  return mk('train', `Training ${g.unitName(a)} for war`, g.cellOf(a), { u: a.id, key: 'u' + a.id, labor: 'hunt' });
}
export const canMilk = (g: Game, a: Unit) => !!CREATURES[a.kind].milk && a.faction === 'fort' && !a.dead && g.tick >= (a.milkAt || 0);
export const canShear = (g: Game, a: Unit) => !!CREATURES[a.kind].wool && a.faction === 'fort' && !a.dead && g.tick >= (a.shearAt || 0);
export function tryTend2(g: Game, u: Unit, a: Unit, what: 'milk' | 'shear'): Try {
  const d = CREATURES[a.kind];
  if (a.dead) return 'It is dead';
  if (what === 'milk' ? !d.milk : !d.wool) return what === 'milk' ? `${d.name}s cannot be milked` : `${d.name}s have no wool`;
  const at = what === 'milk' ? a.milkAt || 0 : a.shearAt || 0;
  if (g.tick < at) return what === 'milk' ? `was milked recently (ready in ${((at - g.tick) / DAY).toFixed(1)} days)` : `the wool has not grown back (ready in ${((at - g.tick) / DAY).toFixed(1)} days)`;
  if (g.claimed('u' + a.id, u)) return `${first(g.claimant('u' + a.id)!)} is already with it`;
  if (!g.w.canReach(g.cellOf(u), g.cellOf(a), true)) return 'no path to it';
  return mk(what, `${what === 'milk' ? 'Milking' : 'Shearing'} ${g.unitName(a)}`, g.cellOf(a), { u: a.id, key: 'u' + a.id, labor: 'farm' });
}

// ------------------------------------------------------------------ levers, burial
export function tryPull(g: Game, u: Unit, b: Building): Try {
  if (!b.built) return 'The lever is not built yet';
  if (g.claimed('b' + b.id, u)) return `${first(g.claimant('b' + b.id)!)} is already on the way`;
  if (!g.w.canReach(g.cellOf(u), g.center(b), true)) return 'no path to the lever';
  return mk('pull', 'Pulling a lever', g.center(b), { b: b.id, key: 'b' + b.id, labor: 'haul' });
}
export function toggleLever(g: Game, lever: Building) {
  lever.open = !lever.open;
  lever.pull = false;
  if (!lever.links || !lever.links.length) {
    g.say('The lever is pulled. Nothing happens: it is not linked to anything.', 'info', g.center(lever));
    return;
  }
  for (const id of lever.links) {
    const b = g.buildings.get(id);
    if (!b || !b.built) continue;
    if (b.type === 'door') b.locked = !b.locked;
    else {
      b.open = !b.open;
      if (b.type === 'bridge' && !b.open) smash(g, b);
    }
    g.applyBlock(b);
    if (b.type === 'bridge') for (const c of g.cellsOf(b)) settle(g, c); // raised over a pit: whatever stood on it falls
    g.say(`${g.buildingName(b)} ${b.type === 'gear' ? (b.open ? 'disengages' : 'engages') : b.type === 'door' ? (b.locked ? 'locks' : 'unlocks') : b.type === 'bridge' ? (b.open ? 'is raised' : 'slams down') : b.open ? 'opens' : 'closes'}.`, 'info', g.center(b));
  }
}
/** The dwarven atom smasher: a lowering drawbridge obliterates everything under it. */
function smash(g: Game, b: Building) {
  let n = 0;
  for (const c of g.cellsOf(b)) {
    for (const it of g.itemsIn(c)) {
      g.removeItem(it);
      n++;
    }
    for (const o of g.unitsIn(c)) {
      g.say(`${g.unitName(o)} is obliterated by the drawbridge!`, o.faction === 'fort' ? 'death' : 'good', c);
      killUnit(g, o, 'been crushed under a drawbridge');
      for (const it of g.itemsIn(c)) g.removeItem(it); // not even a corpse is left
      n++;
    }
  }
  if (n) g.say(`The drawbridge crushes ${n} thing${n > 1 ? 's' : ''} into nothing.`, 'event', g.center(b));
}
export function tryBury(g: Game, u: Unit, corpse: Item): Try {
  if (!g.itemFree(corpse, u)) return 'Someone else is handling it';
  if (!g.w.canReach(g.cellOf(u), g.cellOf(corpse), true)) return 'no path to the body';
  let best: Building | null = null, bd = 1e9, any = false;
  for (const b of g.buildings.values()) {
    if (b.type !== 'coffin' || !b.built) continue;
    any = true;
    if (b.corpse || g.claimed('b' + b.id, u)) continue;
    const d = dist(g.cellOf(corpse), g.center(b));
    if (d < bd && g.w.canReach(g.cellOf(u), g.center(b), true)) {
      best = b;
      bd = d;
    }
  }
  if (!best) return any ? 'every coffin is occupied or unreachable: build more coffins' : 'there are no coffins: make one at a Mason or Carpenter and place it (Build > Furniture)';
  return mk('bury', `Burying ${corpse.sub}`, g.cellOf(corpse), { item: corpse.id, b: best.id, key: 'b' + best.id, labor: 'haul' });
}

// ------------------------------------------------------------------ needs
export function tryEat(g: Game, u: Unit): Try {
  const info = {};
  const from = g.cellOf(u);
  // prefer meals, then anything edible; nearest of the best kind
  let best: Item | null = null, bs = -1e9;
  for (const it of g.items.values()) {
    if (!g.edible(it)) continue;
    (info as { exists?: boolean }).exists = true;
    if (!g.itemFree(it, u)) continue;
    const c = g.cellOf(it);
    const s = (it.type === 'meal' ? 30 + it.q * 5 : it.type === 'plant' ? 0 : -10) - dist(from, c);
    if (s > bs && g.w.canReach(from, c, true)) {
      best = it;
      bs = s;
    }
  }
  if (!best) return 'exists' in info ? 'there is food, but none of it can be reached (or it is forbidden/reserved)' : 'there is no food in the fortress';
  let chair: Building | null = null, cd = 40;
  for (const b of g.buildings.values()) {
    if (b.type !== 'chair' || !b.built || g.claimed('b' + b.id, u)) continue;
    const bc = g.center(b);
    const d = dist(g.cellOf(best), bc);
    if (d >= cd || !g.w.connected(from, bc)) continue;
    // a chair only counts as a dining seat next to a table
    if (!DIRS8.some(([dx, dy]) => g.buildingAt(bc + dx + dy * 96)?.type === 'table')) continue;
    chair = b;
    cd = d;
  }
  return mk('eat', `Eating ${g.itemName(best, true)}`, g.cellOf(best), { item: best.id, b: chair ? chair.id : 0, key: chair ? 'b' + chair.id : undefined });
}
let waterSpots: number[] = [];
let waterSpotsTick = -9999;
let waterSpotsGame: Game | null = null;
/** Walkable cells next to water, or wells (cached). */
export function findWaterSpots(g: Game): number[] {
  if (waterSpotsGame === g && g.tick - waterSpotsTick < 300) return waterSpots;
  const w = g.w;
  const out: number[] = [];
  for (const b of g.buildings.values()) if (b.type === 'well' && b.built) out.push(g.center(b));
  for (let i = WH; i < w.tile.length; i++) {
    if (w.water[i] === 0 || !w.revealed(i)) continue;
    const x = X(i), y = Y(i);
    for (const [dx, dy] of DIRS8) {
      if (!inMap(x + dx, y + dy, 1)) continue;
      const n = i + dx + dy * 96;
      if (w.safe(n) && w.water[n] === 0) out.push(n);
      else if (w.safe(n + WH) && w.tile[i + WH] === T.Open) out.push(n + WH);
    }
    if (out.length > 4000) break;
  }
  waterSpots = out;
  waterSpotsTick = g.tick;
  waterSpotsGame = g;
  return out;
}
function nearestWater(g: Game, u: Unit): number {
  const from = g.cellOf(u);
  let best = -1, bd = 1e9;
  for (const c of findWaterSpots(g)) {
    const d = dist(from, c);
    if (d < bd && g.w.canReach(from, c, true)) {
      best = c;
      bd = d;
    }
  }
  return best;
}
export function tryDrink(g: Game, u: Unit): Try {
  const info = {};
  const it = g.findItem(u, (i) => i.type === 'drink', info);
  if (it) return mk('drink', `Drinking ${it.sub}`, g.cellOf(it), { item: it.id });
  const ws = nearestWater(g, u);
  if (ws < 0) return ('exists' in info ? 'the booze cannot be reached' : 'there is no alcohol') + ' and no reachable water';
  return mk('drink', 'Drinking water (no alcohol available!)', ws, { data: 1 });
}
export const isHospitalBed = (g: Game, b: Building) => !!g.zoneOfKind(g.center(b), 'hospital');
function findBed(g: Game, u: Unit, hospital: boolean): Building | null {
  const own = g.buildings.get(u.bed);
  const from = g.cellOf(u);
  if (!hospital && own && own.built && g.w.canReach(from, g.center(own), false)) return own;
  let best: Building | null = null, bd = 1e9;
  for (const b of g.buildings.values()) {
    if (b.type !== 'bed' || !b.built) continue;
    if (isHospitalBed(g, b) !== hospital) continue;
    if (hospital ? bedUser(g, b, u) : b.owner && b.owner !== u.id && g.units.has(b.owner) && !g.units.get(b.owner)!.dead) continue;
    const d = dist(from, g.center(b));
    if (d < bd && g.w.canReach(from, g.center(b), false)) {
      best = b;
      bd = d;
    }
  }
  return best;
}
/** is someone other than u lying in (or headed to) this bed? */
function bedUser(g: Game, b: Building, u: Unit): boolean {
  for (const o of g.units.values()) {
    if (o === u || o.dead) continue;
    if (o.inBed === b.id) return true;
    if (o.job && o.job.b === b.id && (o.job.type === 'rest' || o.job.type === 'rescue')) return true;
  }
  return false;
}
export function trySleep(g: Game, u: Unit): Try {
  const bed = findBed(g, u, false);
  if (bed) return mk('sleep', 'Sleeping', g.center(bed), { b: bed.id });
  return mk('sleep', 'Sleeping on the floor (no bed)', g.cellOf(u), { b: 0 });
}
export const needsRest = (u: Unit) => u.wounds.some((w) => w.sev === 2 || (!w.treated && w.bleed > 0)) || u.blood < 60;
export const needsTending = (u: Unit) => u.wounds.some((w) => !w.treated);
export function tryRest(g: Game, u: Unit): Try {
  const bed = findBed(g, u, true) || findBed(g, u, false);
  if (bed) return mk('rest', 'Resting (wounded)', g.center(bed), { b: bed.id });
  return mk('rest', 'Resting on the floor (wounded, no bed)', g.cellOf(u), { b: 0, step: 1 });
}

export function tryDress(g: Game, u: Unit): Try {
  const info = {};
  const it = g.findItem(u, (i) => i.type === 'clothes', info);
  if (!it) return g.whyNoItem('needs clothes (sew them at a Clothier from cloth, or at the Leather Works)', info);
  return mk('dress', `Putting on ${g.itemName(it, true)}`, g.cellOf(it), { item: it.id });
}

// ------------------------------------------------------------------ medicine
export function tryRescue(g: Game, u: Unit, p: Unit): Try {
  if (p.dead) return 'Too late';
  if (!isDown(p)) return `${first(p)} can walk`;
  if (p.inBed) return `${first(p)} is already in bed`;
  if (g.claimed('u' + p.id, u)) return `${first(g.claimant('u' + p.id)!)} is already on the way`;
  if (!g.w.canReach(g.cellOf(u), g.cellOf(p), true)) return `no path to ${first(p)}`;
  const bed = findBed(g, u, true) || findBed(g, u, false);
  if (!bed) return 'there is no free bed to carry them to: build a bed (ideally inside a Hospital zone)';
  return mk('rescue', `Rescuing ${p.name}`, g.cellOf(p), { u: p.id, b: bed.id, key: 'u' + p.id, labor: 'doctor' });
}
export function tryTend(g: Game, u: Unit, p: Unit): Try {
  if (p.dead) return 'Too late';
  if (p === u) return 'A dwarf cannot treat their own wounds';
  if (!needsTending(p)) return `${first(p)} has no untreated wounds`;
  if (g.claimed('u' + p.id, u)) return `${first(g.claimant('u' + p.id)!)} is already attending`;
  // wounds are treated in bed: someone who cannot walk has to be carried there first
  if (!p.inBed && isDown(p)) return `${first(p)} must be carried to a bed first`;
  if (!p.inBed && !(p.job && p.job.type === 'rest')) return `${first(p)} must be resting first`;
  if (!g.w.canReach(g.cellOf(u), g.cellOf(p), true)) return `no path to ${first(p)}`;
  const cloth = g.findItem(u, (i) => i.type === 'cloth' || i.type === 'splint');
  return mk('tend', `Treating ${p.name}`, cloth ? g.cellOf(cloth) : g.cellOf(p), { u: p.id, key: 'u' + p.id, labor: 'doctor', item: cloth ? cloth.id : undefined, step: cloth ? 0 : 2 });
}
export const needsFeeding = (p: Unit) => (isDown(p) || !!p.inBed) && (p.hunger > 55 || p.thirst > 50);
export function tryFeed(g: Game, u: Unit, p: Unit): Try {
  if (p.dead) return 'Too late';
  if (!needsFeeding(p)) return `${first(p)} does not need feeding`;
  const key = 'feed' + p.id;
  if (g.claimed(key, u)) return `${first(g.claimant(key)!)} is already bringing something`;
  if (!g.w.canReach(g.cellOf(u), g.cellOf(p), true)) return `no path to ${first(p)}`;
  const thirsty = p.thirst > 50 && p.thirst >= p.hunger - 10;
  if (thirsty) {
    const d = g.findItem(u, (i) => i.type === 'drink');
    if (d) return mk('feed', `Bringing a drink to ${p.name}`, g.cellOf(d), { u: p.id, item: d.id, key, labor: 'doctor', data: 0 });
    const ws = nearestWater(g, u);
    if (ws < 0) return 'nothing to give them to drink: no alcohol and no reachable water';
    return mk('feed', `Bringing water to ${p.name}`, ws, { u: p.id, key, labor: 'doctor', data: 1 });
  }
  const f = g.findItem(u, (i) => g.edible(i));
  if (!f) return 'there is no food to bring';
  return mk('feed', `Bringing food to ${p.name}`, g.cellOf(f), { u: p.id, item: f.id, key, labor: 'doctor', data: 2 });
}

// ------------------------------------------------------------------ job runners
type Result = 'run' | 'done' | string;
type Runner = (g: Game, u: Unit, j: Job) => Result;
const blocked = 'the way is blocked';

/** go next to an item and pick up n of it (default: the whole stack); returns the carried item when done */
export function fetch(g: Game, u: Unit, j: Job, id: number | undefined, n?: number): Item | 'run' | string {
  const it = id ? g.items.get(id) : undefined;
  if (!it) return 'the item is gone';
  if (it.held === u.id) return it;
  if (!g.onGround(it)) return 'someone took the item';
  const r = walk(g, u, g.cellOf(it), true);
  if (r === 'blocked') return 'no path to ' + g.itemName(it, true);
  if (r === 'going') return 'run';
  const part = n ? g.split(it, n) : it;
  if (part !== it) {
    it.res = 0;
    part.res = u.id;
  }
  g.carry(u, part);
  return part;
}

export const RUN: Record<string, Runner> = {
  equip(g, u, j) {
    const it = g.items.get(j.item!);
    if (!it || !g.onGround(it)) return 'it is gone';
    const r = walk(g, u, g.cellOf(it), true);
    if (r === 'blocked') return blocked;
    if (r === 'going') return 'run';
    g.equip(u, g.split(it, ITEMS[it.type].ammo ? MAX_AMMO : 1), j.sub || g.slotFor(it)!);
    return 'done';
  },
  dig(g, u, j) {
    const cell = jcell(j);
    const d = j.data!;
    if (g.w.desig[cell] !== d) return 'the designation was cancelled';
    const selfOk = d !== DG.Channel && d !== DG.Dig && d !== DG.Ramp;
    const r = walk(g, u, cell, true, selfOk);
    if (r === 'blocked') return 'no path to it any more';
    if (r === 'going') return 'run';
    if (!validDesig(g, cell, d).ok) {
      g.designate(cell, 0);
      return 'done';
    }
    if (++j.t < desigTime(g, u, cell, d)) return 'run';
    applyDesig(g, u, cell);
    g.train(u, j.labor!, d === DG.Engrave ? 30 : 12);
    return 'done';
  },
  haul(g, u, j) {
    if (j.step === 0) {
      const r = fetch(g, u, j, j.item);
      if (typeof r === 'string') return r;
      j.item = r.id;
      j.step = 1;
    }
    const r = walk(g, u, j.dest!, false);
    if (r === 'blocked') return 'no path to the stockpile';
    if (r === 'going') return 'run';
    g.drop(u);
    return 'done';
  },
  supply(g, u, j) {
    const b = g.buildings.get(j.b!);
    if (!b || b.built) return 'the building site is gone';
    if (j.step === 0) {
      const r = fetch(g, u, j, j.item, j.n);
      if (typeof r === 'string') return r;
      j.item = r.id;
      j.step = 1;
    }
    const r = walk(g, u, g.center(b), true, standOn(b));
    if (r === 'blocked') return 'no path to the building site';
    if (r === 'going') return 'run';
    const it = g.items.get(u.carry)!;
    u.carry = 0;
    it.held = 0;
    it.res = 0;
    it.in = b.id;
    const c = g.center(b);
    it.x = X(c);
    it.y = Y(c);
    it.z = Z(c);
    b.mats.push(it.id);
    // keep going: next material, or start building
    const next = tryBuild(g, u, b);
    if (isJob(next)) j.next = next;
    return 'done';
  },
  construct(g, u, j) {
    const b = g.buildings.get(j.b!);
    if (!b || b.built) return 'done';
    if (b.suspended) return 'construction was suspended';
    const r = walk(g, u, g.center(b), true, standOn(b));
    if (r === 'blocked') return 'no path to the building site';
    if (r === 'going') return 'run';
    b.progress += g.speedMul(u, 'build');
    if (b.progress < BUILDINGS[b.type].work) return 'run';
    g.train(u, 'build', 20);
    finishBuilding(g, u, b);
    return 'done';
  },
  deconstruct(g, u, j) {
    const b = g.buildings.get(j.b!);
    if (!b) return 'done';
    const r = walk(g, u, g.center(b), true);
    if (r === 'blocked') return blocked;
    if (r === 'going') return 'run';
    if (++j.t < 60) return 'run';
    g.removeBuilding(b);
    return 'done';
  },
  craft(g, u, j) {
    const b = g.buildings.get(j.b!);
    if (!b || !b.built) return 'the workshop is gone';
    const bill = b.bills[j.bill!];
    const r = RECIPES[j.recipe!];
    if (!j.forced && (!bill || bill.recipe !== j.recipe || bill.paused)) return 'the work order was cancelled';
    const c = g.center(b);
    const items = j.items!;
    const k = j.step >> 1;
    if (k < items.length) {
      if ((j.step & 1) === 0) {
        const it = g.items.get(items[k]);
        if (it && g.cellOf(it) === c && g.onGround(it) && it.n === j.counts![k]) {
          j.step += 2; // already at the workshop
          return 'run';
        }
        const f = fetch(g, u, j, items[k], j.counts![k]);
        if (typeof f === 'string') return f === 'run' ? 'run' : `ingredient problem: ${f}`;
        items[k] = f.id;
        j.step++;
      }
      const w = walk(g, u, c, false);
      if (w === 'blocked') return 'no path to the workshop';
      if (w === 'going') return 'run';
      const it = g.items.get(u.carry);
      if (it) {
        // set it down in the workshop, still reserved for this job (do not merge into other stacks)
        u.carry = 0;
        it.held = 0;
        g.placeItem(it, c);
        items[k] = it.id;
      }
      j.step++;
      return 'run';
    }
    const w = walk(g, u, c, false);
    if (w === 'blocked') return 'no path to the workshop';
    if (w === 'going') return 'run';
    const ins = items.map((i) => g.items.get(i));
    if (ins.some((i) => !i)) return 'an ingredient went missing';
    b.worker = u.id;
    j.t += g.speedMul(u, r.labor) * (u.sober > TICKS_DAY * 6 ? 0.6 : 1);
    if (j.t < r.work) return 'run';
    b.worker = 0;
    produce(g, u, b, r, ins as Item[]);
    if (bill && bill.recipe === j.recipe && bill.mode === 'count') {
      bill.n--;
      if (bill.n <= 0) b.bills.splice(j.bill!, 1);
    }
    return 'done';
  },
  plant(g, u, j) {
    const cell = jcell(j);
    if (g.crops.has(cell)) return 'done';
    if (j.step === 0) {
      const f = fetch(g, u, j, j.item, 1);
      if (typeof f === 'string') return f;
      j.item = f.id;
      j.step = 1;
    }
    const w = walk(g, u, cell, false);
    if (w === 'blocked') return 'no path to the farm plot';
    if (w === 'going') return 'run';
    if (++j.t < 40 / g.speedMul(u, 'farm')) return 'run';
    const seed = g.items.get(u.carry);
    if (!seed) return 'the seeds are gone';
    g.crops.set(cell, { plant: seed.sub!, t: g.tick });
    g.removeItem(seed);
    g.train(u, 'farm', 8);
    g.w.version++;
    return 'done';
  },
  harvest(g, u, j) {
    const cell = jcell(j);
    const crop = g.crops.get(cell);
    if (!crop) return 'done';
    const w = walk(g, u, cell, false);
    if (w === 'blocked') return 'no path to the farm plot';
    if (w === 'going') return 'run';
    if (++j.t < 30 / g.speedMul(u, 'farm')) return 'run';
    g.crops.delete(cell);
    const lvl = g.skillLevel(u, 'farm');
    g.spawnItem('plant', MAT.none, cell, 2 + (g.rng.chance(0.2 + lvl * 0.08) ? 1 : 0) + (g.rng.chance(lvl * 0.06) ? 1 : 0), { sub: crop.plant });
    g.train(u, 'farm', 10);
    g.w.version++;
    return 'done';
  },
  fish(g, u, j) {
    const cell = jcell(j);
    const w = walk(g, u, cell, false);
    if (w === 'blocked') return 'no path to the fishing spot';
    if (w === 'going') return 'run';
    if (g.w.waterNear(cell) < 0) return 'the water is gone';
    j.t += g.speedMul(u, 'fish');
    if (j.t < 280) return 'run';
    g.train(u, 'fish', 15);
    if (g.rng.chance(0.55 + g.skillLevel(u, 'fish') * 0.04)) {
      const name = g.rng.pick(['carp', 'pike', 'trout', 'cave lobster', 'perch', 'turtle']);
      g.spawnItem('fish', MAT.flesh, cell, 1 + g.rng.int(2), { sub: name });
    }
    return 'done';
  },
  hunt(g, u, j) {
    const prey = g.units.get(j.u!);
    if (!prey || prey.dead) return 'done';
    if (prey.state === 'caged') return 'it has been caged';
    u.target = prey.id;
    return engage(g, u, prey) ? 'run' : 'lost the trail (no path)';
  },
  slaughter(g, u, j) {
    const a = g.units.get(j.u!);
    if (!a || a.dead) return 'done';
    const w = walk(g, u, g.cellOf(a), true);
    if (w === 'blocked') return blocked;
    if (w === 'going') return 'run';
    if (++j.t < 50) return 'run';
    killUnit(g, a, 'been slaughtered');
    return 'done';
  },
  train(g, u, j) {
    const a = g.units.get(j.u!);
    if (!a || a.dead) return 'the animal is gone';
    const w = walk(g, u, g.cellOf(a), true);
    if (w === 'blocked') return blocked;
    if (w === 'going') return 'run';
    a.path = null; // it sits and pays attention
    j.t += g.speedMul(u, 'hunt');
    if (j.t < 300) return 'run';
    const d = CREATURES.war_dog;
    a.kind = 'war_dog';
    a.fg = d.fg;
    a.skill = d.skill;
    a.maxHp = Math.round(40 * d.size);
    a.hp = a.maxHp;
    a.train = false;
    g.train(u, 'hunt', 40);
    g.say(`${first(u)} has trained ${a.name} into a war dog.`, 'good', g.cellOf(a));
    return 'done';
  },
  milk(g, u, j) {
    return tendAnimal(g, u, j, 'milk');
  },
  shear(g, u, j) {
    return tendAnimal(g, u, j, 'shear');
  },
  pull(g, u, j) {
    const b = g.buildings.get(j.b!);
    if (!b) return 'the lever is gone';
    const w = walk(g, u, g.center(b), true);
    if (w === 'blocked') return 'no path to the lever';
    if (w === 'going') return 'run';
    if (++j.t < 20) return 'run';
    toggleLever(g, b);
    return 'done';
  },
  bury(g, u, j) {
    const b = g.buildings.get(j.b!);
    if (!b) return 'the coffin is gone';
    if (j.step === 0) {
      const f = fetch(g, u, j, j.item);
      if (typeof f === 'string') return f;
      j.step = 1;
    }
    const w = walk(g, u, g.center(b), true);
    if (w === 'blocked') return 'no path to the coffin';
    if (w === 'going') return 'run';
    const it = g.items.get(u.carry);
    if (it) {
      b.corpse = it.sub;
      g.say(`${it.sub} has been laid to rest.`, 'info', g.center(b));
      const ghost = g.units.get(it.ghost || 0);
      if (ghost) {
        g.units.delete(ghost.id);
        ghost.dead = true;
        g.say(`The ghost of ${it.sub} is at peace.`, 'good', g.center(b));
      }
      g.removeItem(it);
    }
    return 'done';
  },
  eat(g, u, j) {
    if (j.step === 0) {
      const f = fetch(g, u, j, j.item, 1);
      if (typeof f === 'string') return f;
      j.item = f.id;
      j.step = 1;
    }
    const chair = g.buildings.get(j.b || 0);
    if (j.step === 1) {
      if (chair) {
        const w = walk(g, u, g.center(chair), false);
        if (w === 'going') return 'run';
      }
      j.step = 2;
    }
    if (++j.t < 50) return 'run';
    const it = g.items.get(u.carry);
    if (!it) return 'the food is gone';
    u.hunger = Math.max(0, u.hunger - 85);
    if (it.type === 'meal') g.think(u, it.q >= 3 ? 'ate a truly exquisite meal' : 'ate a fine prepared meal', it.q >= 3 ? 8 : 4);
    else if (it.type === 'plant') {
      g.think(u, 'ate raw plants', -1);
      const p = plantOf(it.sub || '');
      if (p.grow) g.spawnItem('seed', MAT.none, g.cellOf(u), 1, { sub: p.id });
    } else if (it.type === 'cheese') g.think(u, 'ate some cheese', 1);
    else g.think(u, 'ate raw meat', -3);
    if (chair && g.cellOf(u) === g.center(chair)) g.think(u, 'dined at a proper table', 2);
    else g.think(u, 'had to eat without a table', -2);
    g.removeItem(it);
    return 'done';
  },
  drink(g, u, j) {
    if (j.data === 1) {
      const w = walk(g, u, jcell(j), true);
      if (w === 'blocked') return 'no path to water';
      if (w === 'going') return 'run';
      if (++j.t < 40) return 'run';
      u.thirst = 0;
      g.think(u, 'had to drink water like an elf', -4);
      return 'done';
    }
    const it = g.items.get(j.item!);
    if (!it || !g.onGround(it)) return 'the drink is gone';
    const w = walk(g, u, g.cellOf(it), true);
    if (w === 'blocked') return 'no path to the drink';
    if (w === 'going') return 'run';
    if (++j.t < 40) return 'run';
    u.thirst = 0;
    u.sober = 0;
    if (it.sub === u.likes) g.think(u, `drank ${it.sub}, a personal favourite`, 6);
    else g.think(u, it.q >= 3 ? 'had a truly superb drink' : 'had a good drink', it.q >= 3 ? 5 : 3);
    it.res = 0;
    g.consume(it, 1);
    return 'done';
  },
  sleep(g, u, j) {
    const bed = g.buildings.get(j.b || 0);
    if (j.step === 0) {
      if (bed) {
        const w = walk(g, u, g.center(bed), false);
        if (w === 'going') return 'run';
        if (w === 'there') {
          u.inBed = bed.id;
          if (!bed.owner || !g.units.has(bed.owner) || g.units.get(bed.owner)!.dead) bed.owner = u.id;
          if (bed.owner === u.id) u.bed = bed.id;
        }
      }
      j.step = 1;
      j.data = u.inBed ? 1 : 0;
    }
    u.tired -= 100 / (TICKS_DAY * 0.28) + 100 / (TICKS_DAY * 1.6);
    if (u.tired > 0 && u.thirst < 90 && u.hunger < 90) return 'run';
    u.tired = Math.max(0, u.tired);
    if (j.data) {
      const q = bed ? roomQuality(g, g.center(bed)) : 0;
      g.think(u, q >= 2 ? 'slept in a fine bedroom' : q >= 1 ? 'slept in a decent bedroom' : 'slept in a bed', q >= 2 ? 5 : q >= 1 ? 3 : 1);
    } else g.think(u, 'slept on the cold floor', -4);
    u.inBed = 0;
    return 'done';
  },
  rest(g, u, j) {
    const bed = g.buildings.get(j.b || 0);
    if (j.step === 0) {
      if (bed && canWalk(u)) {
        const w = walk(g, u, g.center(bed), false);
        if (w === 'going') return 'run';
        if (w === 'there') u.inBed = bed.id;
      }
      j.step = 1;
    }
    if (bed && g.cellOf(u) === g.center(bed)) u.inBed = bed.id;
    u.tired = Math.max(0, u.tired - 100 / (TICKS_DAY * 0.5));
    if (needsRest(u)) return 'run';
    u.inBed = 0;
    return 'done';
  },
  rescue(g, u, j) {
    const p = g.units.get(j.u!);
    const bed = g.buildings.get(j.b!);
    if (!p || p.dead) return 'the patient has died';
    if (!bed) return 'the bed is gone';
    if (j.step === 0) {
      const w = walk(g, u, g.cellOf(p), true);
      if (w === 'blocked') return `no path to ${first(p)}`;
      if (w === 'going') return 'run';
      p.carriedBy = u.id;
      j.step = 1;
    }
    const w = walk(g, u, g.center(bed), false);
    g.moveUnit(p, g.cellOf(u));
    if (w === 'blocked') {
      p.carriedBy = 0;
      return 'no path to the bed';
    }
    if (w === 'going') return 'run';
    p.carriedBy = 0;
    p.inBed = bed.id;
    p.job = mk('rest', 'Resting (wounded)', g.center(bed), { b: bed.id, step: 1, started: g.tick });
    g.think(p, 'was rescued', 4);
    return 'done';
  },
  tend(g, u, j) {
    const p = g.units.get(j.u!);
    if (!p || p.dead) return 'the patient has died';
    if (j.step === 0) {
      const f = fetch(g, u, j, j.item, 1);
      if (f === 'run') return 'run';
      if (typeof f === 'string') j.item = undefined; // no bandage after all; carry on without
      else j.item = f.id;
      j.step = 2;
    }
    const w = walk(g, u, g.cellOf(p), true);
    if (w === 'blocked') return `no path to ${first(p)}`;
    if (w === 'going') return 'run';
    j.t += g.speedMul(u, 'doctor');
    if (j.t < 120) return 'run';
    const supplies = g.items.get(u.carry);
    const lvl = g.skillLevel(u, 'doctor');
    for (const wd of p.wounds) {
      if (wd.treated) continue;
      wd.treated = true;
      wd.bleed = 0;
      wd.heal = Math.round(wd.heal * (supplies ? 0.5 : 0.8) * (1 - lvl * 0.03));
    }
    if (supplies) g.removeItem(supplies);
    g.train(u, 'doctor', 40);
    g.think(p, 'received medical care', 3);
    g.say(`${first(u)} has treated ${p.name}'s wounds${supplies ? '' : ' (no cloth or splints: healing will be slow)'}.`, 'good', g.cellOf(p));
    return 'done';
  },
  feed(g, u, j) {
    const p = g.units.get(j.u!);
    if (!p || p.dead) return 'the patient has died';
    if (j.step === 0) {
      if (j.data === 1) {
        const w = walk(g, u, jcell(j), true);
        if (w === 'blocked') return 'no path to water';
        if (w === 'going') return 'run';
      } else {
        const f = fetch(g, u, j, j.item, 1);
        if (typeof f === 'string') return f;
        j.item = f.id;
      }
      j.step = 1;
    }
    const w = walk(g, u, g.cellOf(p), true);
    if (w === 'blocked') return `no path to ${first(p)}`;
    if (w === 'going') return 'run';
    const it = g.items.get(u.carry);
    if (j.data === 1) p.thirst = 0;
    else if (it && it.type === 'drink') {
      p.thirst = 0;
      p.sober = 0;
      u.carry = 0;
      g.placeItem(it, g.cellOf(u));
      g.consume(it, 1);
    } else if (it) {
      p.hunger = Math.max(0, p.hunger - 85);
      g.removeItem(it);
    }
    g.think(p, 'was cared for while bedridden', 2);
    return 'done';
  },
  dress(g, u, j) {
    const f = fetch(g, u, j, j.item, 1);
    if (typeof f === 'string') return f;
    if (++j.t < 30) return 'run';
    u.wear = 100;
    if (f.q >= 3) g.think(u, 'put on a truly splendid outfit', 4);
    else g.think(u, 'put on fresh clothes', 2);
    g.removeItem(f);
    return 'done';
  },
  idle(g, u, j) {
    const w = walk(g, u, jcell(j), false);
    if (w === 'blocked') return 'done';
    if (w === 'going') return 'run';
    return ++j.t < (j.data || 60) ? 'run' : 'done';
  },
  move(g, u, j) {
    const w = walk(g, u, jcell(j), false, true, true);
    if (w === 'blocked') return 'no path there';
    return w === 'going' ? 'run' : 'done';
  },
};

function tendAnimal(g: Game, u: Unit, j: Job, what: 'milk' | 'shear'): string {
  const a = g.units.get(j.u!);
  if (!a || a.dead) return 'the animal is gone';
  const w = walk(g, u, g.cellOf(a), true);
  if (w === 'blocked') return blocked;
  if (w === 'going') return 'run';
  a.path = null; // it stands still for it
  j.t += g.speedMul(u, 'farm');
  if (j.t < 60) return 'run';
  const name = CREATURES[a.kind].name;
  if (what === 'milk') {
    g.spawnItem('milk', MAT.none, g.cellOf(u), 2, { sub: name });
    a.milkAt = g.tick + DAY * 4;
  } else {
    g.spawnItem('wool', MAT.wool, g.cellOf(u), 2, { sub: name });
    a.shearAt = g.tick + DAY * 10;
  }
  g.train(u, 'farm', 10);
  return 'done';
}

/** 0 = bare, 1 = decent, 2 = fine: how nice the room around a cell is (smooth/engraved walls, furniture) */
export function roomQuality(g: Game, cell: number): number {
  let v = 0;
  const x = X(cell), y = Y(cell), z = Z(cell);
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      if (!inMap(x + dx, y + dy, z)) continue;
      const c = idx(x + dx, y + dy, z);
      const f = g.w.flag[c];
      if (f & F.Engraved) v += 3;
      else if (f & F.Smooth) v += 1;
      const b = g.buildingAt(c);
      if (b && b.built && ['chest', 'cabinet', 'statue', 'door', 'table', 'chair'].includes(b.type)) v += 4 + b.q * 2;
    }
  return v >= 30 ? 2 : v >= 10 ? 1 : 0;
}

/** Advance the unit's job by one tick. */
export function runJob(g: Game, u: Unit) {
  const j = u.job;
  if (!j) return;
  const run = RUN[j.type];
  const r = run ? run(g, u, j) : 'unknown job';
  if (r === 'run') return;
  if (r === 'done') {
    const next = j.next;
    const forced = j.forced;
    j.next = undefined;
    // finish this link of the chain but keep the claims of the rest
    if (j.key && (!next || next.key !== j.key) && g.claims.get(j.key) === u.id) g.claims.delete(j.key);
    release(g, u, j.item);
    if (j.items) for (const i of j.items) release(g, u, i);
    if (j.dest !== undefined && g.spRes.get(j.dest) === u.id) g.spRes.delete(j.dest);
    if (u.carry && j.type !== 'equip') g.drop(u);
    u.job = null;
    u.path = null;
    u.target = 0;
    u.idleSince = g.tick;
    if (next) {
      u.job = next;
      if (!next.started) assignChain(g, u, next, !!forced);
    }
    return;
  }
  endJob(g, u, r);
}
function assignChain(g: Game, u: Unit, job: Job, forced: boolean) {
  u.job = null;
  assign(g, u, job, forced);
}

// ------------------------------------------------------------------ finding work
const NEAR = 6; // how many of the nearest candidates to consider per labor

function nearest<X>(list: Iterable<X>, cellOf: (x: X) => number, from: number, k: number): X[] {
  const arr: { x: X; d: number }[] = [];
  for (const x of list) arr.push({ x, d: dist(from, cellOf(x)) });
  arr.sort((a, b) => a.d - b.d);
  return arr.slice(0, k).map((a) => a.x);
}

/**
 * A task a dwarf might take. `group` names what its failure would have in common with other candidates
 * ("no stockpile takes stone", "no doors to install"): once one of a group fails that way the rest are
 * skipped, so a pile of impossible jobs nearby never hides a possible one further away.
 */
type Cand = (() => Try) & { group?: string };
const inGroup = (group: string, f: () => Try): Cand => Object.assign(f, { group });

/** candidate tasks for one labor, nearest first */
function candidates(g: Game, u: Unit, labor: Labor): Cand[] {
  const from = g.cellOf(u);
  const out: Cand[] = [];
  const desigs = () => {
    const cells: number[] = [];
    for (const c of g.desigs) if (DG_LABOR[g.w.desig[c]] === labor && !g.claimed('d' + c, u)) cells.push(c);
    // prefer cells that can be worked right now; among those, the nearest
    const reach = cells.filter((c) => g.w.canReach(from, c, true, g.w.desig[c] !== DG.Channel && g.w.desig[c] !== DG.Dig && g.w.desig[c] !== DG.Ramp));
    for (const c of nearest(reach.length ? reach : cells, (c) => c, from, reach.length ? NEAR : 2)) out.push(() => tryDesig(g, u, c));
  };
  switch (labor) {
    case 'doctor': {
      for (const p of g.units.values()) {
        if (!p.isDwarf || p.dead || p === u) continue;
        if (isDown(p) && !p.inBed && !p.carriedBy) out.push(() => tryRescue(g, u, p));
        if (needsTending(p) && (p.inBed || (!isDown(p) && p.job?.type === 'rest'))) out.push(() => tryTend(g, u, p));
        if (needsFeeding(p)) out.push(() => tryFeed(g, u, p));
      }
      break;
    }
    case 'mine': case 'chop': case 'mason':
      desigs();
      break;
    case 'build': {
      const bs: Building[] = [];
      for (const b of g.buildings.values()) if ((!b.built && !b.suspended) || b.remove) bs.push(b);
      for (const b of nearest(bs, (b) => g.center(b), from, 999)) {
        const ing = b.built ? null : missingFor(g, b);
        out.push(inGroup(`build:${b.type}:${ing ? ingName(ing) : b.built ? 'remove' : 'construct'}`, () => (b.remove ? tryDeconstruct(g, u, b) : tryBuild(g, u, b))));
      }
      desigs();
      break;
    }
    case 'farm': {
      const harvest: number[] = [], plant: [Zone, number][] = [];
      for (const z of g.zones.values()) {
        if (z.kind !== 'farm') continue;
        for (const c of z.cells) {
          if (g.claimed('f' + c, u)) continue;
          if (g.crops.has(c)) {
            if (ripe(g, c)) harvest.push(c);
          } else if (cropCan(g, c, z.crop).ok) plant.push([z, c]);
        }
      }
      for (const c of nearest(harvest, (c) => c, from, 3)) out.push(() => tryHarvest(g, u, c));
      for (const [z, c] of nearest(plant, (p) => p[1], from, 12)) out.push(inGroup('plant:' + z.crop, () => tryPlant(g, u, z, c)));
      for (const a of g.units.values()) {
        if (canMilk(g, a)) out.push(() => tryTend2(g, u, a, 'milk'));
        if (canShear(g, a)) out.push(() => tryTend2(g, u, a, 'shear'));
      }
      desigs();
      break;
    }
    case 'hunt':
      for (const a of g.units.values()) if (a.hunted && !a.dead) out.push(() => tryHunt(g, u, a));
      for (const a of g.units.values()) if (a.train && !a.dead) out.push(() => tryTrain(g, u, a));
      break;
    case 'fish':
      for (const z of g.zones.values()) if (z.kind === 'fishing') out.push(() => tryFish(g, u, z));
      break;
    case 'haul': {
      for (const b of g.buildings.values()) if (b.type === 'lever' && b.pull) out.push(() => tryPull(g, u, b));
      for (const it of g.items.values()) if (it.type === 'corpse' && it.dwarf && g.onGround(it) && !it.res) out.push(() => tryBury(g, u, it));
      const loose = g.looseItems().map((i) => g.items.get(i)).filter((i): i is Item => !!i && !i.res && g.onGround(i));
      for (const it of nearest(loose, (i) => g.cellOf(i), from, 999)) out.push(inGroup('haul:' + ITEMS[it.type].cat, () => tryHaul(g, u, it)));
      break;
    }
    default:
      break;
  }
  // workshop bills for this labor
  if (labor === 'cook') {
    for (const a of g.units.values()) if (a.slaughter && !a.dead) out.push(() => trySlaughter(g, u, a));
  }
  const shops: Building[] = [];
  for (const b of g.buildings.values()) if (b.built && b.bills.length && BUILDINGS[b.type].shop) shops.push(b);
  for (const b of nearest(shops, (b) => g.center(b), from, 99)) {
    b.bills.forEach((bill, k) => {
      if (RECIPES[bill.recipe].labor !== labor) return;
      out.push(() => {
        const t = tryBill(g, u, b, k);
        bill.why = isJob(t) ? '' : t;
        return t;
      });
    });
  }
  return out;
}

/** Look for something to do. Returns a job, or sets u.whyIdle to the reasons nothing could be done. */
export function findWork(g: Game, u: Unit): Job | null {
  const labors = LABORS.filter((l) => u.labors[l] > 0).sort((a, b) => u.labors[a] - u.labors[b]);
  const reasons: string[] = [];
  for (const l of labors) {
    let why = '';
    const failed = new Set<string>();
    let tries = 0;
    for (const c of candidates(g, u, l)) {
      if (c.group && failed.has(c.group)) continue;
      if (++tries > 40) break;
      const t = c();
      if (isJob(t)) return t;
      // "no path" and "someone else has it" are about that one target; anything else applies to the whole group
      if (c.group && !/path|already|reserved/.test(t)) failed.add(c.group);
      // "nothing to do" style reasons are not interesting
      if (!why && !/^(Target reached|This work order is paused|This work order is complete|Not ripe|Something is already growing|.* is (already|using))/.test(t)) why = t;
    }
    if (why) reasons.push(`${LABOR_NAME[l]}: ${why}`);
  }
  if (!labors.length) u.whyIdle = 'No labors enabled: open Labors (L) and give this dwarf something to do.';
  else if (reasons.length) u.whyIdle = 'Found work but could not do it — ' + reasons.slice(0, 3).join(' · ');
  else u.whyIdle = `Nothing to do for enabled labors (${labors.map((l) => LABOR_NAME[l]).join(', ')}).`;
  return null;
}

/**
 * "Why is nobody doing this?" — try the task with every dwarf that has the labor.
 */
export function explainTask(g: Game, labor: Labor, tryFn: (u: Unit) => Try, key?: string): string {
  const on = key ? g.claimant(key) : undefined;
  if (on) return `${on.name} is on it${on.job ? ` (${on.job.label})` : ''}.`;
  const all = g.dwarves();
  const able = all.filter((u) => u.labors[labor] > 0);
  if (!able.length) return `Nobody has the ${LABOR_NAME[labor]} labor enabled. Open Labors (L) to assign someone — or select a dwarf and right-click here to order it directly.`;
  const reasons = new Map<string, string[]>();
  let busy = '';
  for (const u of able) {
    if (!canWalk(u)) {
      reasons.set('is incapacitated', [...(reasons.get('is incapacitated') || []), first(u)]);
      continue;
    }
    const t = tryFn(u);
    if (isJob(t)) {
      if (!u.job || u.job.type === 'idle') return `${u.name} will get to it shortly.`;
      if (!busy) busy = `${u.name} can do it, but is busy: ${u.job.label}. (Select them and right-click here to prioritize.)`;
    } else reasons.set(t, [...(reasons.get(t) || []), first(u)]);
  }
  if (busy) return busy;
  return Array.from(reasons.entries()).map(([why, who]) => `${who.slice(0, 3).join(', ')}${who.length > 3 ? '…' : ''}: ${why}`).join(' · ');
}

export { CROPS, LABORS };
export type { Bill };
