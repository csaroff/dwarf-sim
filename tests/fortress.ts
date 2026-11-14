// A scripted "player" used by the soak tests and diagnostics: founds and runs a plain, sensible fortress.
import { H, LABORS, T, W } from '../src/sim/defs';
import { Game } from '../src/sim/game';
import { DG, placeBuilding } from '../src/sim/jobs';
import { setDraft } from '../src/sim/orders';
import { idx } from '../src/sim/world';

/** the stairwell starts at ground level of its own column, which is not always the wagon's level */
const stairTop = (g: Game) => g.w.surface[g.embark.x - 3 + (g.embark.y - 3) * W];

export function found(g: Game) {
  const { x, y } = g.embark;
  const z = stairTop(g);
  const sz = (xx: number, yy: number) => g.w.surface[xx + yy * W];
  const cells: number[] = [];
  for (let dy = 3; dy < 14; dy++) for (let dx = -8; dx < 9; dx++) {
    const c = idx(x + dx, y + dy, sz(x + dx, y + dy));
    if (g.w.tile[c] === T.Floor) cells.push(c);
  }
  g.addZone('stockpile', cells);
  for (let yy = y - 14; yy < y + 14; yy++) for (let xx = x - 14; xx < x + 14; xx++) {
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const c = idx(xx, yy, sz(xx, yy));
    if (g.w.tile[c] === T.Tree) g.designate(c, DG.Chop);
    else if (g.w.plant[c] >= 10) g.designate(c, DG.Gather);
  }
  // a deep stairwell: all the way to the first cavern and beyond
  for (let k = 0; k < 16; k++) g.designate(idx(x - 3, y - 3, z - k), DG.Stair);
  // a farm in the soil just under the surface, only where there really is ground overhead
  const farm: number[] = [];
  for (let dy = -2; dy < 4; dy++) for (let dx = 1; dx < 8; dx++) {
    const c = idx(x - 3 - dx, y - 3 + dy, z - 1);
    if (g.w.tile[c] !== T.Wall) continue;
    g.designate(c, DG.Dig);
    farm.push(c);
  }
  g.addZone('farm', farm, { crop: 'plump_helmet' });
  for (const lvl of [3, 6, 10, 14]) for (let dy = -3; dy < 4; dy++) for (let dx = 1; dx < 9; dx++) g.designate(idx(x - 3 + dx, y - 3 + dy, z - lvl), DG.Dig);
  // workshops on the surface: try spots outward from the wagon until one fits
  const shops = ['still', 'carpenter', 'mason', 'kitchen', 'butcher', 'craftsdwarf', 'depot', 'mechanic'];
  for (const s of shops) {
    place: for (let r = 4; r < 20; r++) for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || y + dy > y + 1) continue;
      const bx = x + dx, by = y + dy;
      if (bx < 2 || by < 2 || bx > W - 5 || by > H - 5) continue;
      if (placeBuilding(g, s, bx, by, sz(bx, by))) break place;
    }
  }
}

/** work orders a new player would set up once the workshops stand */
export function queue(g: Game) {
  for (const b of g.buildings.values()) {
    if (!b.built || b.bills.length) continue;
    const add = (recipe: string, mode: 'forever' | 'until' | 'count', n = 0) => b.bills.push({ recipe, mode, n, paused: false });
    if (b.type === 'still') add('brew', 'until', 60);
    if (b.type === 'carpenter') { add('c_bed', 'until', 8); add('c_barrel', 'until', 6); add('c_cage', 'count', 2); }
    if (b.type === 'mason') { add('m_coffin', 'until', 3); add('m_table', 'until', 3); add('m_chair', 'until', 3); add('m_door', 'count', 2); }
    if (b.type === 'kitchen') add('meal', 'until', 30);
    if (b.type === 'butcher') add('butcher', 'forever');
    if (b.type === 'craftsdwarf') add('craft_stone', 'until', 20);
    if (b.type === 'mechanic') add('mech', 'until', 4);
  }
}
/** periodic chores: place furniture, mark game for hunting, draft everyone while enemies are about */
export function upkeep(g: Game) {
  const { x, y } = g.embark;
  const z = stairTop(g);
  let k = 0;
  for (const type of ['bed', 'bed', 'bed', 'bed', 'coffin', 'coffin', 'table', 'chair', 'cagetrap', 'door']) {
    for (let tries = 0; tries < 30; tries++, k++) {
      if (placeBuilding(g, type, x - 2 + (k % 8), y - 6 + (Math.floor(k / 8) % 7), z - 3)) break;
    }
  }
  queue(g);
  // where the stairwell broke into open air (a cavern roof), build stairs across the gap
  for (let k = 0; k < 16; k++) {
    const c = idx(x - 3, y - 3, z - k);
    if (g.w.tile[c] === T.Open && g.w.revealed(c) && !g.bAt.has(c)) placeBuilding(g, 'stairs', x - 3, y - 3, z - k);
  }
  // hunt game, not bears
  for (const a of g.units.values()) if (a.faction === 'wild' && ['deer', 'boar', 'groundhog'].includes(a.kind)) a.hunted = true;
  // a labor nobody alive has (the game raises an alert for this): hand it to the least busy dwarf
  const ds = g.dwarves();
  for (const l of LABORS) {
    if (!ds.length || ds.some((u) => u.labors[l] > 0)) continue;
    const u = ds.slice().sort((a, b) => LABORS.filter((x) => a.labors[x]).length - LABORS.filter((x) => b.labors[x]).length)[0];
    u.labors[l] = 2;
  }
}
/** The game pauses when raiders arrive; this player's answer is everyone to arms until they are gone. */
export function alarm(g: Game) {
  // only what can actually get to a dwarf counts (the game's alert makes the same distinction):
  // cavern dwellers keep to themselves, and a beast behind solid rock is not worth stopping work for
  const ds = g.dwarves();
  const foes = Array.from(g.units.values()).some((u) => u.faction === 'enemy' && u.state !== 'caged' && u.home === undefined && u.kind !== 'kobold' && ds.some((d) => g.w.canReach(g.cellOf(u), g.cellOf(d), true)))
    || ds.some((d) => d.state === 'were'); // a transformed dwarf raises an alert too
  // to arms: the militia and anyone holding something to fight with. The unarmed are left to run.
  for (const u of g.dwarves()) {
    const on = foes && (u.militia || !!(u.equip.weapon || u.equip.axe || u.equip.pick));
    if (u.drafted !== on) setDraft(g, u, on);
  }
}
