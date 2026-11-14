// Things that come in the night: werebeasts, necromancers and their dead, ghosts, and megabeasts.
import { CREATURES, FIRST_NAMES, MAT, TICKS_DAY, WERE_KINDS, creaturesOf } from './defs';
import { Game, MOON_TICKS } from './game';
import { canWalk } from './jobs';
import { brains, killUnit, lineOfSight, nearestHostile, onDeath, setOnStruck, stepPath } from './life';
import type { Alert, Item, Unit } from './types';
import { X, Y, Z, cheb, dist } from './world';

const first = (u: Unit) => u.name.split(' ')[0];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------ werebeasts
/** A deep bite passes the curse on; a shallow one usually does not. Armor that turns the bite turns the curse. */
setOnStruck((g, a, b, sev) => {
  const were = a.kind === 'werebeast' || a.state === 'were';
  if (!were || !sev || !b.isDwarf || b.cursed || b.dead) return;
  // a cursed dwarf's bite carries it only when it goes deep, so one bad night does not turn the whole fortress
  if (sev < 2 && (a.isDwarf || !g.rng.chance(0.25))) return;
  b.cursed = a.cursed || 'wolf';
  b.cursedAt = g.tick;
  g.say(`${b.name} has been bitten by ${a.isDwarf ? a.name : g.unitName(a)}. The curse will take hold at the next full moon.`, 'death', g.cellOf(b));
});
export function werebeast(g: Game): Unit {
  const u = g.addUnit('werebeast', g.randomEdgeCell(), 'enemy');
  u.cursed = g.rng.pick(WERE_KINDS);
  u.name = g.rng.pick(FIRST_NAMES);
  u.leaveAt = g.tick + MOON_TICKS;
  g.say(`The moon is full, and something howls. ${cap(g.unitName(u))} has come! Anyone it wounds will be cursed.`, 'death', g.cellOf(u), true);
  return u;
}

// ------------------------------------------------------------------ necromancers
function raise(g: Game, necro: Unit, corpse: Item) {
  const cell = g.cellOf(corpse);
  const orig = CREATURES[corpse.sub || ''];
  const z = g.addUnit('zombie', cell, 'enemy');
  z.name = corpse.dwarf ? `the corpse of ${corpse.sub}` : `the ${orig ? orig.name : 'rotting'} zombie`;
  z.maxHp = z.hp = Math.round(32 * Math.min(1.3, Math.max(0.5, orig ? orig.size : 1)));
  z.raised = true;
  z.owner = necro.id;
  z.leaveAt = necro.leaveAt;
  g.removeItem(corpse);
  g.say(`${cap(g.unitName(necro))} gestures, and ${z.name} rises!`, 'bad', cell);
  if (corpse.dwarf) for (const d of g.dwarves()) if (dist(g.cellOf(d), cell) < 14) g.think(d, 'saw a dead friend rise again', -8, 6);
  return z;
}
brains.necromancer = (g, u) => {
  if (u.flee || (u.leaveAt && g.tick > u.leaveAt)) return false; // default behaviour takes it home
  if (g.tick < u.nextThink) {
    stepPath(g, u);
    return true;
  }
  u.nextThink = g.tick + 20;
  const here = g.cellOf(u);
  // keep away from anyone with an axe
  const foe = nearestHostile(g, u, 5);
  if (foe) {
    let best = here, bd = dist(here, g.cellOf(foe));
    for (let k = 0; k < 6; k++) {
      const c = g.randomNear(here, 8);
      const d = dist(c, g.cellOf(foe));
      if (d > bd) {
        best = c;
        bd = d;
      }
    }
    u.path = g.w.findPath(here, best, false);
    return true;
  }
  // a corpse in sight: raise it. One further off: go and look.
  let corpse: Item | null = null, cd = 40;
  for (const it of g.items.values()) {
    if (it.type !== 'corpse' || !g.onGround(it)) continue;
    const d = dist(here, g.cellOf(it));
    if (d < cd) {
      corpse = it;
      cd = d;
    }
  }
  // there is only so much dead flesh one will can hold together
  let held = 0;
  for (const o of g.units.values()) if (o.owner === u.id && o.raised && !o.dead) held++;
  if (corpse && held < 5) {
    const cc = g.cellOf(corpse);
    if (cheb(here, cc) <= 7 && Math.abs(Z(here) - Z(cc)) <= 1 && lineOfSight(g, here, cc)) {
      if (u.atkCd <= 0) {
        raise(g, u, corpse);
        u.atkCd = 500; // raising the dead is slow work
      }
      u.path = null;
    } else if (!u.path || !u.path.length) u.path = g.w.findPath(here, cc, true);
    if (u.path || cheb(here, cc) <= 7) return true;
  }
  // nothing to raise: follow the horde; with no horde left, run
  let thrall: Unit | null = null;
  for (const o of g.units.values()) if (o.owner === u.id && o.raised && !o.dead) thrall = o;
  if (!thrall) {
    u.flee = true;
    g.say(`${cap(g.unitName(u))} has no dead left to command, and flees.`, 'good', here);
    return false;
  }
  if (dist(here, g.cellOf(thrall)) > 6) u.path = g.w.findPath(here, g.cellOf(thrall), true);
  return true;
};
onDeath.push((g, u) => {
  if (u.kind !== 'necromancer') return;
  let n = 0;
  for (const o of Array.from(g.units.values())) {
    if (o.owner !== u.id || !o.raised || o.dead) continue;
    killUnit(g, o, 'collapsed as the magic left it');
    n++;
  }
  if (n) g.say(`With the necromancer dead, ${n} of its thralls crumple to the ground.`, 'event', g.cellOf(u));
});
export function necroSiege(g: Game, zombies?: number): Unit {
  const c = g.randomEdgeCell();
  const necro = g.addUnit('necromancer', c, 'enemy');
  necro.name = `${g.rng.pick(['Ngokang', 'Ushrir', 'Astesh', 'Zefon', 'Imush', 'Thikut'])} ${g.rng.pick(['Gravewhisper', 'the Pale', 'Bonecaller', 'Crypthand'])}`;
  necro.leaveAt = g.tick + TICKS_DAY * 3;
  const n = zombies ?? Math.max(2, Math.min(4, Math.round(g.dwarves().length / 8)));
  const olds = ['goblin', 'elk', 'wolf', 'deer', 'boar', 'troll', 'horse'];
  for (let k = 0; k < n; k++) {
    const kind = g.rng.pick(olds);
    const z = g.addUnit('zombie', g.randomNear(c, 3), 'enemy');
    z.name = `the ${CREATURES[kind].name} zombie`;
    z.maxHp = z.hp = Math.round(32 * Math.min(1.3, CREATURES[kind].size));
    z.raised = true;
    z.owner = necro.id;
    z.leaveAt = necro.leaveAt;
  }
  g.say(`The dead walk! ${cap(g.unitName(necro))} has come with ${n} zombies. Kill the necromancer and its thralls collapse; leave corpses lying about and they will be raised against you.`, 'death', c, true);
  return necro;
}

// ------------------------------------------------------------------ ghosts
const GHOST_AFTER = TICKS_DAY * 6;
brains.ghost = (g, u) => {
  if (g.tick >= u.nextThink) {
    u.nextThink = g.tick + 60 + g.rng.int(60);
    const here = g.cellOf(u);
    if (!u.path || !u.path.length) {
      const spot = g.meetingSpot();
      u.path = g.w.findPath(here, g.randomNear(g.w.connected(here, spot) ? spot : here, 6), false);
    }
    let seen = false;
    for (const d of g.dwarves()) {
      if (d.z !== u.z || cheb(here, g.cellOf(d)) > 4) continue;
      g.think(d, 'was haunted by the restless dead', -4, 2);
      seen = true;
    }
    if (seen && g.tick - (u.stolen || 0) > TICKS_DAY) {
      u.stolen = g.tick; // (reused as "last heard": a ghost carries nothing)
      g.say(`${cap(u.name)} moans in the halls. The dead want burying.`, 'bad', here);
    }
  }
  if ((g.tick + u.id) % 2 === 0) stepPath(g, u); // drifts slowly
  return true;
};
function ghosts(g: Game) {
  for (const it of g.items.values()) {
    if (it.type !== 'corpse' || !it.dwarf || it.ghost || !g.onGround(it) || g.tick - it.born < GHOST_AFTER) continue;
    const u = g.addUnit('ghost', g.nearestFree(g.cellOf(it)), 'wild');
    u.name = `the ghost of ${it.sub}`;
    it.ghost = u.id;
    g.say(`${cap(u.name)} has risen and is haunting the fortress! Bury the body to lay it to rest.`, 'bad', g.cellOf(u), true);
  }
}

// ------------------------------------------------------------------ megabeasts
export function megabeast(g: Game, kind?: string): Unit {
  const d = kind ? CREATURES[kind] : g.rng.pick(creaturesOf('mega'));
  const c = g.randomEdgeCell();
  const u = g.addUnit(d.id, c, 'enemy');
  u.leaveAt = g.tick + TICKS_DAY * 3; // it tires of the place eventually
  u.name = `${g.rng.pick(['Ôsust', 'Vutram', 'Nguslu', 'Idrath', 'Okab', 'Smata', 'Zuntîr'])} ${g.rng.pick(['Flamewing', 'the Mountain-Eater', 'Ashmaw', 'Dreadscale', 'Goldhoard', 'the Unending'])}`;
  g.say(`The ${d.name} ${u.name} has come! A terror of legend. Traps, marksdwarves and locked doors are worth more than courage.`, 'death', c, true);
  return u;
}

// ------------------------------------------------------------------ tick + alerts
export function tickNight(g: Game) {
  const e = g.ev;
  const t = g.tick;
  // fortresses saved before these existed: schedule them now
  if (!e.nextWere) e.nextWere = t + TICKS_DAY * 40;
  if (!e.nextNecro) e.nextNecro = t + TICKS_DAY * 75;
  if (!e.nextMega) e.nextMega = t + TICKS_DAY * 110;
  if (t % 300 === 0) ghosts(g);
  const pop = g.dwarves().length;
  if (!pop) return;
  if (t >= e.nextWere && g.fullMoon()) {
    e.nextWere = t + TICKS_DAY * (22 + g.rng.int(30));
    if (pop >= 12) werebeast(g);
  }
  if (t >= e.nextNecro) {
    e.nextNecro = t + TICKS_DAY * (40 + g.rng.int(30));
    if (pop >= 20) necroSiege(g);
  }
  if (t >= e.nextMega) {
    e.nextMega = t + TICKS_DAY * (60 + g.rng.int(50));
    if (pop >= 30) megabeast(g);
  }
}
export function nightAlerts(g: Game, out: Alert[]) {
  const moon = g.daysToMoon();
  for (const u of g.dwarves()) {
    if (u.state === 'were') out.push({ id: 'were' + u.id, sev: 'bad', text: `${first(u)}: were${u.cursed}!`, detail: `${u.name} has transformed and will attack anyone in reach until the moon sets. Keep everyone away or lock them in.`, unit: u.id, x: u.x, y: u.y, z: u.z });
    else if (u.cursed && moon < 3) out.push({ id: 'curse' + u.id, sev: moon < 1 ? 'bad' : 'warn', text: `${first(u)} turns in ${moon.toFixed(1)}d`, detail: `${u.name} carries the were${u.cursed} curse and transforms when the moon is full. Send them into a room alone (select, right-click "Go here") and lock the door (click the door) until it passes. The change heals every wound.`, unit: u.id });
  }
  const gs = Array.from(g.units.values()).filter((u) => u.kind === 'ghost' && !u.dead);
  if (gs.length) out.push({ id: 'ghosts', sev: 'warn', text: `${gs.length} ghost${gs.length > 1 ? 's' : ''}`, detail: `${gs.map((u) => cap(u.name)).slice(0, 3).join(', ')}: unburied for too long. Haunted dwarves grow miserable. Bury the body in a coffin; if the body is gone, a mason can engrave a memorial slab to place (Build > Furniture).`, x: gs[0].x, y: gs[0].y, z: gs[0].z });
  void canWalk;
  void X;
  void Y;
  void MAT;
}
