// Machinery: windmills and water wheels make power, axles and gears carry it,
// screw pumps and millstones use it. Parts that touch form one network; a network turns
// when it makes at least as much power as its parts need.
import { BUILDINGS, POWER, T, W } from './defs';
import { Game } from './game';
import { wheelWater } from './jobs';
import type { Alert, Building } from './types';
import { WH, X, Z } from './world';

const isMachine = (b: Building | undefined): b is Building => !!b && b.built && !!BUILDINGS[b.type].machine;
const shaft = (b: Building) => b.type === 'gear' || b.type === 'axle';

/** how much this source is making right now, and why not if it is making nothing */
function output(g: Game, b: Building): [number, string] {
  if (b.type === 'windmill') return g.w.outside(g.center(b)) ? [POWER.windmill, ''] : [0, 'this windmill has a roof over it: it needs open sky'];
  if (b.type === 'waterwheel') return wheelWater(g, g.center(b)) ? [POWER.waterwheel, ''] : [0, 'this water wheel has no deep water beside it (it dried up, or froze)'];
  return [0, ''];
}

/** Work out every network: who is connected, how much power there is, and whether it turns. */
export function updatePower(g: Game) {
  const seen = new Set<number>();
  for (const start of g.buildings.values()) {
    if (!isMachine(start) || seen.has(start.id)) continue;
    const net: Building[] = [];
    const stack = [start];
    seen.add(start.id);
    while (stack.length) {
      const b = stack.pop()!;
      net.push(b);
      if (b.type === 'gear' && b.open) continue; // a disengaged gear passes nothing on
      for (const c of g.cellsOf(b)) {
        const around = [c - 1, c + 1, c - W, c + W];
        if (shaft(b)) around.push(c - WH, c + WH);
        for (const n of around) {
          if (n < 0 || n >= g.w.tile.length) continue;
          if (Z(n) === Z(c) && Math.abs(X(n) - X(c)) > 1) continue; // wrapped round the map edge
          const o = g.buildingAt(n);
          if (!isMachine(o) || seen.has(o.id)) continue;
          if (Z(n) !== Z(c) && !shaft(o)) continue; // only shafts carry power between levels
          if (o.type === 'gear' && o.open) continue;
          seen.add(o.id);
          stack.push(o);
        }
      }
    }
    let supply = 0, demand = 0, sources = 0, dead = '';
    for (const b of net) {
      const p = BUILDINGS[b.type].power || 0;
      if (p > 0) {
        sources++;
        const [out, why] = output(g, b);
        supply += out;
        if (why) dead = why;
      } else demand -= p;
    }
    const on = supply > 0 && supply >= demand;
    const why = start.type === 'gear' && start.open && net.length === 1 ? 'disengaged by its lever: nothing passes through'
      : !sources ? 'not connected to a windmill or water wheel (parts must touch: lay axles or gears between them)'
        : !supply ? dead
          : !on ? `overloaded: the network needs ${demand} power but makes only ${supply}. Add another windmill or water wheel, or disconnect something` : '';
    for (const b of net) {
      const was = b.powered;
      b.powered = on;
      b.pwr = on ? `Turning. This network makes ${supply} power and uses ${demand}.` : why;
      if (was !== on) g.w.version++;
    }
  }
}

/** Powered pumps lift fluid from the hole beneath them onto the floor beside them. */
export function tickPumps(g: Game) {
  const w = g.w;
  for (const b of g.buildings.values()) {
    if (b.type !== 'pump' || !b.built || !b.powered) continue;
    const c = g.center(b);
    // the top of whatever is down the hole
    let src = -1;
    for (let k = c - WH, n = 0; k >= 0 && n < 10 && w.tile[k] !== T.Wall; k -= WH, n++) {
      if (w.water[k] > 0 || w.magma[k] > 0) {
        src = k;
        break;
      }
    }
    if (src < 0) {
      b.pwr = 'Turning, but there is nothing left to pump below.';
      continue;
    }
    const f = w.water[src] > 0 ? w.water : w.magma;
    const other = f === w.water ? w.magma : w.water;
    // pour onto the emptiest floor beside the pump
    let out = -1, lvl = 7;
    for (const n of [c - 1, c + 1, c - W, c + W]) {
      if (n < 0 || n >= w.tile.length || Math.abs(X(n) - X(c)) > 1) continue;
      if (w.tile[n] === T.Open || !w.fluidOpen(n) || other[n] > 0 || g.buildingAt(n)?.type === 'pump') continue;
      if (f[n] < lvl) {
        out = n;
        lvl = f[n];
      }
    }
    if (out < 0) {
      b.pwr = 'Turning, but the floor around it is full (or walled in): nowhere to pour.';
      continue;
    }
    const amt = Math.min(2, f[src], 7 - f[out]);
    if (!(w.flag[src] & 32)) f[src] -= amt; // an endless source stays full
    f[out] += amt;
    if (f === w.water && w.tile[out] === T.Floor && !(w.flag[out] & 2)) w.flag[out] |= 16; // mud
    w.regionsDirty = true;
    w.version++;
    w.wake(src);
    w.wake(out);
  }
}

export function machineAlerts(g: Game, out: Alert[]) {
  let n = 0;
  for (const b of g.buildings.values()) {
    if (!isMachine(b) || b.powered || (BUILDINGS[b.type].power || 0) > -10) continue; // only things that do work
    if (b.type === 'millstone' && !b.bills.length) continue;
    if (n++ < 3) out.push({ id: 'pwr' + b.id, sev: 'warn', text: `${BUILDINGS[b.type].name}: no power`, detail: `The ${BUILDINGS[b.type].name.toLowerCase()} is not turning: ${b.pwr || 'no power'}.`, x: b.x, y: b.y, z: b.z });
  }
}
