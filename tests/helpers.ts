import { MAT, T } from '../src/sim/defs';
import { Game } from '../src/sim/game';
import { step } from '../src/sim/sim';
import type { Unit } from '../src/sim/types';
import { idx } from '../src/sim/world';

/** A flat test world: soil floor at z=20, granite below. No events have been scheduled. */
export function flatGame(seed = 7): Game {
  const g = new Game(seed, true);
  // push the scripted events far into the future so scenarios are not interrupted
  for (const k of ['nextMigrants', 'nextRaid', 'nextCaravan', 'nextMood', 'nextBeast', 'nextThief', 'nextWere', 'nextNecro', 'nextMega', 'nextMandate'] as const) g.ev[k] = 1e9;
  return g;
}
export const cell = (x: number, y: number, z = 20) => idx(x, y, z);
export function run(g: Game, ticks: number, until?: () => boolean): boolean {
  for (let k = 0; k < ticks; k++) {
    step(g);
    if (until && until()) return true;
  }
  return !until;
}
/** a dwarf with every need satisfied and only the given labors */
export function dwarf(g: Game, x: number, y: number, labors: string[] = [], z = 20): Unit {
  const u = g.addDwarf(cell(x, y, z), ['fight']);
  u.militia = false;
  u.hunger = u.thirst = u.tired = 0;
  for (const l in u.labors) (u.labors as Record<string, number>)[l] = labors.includes(l) ? 1 : 0;
  return u;
}
export function give(g: Game, u: Unit, type: string, slot: string, mat = MAT.copper) {
  g.equip(u, g.spawnItem(type, mat, g.cellOf(u)), slot);
}
/** a finished building, placed without anyone having to build it */
export function built(g: Game, type: string, x: number, y: number, z = 20, w?: number, h?: number) {
  const b = g.addBuilding(type, x, y, z, w, h);
  b.built = true;
  g.applyBlock(b);
  return b;
}
/** carve a room out of the rock at level z (floor tiles) */
export function room(g: Game, x0: number, y0: number, x1: number, y1: number, z: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.w.setTile(idx(x, y, z), T.Floor);
}
