// A scripted "player" used by the soak tests and diagnostics: founds and runs a plain, sensible fortress.
import { H, LABORS, PLANTS, T, W } from '../src/sim/defs';
import { Game } from '../src/sim/game';
import { DG, placeBuilding } from '../src/sim/jobs';
import { optionsAt, order, setDraft } from '../src/sim/orders';
import { idx } from '../src/sim/world';
import { computeAlerts } from '../src/sim/events';
import { explainUnit } from '../src/sim/life';
import { buildingPanel, cellPanel, laborsModal, legendsModal, stocksModal, tradeModal, unitPanel, zonePanel } from '../src/ui/panels';

/**
 * Where this player digs in. The stairwell goes three tiles up and left of this point, so the point is
 * nudged until that tile is open ground: stairs cannot be carved into a tree. Decided once per fortress.
 */
const origins = new WeakMap<Game, { x: number; y: number }>();
function origin(g: Game): { x: number; y: number } {
  let o = origins.get(g);
  if (o) return o;
  o = { x: g.embark.x, y: g.embark.y };
  search: for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const sx = g.embark.x + dx - 3, sy = g.embark.y + dy - 3;
    if (g.w.tile[idx(sx, sy, g.w.surface[sx + sy * W])] === T.Floor) {
      o = { x: g.embark.x + dx, y: g.embark.y + dy };
      break search;
    }
  }
  origins.set(g, o);
  return o;
}
/** the stairwell starts at ground level of its own column, which is not always the wagon's level */
const stairTop = (g: Game) => g.w.surface[origin(g).x - 3 + (origin(g).y - 3) * W];

export function found(g: Game) {
  const { x, y } = origin(g);
  const z = stairTop(g);
  const sz = (xx: number, yy: number) => g.w.surface[xx + yy * W];
  const cells: number[] = [];
  for (let dy = 3; dy < 14; dy++) for (let dx = -8; dx < 9; dx++) {
    const c = idx(x + dx, y + dy, sz(x + dx, y + dy));
    if (g.w.tile[c] === T.Floor) cells.push(c);
  }
  g.addZone('stockpile', cells);
  // a tavern and a temple on the grass by the wagon
  const patch = (x0: number, y0: number) => {
    const out: number[] = [];
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) {
      const c = idx(x0 + dx, y0 + dy, sz(x0 + dx, y0 + dy));
      if (g.w.tile[c] === T.Floor) out.push(c);
    }
    return out;
  };
  g.addZone('tavern', patch(x + 10, y + 3));
  g.addZone('temple', patch(x + 10, y + 8));
  g.addZone('barracks', patch(x + 14, y + 3));
  for (let yy = y - 14; yy < y + 14; yy++) for (let xx = x - 14; xx < x + 14; xx++) {
    if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
    const c = idx(xx, yy, sz(xx, yy));
    if (g.w.tile[c] === T.Tree) g.designate(c, DG.Chop);
    else if (PLANTS[g.w.plant[c]].kind === 'shrub') g.designate(c, DG.Gather);
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
  const { x, y } = origin(g);
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
  // a vampire about: accuse the dwarf whose food, thirst and rest never drop, and set the armed on a known one
  const all = g.dwarves();
  if (g.ev.drained && !all.some((u) => u.exposed)) {
    const suspect = all.find((u) => u.hunger === 0 && u.thirst === 0 && u.tired === 0);
    const accuser = all.find((u) => u !== suspect && !u.state && !u.downSince);
    const opt = suspect && accuser ? optionsAt(g, accuser, g.cellOf(suspect)).find((o) => o.label.startsWith('Accuse')) : undefined;
    if (opt && accuser) order(g, accuser, opt);
  }
  for (const v of all.filter((u) => u.exposed)) {
    for (const d of all.filter((u) => u !== v && (u.equip.weapon || u.equip.axe || u.equip.pick)).slice(0, 5)) {
      const opt = optionsAt(g, d, g.cellOf(v)).find((o) => o.label.startsWith('Attack') && o.job);
      if (opt) order(g, d, opt);
    }
  }
  // hunt game, not bears
  for (const a of g.units.values()) if (a.faction === 'wild' && ['deer', 'boar', 'groundhog'].includes(a.kind)) a.hunted = true;
  // a labor nobody alive has (the game raises an alert for this): hand it to the least busy dwarf
  const ds = g.dwarves().filter((u) => !u.child);
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

/**
 * Render every panel, modal and right-click menu the UI could show for this fortress.
 * The sim tests never touch the UI code, so this is what catches a panel that throws on some
 * state only a long game reaches (a dwarf with an unusual skill, a caged beast, a ghost).
 */
export function renderEverything(g: Game) {
  for (const u of g.units.values()) {
    explainUnit(g, u);
    unitPanel(g, u, 1);
  }
  for (const b of g.buildings.values()) buildingPanel(g, b, false);
  for (const z of g.zones.values()) zonePanel(g, z);
  for (const c of Array.from(g.itemsAt.keys()).slice(0, 300)) cellPanel(g, c);
  for (const c of Array.from(g.desigs).slice(0, 100)) cellPanel(g, c);
  laborsModal(g);
  stocksModal(g);
  legendsModal(g);
  tradeModal(g, new Set(), new Set(), '');
  computeAlerts(g);
  const d = g.dwarves()[0];
  if (!d) return;
  for (const u of g.units.values()) optionsAt(g, d, g.cellOf(u));
  for (const b of g.buildings.values()) optionsAt(g, d, g.center(b));
}
