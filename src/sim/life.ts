// Life: needs, health, combat, and the per-tick brains of dwarves and creatures.
import { BUILDINGS, CREATURES, ITEMS, MAT, MATS, PARTS, PART_W, TICKS_DAY } from './defs';
import { Game, MOON_TICKS } from './game';
import {
  RUN, assign, canWalk, endJob, explainTask, findWork, hook, isJob, moveDelay, needsFeeding, needsRest, needsTending, runJob, tryDrink, tryEat, tryRescue, tryRest,
  tryDress, trySleep, tryTend, walk,
} from './jobs';
import type { Item, Job, Unit, Wound } from './types';
import { DIRS8, X, Y, Z, cheb, dist, idx, inMap } from './world';

export const HUNGER_RATE = 100 / (TICKS_DAY * 3);
export const THIRST_RATE = 100 / (TICKS_DAY * 4); // a drink roughly every two days
export const TIRED_RATE = 100 / (TICKS_DAY * 1.6);
export const SOBER_SLOW = TICKS_DAY * 5; // works slowly without booze
export const SOBER_SICK = TICKS_DAY * 12; // withdrawal starts to kill
export const STARVE = 250;
export const DEHYDRATE = 200;

const first = (u: Unit) => u.name.split(' ')[0];
const mkJob = (type: string, label: string, cell: number, extra: Partial<Job> = {}): Job => ({ type, label, step: 0, x: X(cell), y: Y(cell), z: Z(cell), t: 0, started: 0, ...extra });

// ------------------------------------------------------------------ death
export function killUnit(g: Game, u: Unit, cause: string, by?: Unit) {
  if (u.dead) return;
  const cell = g.cellOf(u);
  endJob(g, u);
  u.dead = true;
  g.dropAll(u);
  // the walking dead fall apart; everything else leaves a body
  if (u.kind === 'zombie') g.spawnItem('bone', MAT.bone, g.nearestFree(cell), 1, { sub: 'zombie' });
  else if (u.kind !== 'wagon' && u.kind !== 'ghost') g.spawnItem('corpse', MAT.flesh, g.nearestFree(cell), 1, { sub: u.isDwarf ? u.name : u.kind, dwarf: u.isDwarf });
  if (u.isDwarf) {
    g.say(`${u.name}, ${g.profession(u)}, has ${cause}.`, 'death', cell);
    g.ev.deaths++;
    for (const o of g.dwarves()) g.think(o, 'lost a friend', -6, 8);
  } else if (u.faction === 'fort') g.say(`${cap(g.unitName(u))} (tame) has ${cause}.`, 'bad', cell);
  else if (u.faction === 'enemy') g.say(`${cap(g.unitName(u))} has ${cause}.`, 'good', cell);
  else if (by && by.faction === 'fort') g.say(`${cap(g.unitName(u))} has ${cause}.`, 'combat', cell);
  if (by) {
    by.kills++;
    if (by.isDwarf && u.faction === 'enemy') g.think(by, 'took joy in slaughter', 3);
  }
  for (const b of g.buildings.values()) {
    if (b.owner === u.id) b.owner = 0;
    if (b.worker === u.id) b.worker = 0;
  }
  for (const o of g.units.values()) if (o.carriedBy === u.id) o.carriedBy = 0;
  g.units.delete(u.id);
  for (const f of onDeath) f(g, u);
}
/** called after any unit dies (night.ts: a necromancer's thralls collapse with it) */
export const onDeath: ((g: Game, u: Unit) => void)[] = [];
/** special per-kind behaviour; return true when the unit has been dealt with this tick */
export const brains: Record<string, (g: Game, u: Unit) => boolean> = {};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const an = (s: string) => (/^[aeiou]/i.test(s) ? 'an ' : 'a ') + s;

// ------------------------------------------------------------------ wounds
function addWound(g: Game, u: Unit, part: number, sev: 1 | 2, dtype: string) {
  const words: Record<string, [string, string]> = { edge: ['gashed', 'torn open'], blunt: ['bruised', 'broken'], pierce: ['punctured', 'pierced through'], fall: ['sprained', 'broken'], burn: ['burned', 'charred'] };
  const desc = (words[dtype] || words.blunt)[sev - 1];
  const bleed = dtype === 'blunt' || dtype === 'fall' ? (sev === 2 ? 0.2 : 0) : sev === 2 ? 0.5 : 0.15;
  const old = u.wounds.find((w) => w.part === part);
  if (old) {
    if (sev > old.sev) {
      old.sev = sev;
      old.desc = desc;
      old.treated = false;
      old.heal = TICKS_DAY * 8;
    }
    old.bleed = Math.max(old.bleed, bleed);
    if (bleed > 0) old.treated = false;
    return old;
  }
  const w: Wound = { part, sev, bleed, treated: false, heal: sev === 2 ? TICKS_DAY * 8 : TICKS_DAY * 2, desc };
  u.wounds.push(w);
  return w;
}
export function woundText(w: Wound) {
  return `${w.desc} ${PARTS[w.part]}${w.bleed > 0.05 ? ', bleeding' : ''}${w.treated ? ' (treated)' : w.sev === 2 ? ' (needs a doctor)' : ''}`;
}
export function fallDamage(g: Game, u: Unit, dz: number) {
  if (dz <= 0 || u.dead) return;
  const dmg = dz * (6 + g.rng.int(8)) * (dz > 1 ? 1.5 : 1);
  u.hp -= dmg;
  const sev = dmg >= u.maxHp * 0.25 ? 2 : 1;
  const part = g.rng.pick([5, 6, 5, 6, 3, 4, 1]);
  addWound(g, u, part, sev, 'fall');
  if (u.isDwarf) g.say(`${u.name} falls ${dz} level${dz > 1 ? 's' : ''}: ${PARTS[part]} ${sev === 2 ? 'broken' : 'sprained'}!`, 'bad', g.cellOf(u));
  if (u.hp <= 0) killUnit(g, u, 'died from a fall');
  else if (u.job && u.isDwarf) endJob(g, u, 'fell');
}

/** Why can't this unit move? '' if it can. */
export function downReason(u: Unit): string {
  if (u.blood < 35) return 'unconscious from blood loss';
  if (u.hp < u.maxHp * 0.25) return u.sober > SOBER_SICK ? 'collapsed from alcohol withdrawal' : 'too badly hurt to stand';
  const leg = u.wounds.find((w) => w.sev === 2 && !w.treated && w.part >= 5);
  if (leg) return `cannot walk: ${leg.desc} ${PARTS[leg.part]}`;
  const head = u.wounds.find((w) => w.sev === 2 && !w.treated && w.part === 0);
  if (head) return `knocked senseless: ${head.desc} head`;
  if (u.hunger >= STARVE * 0.85) return 'too weak from hunger to stand';
  if (u.thirst >= DEHYDRATE * 0.85) return 'too weak from thirst to stand';
  return '';
}

// ------------------------------------------------------------------ combat
function weaponOf(g: Game, u: Unit): Item | undefined {
  return g.items.get(u.equip.weapon) || g.items.get(u.equip.axe) || g.items.get(u.equip.pick);
}
/** protection on a body part: creature hide plus whatever armor covers it */
function armorAt(g: Game, u: Unit, part: number): number {
  const piece = (slot: string, share = 1) => {
    const it = g.items.get(u.equip[slot]);
    return it && ITEMS[it.type].armor ? ITEMS[it.type].armor!.prot * (MATS[it.mat].armor ?? 0.5) * (1 + it.q * 0.1) * share : 0;
  };
  let p = CREATURES[u.kind].armor || 0;
  if (part === 0) p += piece('head');
  else if (part <= 2) p += piece('body');
  else if (part <= 4) p += piece('hands') + piece('body', 0.5); // sleeves
  else p += piece('legs') + piece('feet', 0.5);
  return p;
}
export function fightSkill(g: Game, u: Unit) {
  if (u.state === 'were') return CREATURES.weredwarf.skill;
  return u.isDwarf ? g.skillLevel(u, 'fight') : u.skill;
}
/** the creature whose natural weapons this unit fights with (a transformed dwarf fights as a werebeast) */
const body = (u: Unit) => CREATURES[u.state === 'were' ? 'weredwarf' : u.kind];
const nameOf = (g: Game, u: Unit) => (u.isDwarf ? first(u) : g.unitName(u));

export interface Ranged {
  dmg: number;
  range: number;
  verb: string;
  type: 'pierce' | 'burn';
  wpn?: Item;
  ammo?: Item;
}
/** What this unit can attack with from a distance right now (a loaded crossbow, fiery breath), or null. */
export function rangedOf(g: Game, u: Unit): Ranged | null {
  if (u.state === 'were') return null;
  const d = CREATURES[u.kind];
  if (d.ranged) return d.ranged;
  const wpn = g.items.get(u.equip.weapon);
  const wd = wpn ? ITEMS[wpn.type].weapon : undefined;
  if (!wpn || !wd || !wd.ranged) return null;
  const ammo = g.items.get(u.equip.ammo);
  if (!ammo || ammo.type !== wd.ranged.ammo) return null;
  return { dmg: wd.dmg * (MATS[ammo.mat].weapon ?? 0.7) * (1 + wpn.q * 0.1), range: wd.ranged.range, verb: wd.verb, type: 'pierce', wpn, ammo };
}
/** Can something at cell a see (and shoot) cell b? Walls, trees and closed doors block; open air and water do not. */
export function lineOfSight(g: Game, a: number, b: number): boolean {
  const w = g.w;
  const ax = X(a), ay = Y(a), az = Z(a), bx = X(b), by = Y(b), bz = Z(b);
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay), Math.abs(bz - az)) * 2;
  let pz = az;
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t), z = Math.round(az + (bz - az) * t);
    const c = idx(x, y, z);
    if (c !== a && c !== b) {
      const tl = w.tile[c];
      if (tl === 1 || tl === 5 || w.block[c] & 4) return false;
    }
    if (z !== pz) {
      // passing between levels needs a hole in the floor of the upper one
      const up = idx(x, y, Math.max(z, pz));
      if (w.tile[up] === 2 || w.tile[up] === 1) return false;
      pz = z;
    }
  }
  if (bz !== pz) {
    const up = bz > pz ? b : idx(bx, by, pz);
    if (w.tile[up] === 2 && up !== b) return false;
  }
  return true;
}
export function canShoot(g: Game, a: Unit, b: Unit, r: Ranged): boolean {
  const ca = g.cellOf(a), cb = g.cellOf(b);
  return cheb(ca, cb) <= r.range && Math.abs(a.z - b.z) <= 3 && lineOfSight(g, ca, cb);
}

/** A blow has landed: armor, damage, wounds, the log line, and death. */
function strike(g: Game, a: Unit, b: Unit, base: number, dtype: string, verb: string, withW: string, sa: number) {
  let total = 0;
  for (const w of PART_W) total += w;
  let roll = g.rng.int(total), part = 0;
  while (roll >= PART_W[part]) roll -= PART_W[part++];
  const prot = armorAt(g, b, part) * (dtype === 'blunt' ? 0.7 : dtype === 'burn' ? 0.5 : 1);
  const dmg = Math.max(1, base * (0.6 + g.rng.next() * 0.8) * (1 + sa * 0.04) - prot);
  b.hp -= dmg;
  const frac = dmg / b.maxHp;
  let text = '';
  let sev = 0;
  if (frac >= 0.3) {
    sev = 2;
    text = addWound(g, b, part, 2, dtype).desc;
    if (part === 0 && b.hp < b.maxHp * 0.45 && g.rng.chance(0.5)) b.hp = 0;
  } else if (frac >= 0.1) {
    sev = 1;
    text = addWound(g, b, part, 1, dtype).desc;
  }
  const an = cap(nameOf(g, a)), bn = nameOf(g, b);
  if (a.faction === 'fort' || b.faction === 'fort') {
    if (text) g.say(`${an} ${verb} ${bn} in the ${PARTS[part]}${withW}: ${text}!`, 'combat', g.cellOf(b));
    else if (prot > base * 0.8 && g.rng.chance(0.3)) g.say(`${an} ${verb} ${bn}, but the blow glances off the armor.`, 'combat', g.cellOf(b));
  }
  onStruck(g, a, b, sev);
  if (b.hp <= 0 && !b.dead) {
    const by = a.isDwarf ? a.name : g.unitName(a);
    killUnit(g, b, dtype === 'burn' ? `been burned to death by ${by}` : part === 0 && dtype === 'edge' ? `been beheaded by ${by}` : withW.includes('bolt') ? `been shot dead by ${by}` : `been struck down by ${by}`, a);
  }
}
/** hooks for curses and the like (events.ts plugs in) */
export let onStruck: (g: Game, a: Unit, b: Unit, sev: number) => void = () => {};
export function setOnStruck(f: typeof onStruck) {
  onStruck = f;
}
function blocks(g: Game, a: Unit, b: Unit, helpless: boolean, sb: number): boolean {
  const shield = g.items.get(b.equip.shield);
  if (!shield || helpless || b.state === 'were' || !g.rng.chance(0.25 + sb * 0.03)) return false;
  g.train(b, 'fight', 3);
  if (a.isDwarf || b.isDwarf) g.say(`${cap(nameOf(g, a))} attacks, but ${nameOf(g, b)} blocks with the ${g.itemName(shield, true)}.`, 'combat', g.cellOf(b));
  return true;
}
const isHelpless = (b: Unit) => (b.downSince > 0 && (b.blood < 35 || b.hp < b.maxHp * 0.25)) || b.job?.type === 'sleep' || b.state === 'caged';

export function attack(g: Game, a: Unit, b: Unit) {
  if (a.atkCd > 0 || a.dead || b.dead || b.kind === 'ghost') return;
  const cd = body(a);
  const sa = fightSkill(g, a);
  a.atkCd = Math.max(6, 13 - Math.floor(sa / 3));
  // a fighter with a broken leg still has a weapon arm: only the unconscious, the sleeping and the caged are helpless
  const helpless = isHelpless(b);
  const sb = helpless ? -10 : fightSkill(g, b);
  // ganging up: every other attacker already on the target makes it easier to land a blow
  let allies = 0;
  for (const o of g.units.values()) if (o !== a && !o.dead && o.target === b.id && o.z === b.z && cheb(g.cellOf(o), g.cellOf(b)) <= 1) allies++;
  onAttacked(g, b, a);
  g.train(a, 'fight', 1);
  if (!g.rng.chance(Math.min(0.95, Math.max(0.15, 0.55 + (sa - sb) * 0.06 + Math.min(3, allies) * 0.1)))) return;
  if (blocks(g, a, b, helpless, sb)) return;
  const wpn = a.state === 'were' ? undefined : weaponOf(g, a);
  const wd = wpn ? ITEMS[wpn.type].weapon! : null;
  g.train(a, 'fight', 3);
  // a crossbow up close is just an awkward club
  if (wd && wd.ranged) return strike(g, a, b, 4, 'blunt', 'bashes', ` with ${a.isDwarf ? an(g.itemName(wpn!, true)) : 'its ' + g.itemName(wpn!, true)}`, sa);
  const base = wd ? wd.dmg * (MATS[wpn!.mat].weapon ?? 0.7) * (1 + wpn!.q * 0.1) : cd.dmg;
  strike(g, a, b, base, wd ? wd.type : cd.dtype, wd ? wd.verb : cd.verb, wpn ? ` with ${a.isDwarf ? an(g.itemName(wpn, true)) : 'its ' + g.itemName(wpn, true)}` : '', sa);
}
/** Loose a bolt (or a gout of fire) at a distant target. */
export function shoot(g: Game, a: Unit, b: Unit, r: Ranged) {
  if (a.atkCd > 0 || a.dead || b.dead || b.kind === 'ghost') return;
  const sa = a.isDwarf ? g.skillLevel(a, 'shoot') : a.skill;
  a.atkCd = Math.max(14, 26 - sa);
  const helpless = isHelpless(b);
  onAttacked(g, b, a);
  g.train(a, 'shoot', 4);
  const cb = g.cellOf(b);
  const d = cheb(g.cellOf(a), cb);
  const hit = g.rng.chance(Math.min(0.95, Math.max(0.1, 0.5 + sa * 0.05 - d * 0.025 + (helpless ? 0.3 : 0))));
  let withW = '';
  if (r.ammo) {
    withW = ` with ${an(MATS[r.ammo.mat].name + ' bolt')}`;
    // some bolts can be picked up again afterwards
    if (g.rng.chance(hit ? 0.25 : 0.4) && g.w.passable(cb)) g.spawnItem(r.ammo.type, r.ammo.mat, cb, 1);
    if (--r.ammo.n <= 0) {
      g.removeItem(r.ammo);
      if (a.isDwarf) g.say(`${first(a)} is out of bolts!`, 'bad', g.cellOf(a));
    }
  }
  if (!hit) return;
  if (r.type !== 'burn' && blocks(g, a, b, helpless, helpless ? -10 : fightSkill(g, b))) return;
  g.train(a, 'shoot', 8);
  strike(g, a, b, r.dmg, r.type, r.verb, withW, sa);
}
function onAttacked(g: Game, b: Unit, a: Unit) {
  if (!b.isDwarf) {
    const d = CREATURES[b.kind];
    if (b.faction === 'wild' && !d.predator && d.dmg < 4) b.flee = true;
    else if (b.faction === 'wild' && rangedOf(g, a) && !g.w.canReach(g.cellOf(b), g.cellOf(a), true)) b.flee = true; // shot from where it cannot get at the shooter
    else if (!b.target) b.target = a.id;
    return;
  }
  if (b.job && b.job.type === 'sleep') endJob(g, b, 'attacked in their sleep');
  if (a.isDwarf && a.state !== 'berserk') g.think(b, 'was attacked by a fellow dwarf', -5);
}

// ------------------------------------------------------------------ movement helpers
export function stepPath(g: Game, u: Unit): boolean {
  if (!u.path || !u.path.length) return false;
  if (u.moveCd > 0) {
    u.moveCd--;
    return true;
  }
  const next = u.path[0];
  if (!g.w.passable(next)) {
    u.path = null;
    return false;
  }
  u.path.shift();
  g.moveUnit(u, next);
  u.moveCd = moveDelay(g, u);
  return true;
}
/** Go after unit t and hit it when adjacent. Returns false when there is no way to get to it. */
export function chase(g: Game, u: Unit, t: Unit): boolean {
  const here = g.cellOf(u), tc = g.cellOf(t);
  if (u.z === t.z && cheb(here, tc) <= 1) {
    u.path = null;
    attack(g, u, t);
    return true;
  }
  // anything that can shoot stands its ground and shoots once it has a clear line
  const r = rangedOf(g, u);
  if (r && canShoot(g, u, t, r)) {
    u.path = null;
    shoot(g, u, t, r);
    return true;
  }
  if (!u.path || !u.path.length || (u.chaseAt !== tc && (g.tick + u.id) % 8 === 0)) {
    const p = g.w.findPath(here, tc, true, false, false);
    if (!p) {
      u.path = null;
      return false;
    }
    u.path = p;
    u.pathGoal = -2;
    u.chaseAt = tc;
  }
  stepPath(g, u);
  return true;
}
/** nearest unit hostile to u within range (reachable ones only if `reach`) */
export function nearestHostile(g: Game, u: Unit, range: number, reach = true): Unit | null {
  const here = g.cellOf(u);
  const ranged = reach ? rangedOf(g, u) : null;
  let best: Unit | null = null, bd = range + 0.5;
  for (const o of g.units.values()) {
    if (!g.hostile(u, o)) continue;
    if (Math.abs(o.z - u.z) > 2) continue;
    const d = cheb(here, g.cellOf(o)) + Math.abs(o.z - u.z) * 2;
    if (d >= bd) continue;
    if (CREATURES[o.kind].water) continue;
    // a target counts if it can be walked to, or shot from here
    if (reach && !g.w.canReach(here, g.cellOf(o), true) && !(ranged && canShoot(g, u, o, ranged))) continue;
    best = o;
    bd = d;
  }
  return best;
}
/** wild predators within range count as threats too */
function nearestThreat(g: Game, u: Unit, range: number): Unit | null {
  const h = nearestHostile(g, u, range);
  if (h) return h;
  for (const o of g.units.values()) {
    if (o.dead || o.target !== u.id || o.faction === 'fort') continue;
    if (Math.abs(o.z - u.z) <= 1 && cheb(g.cellOf(u), g.cellOf(o)) <= range) return o;
  }
  return null;
}
function wanderTo(g: Game, u: Unit, cell: number, wait: number) {
  u.job = mkJob('idle', 'Idle', cell, { data: wait, started: g.tick });
  u.path = null;
}

// ------------------------------------------------------------------ job runners that live here
RUN.attack = (g, u, j) => {
  const t = g.units.get(j.u!);
  if (!t || t.dead || t.state === 'caged') return 'done';
  if (j.data) {
    // against something that is not formally an enemy (a boar, a bear): fight only until it backs off.
    // 1 = self-defence, stays close; 2 = militia coming to someone's rescue, from further away
    const still = t.target && g.units.get(t.target)?.faction === 'fort' && !t.flee;
    if (!still || dist(g.cellOf(u), g.cellOf(t)) > (j.data === 2 ? 40 : 8)) return 'done';
  } else if (!g.hostile(u, t) && !j.forced) return 'done';
  u.target = t.id;
  return chase(g, u, t) ? 'run' : 'cannot reach the target';
};
RUN.flee = (g, u, j) => {
  const w = walk(g, u, idx(j.x, j.y, j.z), false);
  if (w === 'going') return 'run';
  return 'done';
};
RUN.tantrum = (g, u, j) => {
  if (g.tick > u.stateUntil) {
    u.state = '';
    g.think(u, 'vented their rage in a tantrum', 14, 4);
    g.say(`${u.name} has calmed down.`, 'info', g.cellOf(u));
    return 'done';
  }
  const here = g.cellOf(u);
  if (g.tick % 40 === 0) {
    // lash out at whatever is nearby
    for (const [dx, dy] of DIRS8) {
      if (!inMap(u.x + dx, u.y + dy, u.z)) continue;
      const c = here + dx + dy * 96;
      const o = g.unitsIn(c).find((o) => o.faction === 'fort' && o !== u);
      if (o && g.rng.chance(0.5)) {
        u.atkCd = 0;
        g.say(`${first(u)} lashes out at ${o.isDwarf ? first(o) : g.unitName(o)} in a rage!`, 'bad', c);
        const eq = u.equip;
        u.equip = {}; // fists only
        attack(g, u, o);
        u.equip = eq;
        return 'run';
      }
      const b = g.buildingAt(c);
      if (b && b.built && BUILDINGS[b.type].item && g.rng.chance(0.4)) {
        g.say(`${first(u)} topples the ${g.buildingName(b)} in a rage!`, 'bad', c);
        g.removeBuilding(b);
        return 'run';
      }
    }
  }
  const w = walk(g, u, idx(j.x, j.y, j.z), false);
  if (w !== 'going') {
    const c = g.randomNear(g.rng.chance(0.5) ? g.meetingSpot() : here, 6);
    j.x = X(c);
    j.y = Y(c);
    j.z = Z(c);
    u.path = null;
  }
  return 'run';
};

// ------------------------------------------------------------------ slow tick (every 10 ticks per unit)
function slowTick(g: Game, u: Unit) {
  const cell = g.cellOf(u);
  const cd = CREATURES[u.kind];
  // bleeding and healing
  let bleeding = false;
  for (let k = u.wounds.length - 1; k >= 0; k--) {
    const w = u.wounds[k];
    if (w.bleed > 0 && cd.undead) w.bleed = 0;
    if (w.bleed > 0) {
      u.blood -= w.bleed;
      w.bleed *= 0.99;
      if (w.bleed < 0.02) w.bleed = 0;
      else bleeding = true;
    }
    if (w.sev === 1 || w.treated || !u.isDwarf) {
      w.heal -= u.inBed ? 20 : 10;
      if (w.heal <= 0) u.wounds.splice(k, 1);
    }
  }
  if (!bleeding && u.blood < 100) u.blood = Math.min(100, u.blood + 0.12);
  if (u.hp < u.maxHp && !u.wounds.some((w) => w.sev === 2 && !w.treated) && !(u.isDwarf && u.sober > SOBER_SICK)) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.0025);
  if (u.blood <= 0) return killUnit(g, u, 'bled to death');
  // hazards
  if (g.w.magma[cell] > 0 && u.kind !== 'demon') {
    u.hp -= 30;
    if (u.hp <= 0) return killUnit(g, u, 'burned up in magma');
    addWound(g, u, g.rng.int(7), 2, 'burn');
  } else if (g.w.water[cell] >= 7 && !cd.water && !cd.flies) {
    u.hp -= u.maxHp * 0.12;
    if (u.hp <= 0) return killUnit(g, u, 'drowned');
  }
  if (u.hp <= 0) return killUnit(g, u, 'died of their wounds');
  if (!u.isDwarf) return;

  // ---- the werebeast curse: changes at the full moon, changes back when it sets
  if (u.cursed) {
    const moon = g.fullMoon();
    if (moon && u.state !== 'were' && u.state !== 'caged' && g.tick - (u.cursedAt ?? -1e9) > MOON_TICKS) {
      endJob(g, u);
      u.drafted = false;
      u.state = 'were';
      // the change knits flesh and bone: every wound is gone
      u.wounds = [];
      u.hp = u.maxHp;
      u.blood = 100;
      u.downSince = 0;
      u.inBed = 0;
      g.say(`${u.name} has transformed into a were${u.cursed}!`, 'death', cell, true);
    } else if (!moon && u.state === 'were') {
      u.state = '';
      u.target = 0;
      u.path = null;
      u.wounds = [];
      g.think(u, 'woke with no memory of the night, and blood under their nails', -6, 6);
      g.say(`${u.name} has returned to dwarven form.`, 'info', cell);
    }
  }
  if (u.state === 'were') return; // a beast has no use for beds or beer

  // ---- dwarf needs
  const asleep = u.job?.type === 'sleep';
  // a dwarf in a strange mood neither eats, drinks nor sleeps, and does not suffer for it until it is over
  const needs = u.state === 'mood' ? 0 : asleep ? 0.5 : 1;
  u.hunger += HUNGER_RATE * 10 * needs;
  u.thirst += THIRST_RATE * 10 * needs;
  u.tired += TIRED_RATE * 10 * (u.state === 'mood' ? 0 : 1);
  u.wear = Math.max(0, (u.wear ?? 100) - 1000 / (TICKS_DAY * 40)); // an outfit lasts most of a year
  u.sober += 10;
  if (u.hunger >= STARVE) return killUnit(g, u, 'starved to death');
  if (u.thirst >= DEHYDRATE) return killUnit(g, u, 'died of thirst');
  if (u.sober > SOBER_SICK && g.tick % 150 < 10) {
    u.hp -= 1;
    if (u.hp <= 0) return killUnit(g, u, 'died of sobriety');
  }
  if (g.tick % 300 < 10) {
    if (u.sober > SOBER_SICK) g.think(u, 'is wracked by alcohol withdrawal', -14, 1);
    else if (u.sober > SOBER_SLOW) g.think(u, 'needs alcohol to get through the working day', -6, 1);
    if (u.hunger > 100) g.think(u, 'is starving', -8, 1);
    if (u.thirst > 100) g.think(u, 'is parched', -8, 1);
    if (u.tired > 105) g.think(u, 'is exhausted', -4, 1);
    if ((u.wear ?? 100) <= 0) g.think(u, 'has nothing to wear', -5, 1);
    else if ((u.wear ?? 100) < 25) g.think(u, 'is dressed in tattered rags', -2, 1);
    if (u.wounds.some((w) => w.sev === 2 && !w.treated)) g.think(u, 'is in pain from untreated wounds', -6, 1);
    // little pleasures
    for (const [dx, dy] of DIRS8) {
      if (!inMap(u.x + dx, u.y + dy, u.z)) continue;
      const c = cell + dx + dy * 96;
      const b = g.buildingAt(c);
      if (b && b.built && b.type === 'statue') g.think(u, 'admired a fine statue', 3 + b.q);
      if (g.w.flag[c] & 8) g.think(u, 'admired a tasteful engraving', 2);
      if (g.unitsIn(c).some((o) => o.kind === 'cat' || o.kind === 'dog')) g.think(u, 'petted an animal', 2);
    }
  }
  // thoughts -> mood
  if (g.tick % 50 < 10) {
    let target = 58;
    for (let k = u.thoughts.length - 1; k >= 0; k--) {
      const t = u.thoughts[k];
      if (t.until < g.tick) u.thoughts.splice(k, 1);
      else target += t.v * (1 + ((t.n || 1) - 1) * 0.3);
    }
    target = Math.max(0, Math.min(100, target));
    u.mood += (target - u.mood) * 0.08;
    if (!u.state && u.mood < 16 && !u.downSince && g.rng.chance(u.trait === 'quick to anger' ? 0.1 : u.trait === 'stoic' ? 0.02 : 0.05)) {
      if (u.mood < 6 && g.rng.chance(0.3)) {
        if (g.rng.chance(0.5)) {
          u.state = 'berserk';
          endJob(g, u);
          g.say(`${u.name} has gone berserk!`, 'death', cell);
        } else {
          u.state = 'melancholy';
          endJob(g, u);
          g.say(`${u.name} has slipped into a deep melancholy and has stopped caring for themselves.`, 'death', cell);
        }
      } else {
        u.state = 'tantrum';
        u.stateUntil = g.tick + 350 + g.rng.int(300);
        endJob(g, u, 'threw a tantrum');
        u.drafted = false;
        u.job = mkJob('tantrum', 'Throwing a tantrum!', cell, { started: g.tick });
        g.say(`${u.name} is throwing a tantrum!`, 'bad', cell);
      }
    }
  }
  // collapse / recovery
  const why = downReason(u);
  if (why && !u.downSince) {
    u.downSince = g.tick;
    if (u.job && u.job.type !== 'rest') endJob(g, u, `collapsed (${why})`);
    u.path = null;
    if (u.state === 'tantrum') u.state = '';
    g.say(`${u.name} has collapsed: ${why}.`, 'bad', cell);
  } else if (!why && u.downSince) {
    u.downSince = 0;
    g.say(`${u.name} is back on their feet.`, 'good', cell);
  }
}

/** A drafted dwarf with an empty weapon / armor slot goes and grabs the best free piece. */
function gearUp(g: Game, u: Unit): Job | null {
  const here = g.cellOf(u);
  const wpn = g.items.get(u.equip.weapon);
  const needs = wpn ? ITEMS[wpn.type].weapon?.ranged?.ammo : undefined;
  const quiver = g.items.get(u.equip.ammo);
  if (needs && (!quiver || quiver.n < 10)) {
    const bolts = g.findItem(u, (i) => i.type === needs);
    if (bolts) return mkJob('equip', `Picking up ${g.itemName(bolts, true)}`, g.cellOf(bolts), { item: bolts.id });
  }
  for (const slot of ['weapon', 'shield', 'body', 'head', 'legs', 'hands', 'feet']) {
    if (u.equip[slot]) continue;
    if (slot === 'weapon' && (u.equip.axe || u.equip.pick) && g.skillLevel(u, 'fight') < 1) continue;
    let best: Item | null = null, bv = -1;
    for (const it of g.items.values()) {
      if (g.slotFor(it) !== slot && !(slot === 'weapon' && ITEMS[it.type].tool === 'axe')) continue;
      if (!g.itemFree(it, u)) continue;
      // marksdwarves take crossbows (when there are bolts to go with them); everyone else takes something to swing
      const ranged = !!ITEMS[it.type].weapon?.ranged;
      if (slot === 'weapon' && ranged !== (g.skillLevel(u, 'shoot') > g.skillLevel(u, 'fight') && g.count((i) => i.type === 'bolt') > 0)) continue;
      const v = g.itemValue(it);
      if (v > bv && g.w.canReach(here, g.cellOf(it), true)) {
        best = it;
        bv = v;
      }
    }
    if (best) return mkJob('equip', `Picking up ${g.itemName(best, true)}`, g.cellOf(best), { item: best.id, sub: slot });
  }
  return null;
}

// ------------------------------------------------------------------ dwarf brain
function decide(g: Game, u: Unit) {
  const j = u.job;
  const here = g.cellOf(u);
  const threat = nearestThreat(g, u, u.drafted ? 16 : 7);
  if (u.drafted) {
    if (j && j.forced && (j.type === 'attack' || j.type === 'move' || j.type === 'equip')) return;
    if (threat) {
      if (!j || j.type !== 'attack') assign(g, u, mkJob('attack', `Fighting ${g.unitName(threat)}`, g.cellOf(threat), { u: threat.id }));
      return;
    }
    if (j && j.type !== 'idle') return;
    if (u.thirst > 85 || u.hunger > 90) {
      const t = u.thirst > 85 ? tryDrink(g, u) : tryEat(g, u);
      if (isJob(t)) return assign(g, u, t);
    }
    const gear = gearUp(g, u);
    if (gear) return assign(g, u, gear);
    if (u.moveOrder >= 0 && here !== u.moveOrder && g.w.canReach(here, u.moveOrder, false)) return assign(g, u, mkJob('move', 'Moving to position', u.moveOrder));
    u.whyIdle = 'Drafted: standing by for your orders. Right-click a tile to move or an enemy to attack. Undraft (R) to return to work.';
    return;
  }
  // the militia answers the alarm without being told: raiders and thieves anywhere near, not things minding their own caves
  if (u.militia && !(j && j.forced)) {
    let foe = nearestHostile(g, u, 30);
    if (!foe) {
      for (const o of g.units.values()) {
        if (o.faction !== 'wild' || o.dead || !o.target || CREATURES[o.kind].water) continue;
        if (g.units.get(o.target)?.faction === 'fort' && dist(here, g.cellOf(o)) < 30 && g.w.canReach(here, g.cellOf(o), true)) foe = o;
      }
    }
    if (foe && (foe.faction === 'wild' || foe.home === undefined || foe.target)) {
      if (!j || j.type !== 'attack') assign(g, u, mkJob('attack', `Answering the alarm: fighting ${g.unitName(foe)}`, g.cellOf(foe), { u: foe.id, data: foe.faction === 'wild' ? 2 : undefined }));
      return;
    }
  }
  if (threat) {
    if (j && (j.type === 'flee' || j.type === 'attack')) return;
    if (j && j.type === 'hunt' && j.u === threat.id) return; // the prey turned on the hunter: keep at it
    if (j && j.forced && cheb(here, g.cellOf(threat)) > 3) return;
    if (cheb(here, g.cellOf(threat)) <= 1 && threat.z === u.z) {
      // cornered: fight back
      assign(g, u, mkJob('attack', `Fighting off ${g.unitName(threat)}`, g.cellOf(threat), { u: threat.id, data: 1 }));
      return;
    }
    // run to whichever candidate spot is farthest from the threat
    const tc = g.cellOf(threat);
    let best = here, bd = dist(here, tc);
    const cands = [g.meetingSpot(), g.randomNear(here, 10), g.randomNear(here, 10), g.randomNear(here, 10)];
    const bed = g.buildings.get(u.bed);
    if (bed) cands.push(g.center(bed));
    for (const c of cands) {
      const d = dist(c, tc);
      if (d > bd && g.w.connected(here, c)) {
        best = c;
        bd = d;
      }
    }
    if (best !== here) {
      assign(g, u, mkJob('flee', `Fleeing from ${g.unitName(threat)}`, best));
      g.think(u, 'was terrified by a threat', -2, 1);
    }
    return;
  }
  if (j && (j.type === 'flee' || j.type === 'attack' || j.type === 'eat' || j.type === 'drink' || j.type === 'sleep' || j.type === 'tantrum' || j.type === 'mood')) return;
  const busy = !!j && j.type !== 'idle' && j.type !== 'rest';
  const resting = !!j && j.type === 'rest';
  if (busy && j!.forced && u.thirst < 120 && u.hunger < 140 && u.tired < 125) return;
  const urgent = u.thirst > 75 || u.hunger > 80 || u.tired > 96;
  const rest = needsRest(u);
  if (busy && !urgent && !rest) return;
  if (resting && u.thirst <= 70 && u.hunger <= 75) return;

  // needs, most pressing first
  if (u.thirst > (resting ? 70 : 50)) {
    const t = tryDrink(g, u);
    if (isJob(t)) return assign(g, u, t);
    noteNeedFail(g, u, 'Thirsty, but ' + t);
  }
  if (u.hunger > (resting ? 75 : 55) && u.state !== 'melancholy') {
    const t = tryEat(g, u);
    if (isJob(t)) return assign(g, u, t);
    noteNeedFail(g, u, 'Hungry, but ' + t);
  }
  if (resting) return;
  if (rest) {
    const t = tryRest(g, u);
    if (isJob(t)) return assign(g, u, t);
  }
  if (u.tired > 80) {
    const t = trySleep(g, u);
    if (isJob(t)) return assign(g, u, t);
  }
  if (busy) return;
  if ((u.wear ?? 100) < 25 && u.state !== 'melancholy') {
    const t = tryDress(g, u);
    if (isJob(t)) return assign(g, u, t);
  }
  if (u.state === 'melancholy') {
    if (!j) wanderTo(g, u, g.randomNear(here, 8), 200);
    u.whyIdle = 'Melancholy: has lost the will to work or eat.';
    return;
  }
  const work = findWork(g, u);
  if (work) return assign(g, u, work);
  if (!j) {
    const why = u.whyIdle;
    const spot = g.meetingSpot();
    wanderTo(g, u, g.randomNear(g.w.connected(here, spot) ? spot : here, 4), 80 + g.rng.int(120));
    u.whyIdle = why;
  }
}
function noteNeedFail(g: Game, u: Unit, text: string) {
  u.lastFail = text;
  u.lastFailTick = g.tick;
}

function dwarfTick(g: Game, u: Unit) {
  if (u.downSince) {
    if (u.job && u.job.type !== 'rest') endJob(g, u, 'collapsed');
    if (u.job) runJob(g, u);
    return;
  }
  if (u.state === 'berserk' || u.state === 'were') return hostileTick(g, u);
  if (g.tick >= u.nextThink) {
    u.nextThink = g.tick + 10;
    if (u.state !== 'tantrum' && u.state !== 'mood') decide(g, u);
  }
  if (u.job) runJob(g, u);
}

// ------------------------------------------------------------------ creature brains
function leaveMap(g: Game, u: Unit) {
  const it = g.items.get(u.carry);
  if (it) {
    g.say(`${cap(g.unitName(u))} has escaped with ${g.itemName(it)}!`, 'bad', g.cellOf(u));
    g.removeItem(it);
  }
  for (const s in u.equip) {
    const e = g.items.get(u.equip[s]);
    if (e) g.items.delete(e.id);
  }
  g.units.delete(u.id);
  u.dead = true;
}
function goHome(g: Game, u: Unit) {
  if (u.home === undefined || !g.w.canReach(g.cellOf(u), u.home, false)) u.home = nearestEdge(g, u);
  const r = walk(g, u, u.home, false, true, true);
  if (r !== 'going') leaveMap(g, u);
}
function nearestEdge(g: Game, u: Unit): number {
  const here = g.cellOf(u);
  let best = here, bd = 1e9;
  for (let t = 0; t < 30; t++) {
    const c = g.randomEdgeCell();
    const d = dist(here, c);
    if (d < bd && g.w.connected(here, c)) {
      best = c;
      bd = d;
    }
  }
  return best;
}
function checkTrap(g: Game, u: Unit) {
  const b = g.buildingAt(g.cellOf(u));
  if (!b || !b.built) return;
  if (b.type === 'cagetrap' && !b.caged) {
    b.caged = u.id;
    u.state = 'caged';
    u.cagedIn = b.id;
    u.path = null;
    u.job = null;
    g.say(`${cap(g.unitName(u))} has been caught in a cage trap!`, 'good', g.cellOf(u));
    g.w.version++;
  } else if (b.type === 'stonetrap') {
    const dmg = 22 + g.rng.int(20);
    u.hp -= dmg;
    addWound(g, u, g.rng.pick([0, 1, 1, 3, 4]), 2, 'blunt');
    g.say(`A stone-fall trap drops a boulder on ${g.unitName(u)}!`, 'good', g.cellOf(u));
    const c = g.cellOf(u);
    g.removeBuilding(b); // the boulder and mechanism are left on the ground: re-arm by rebuilding
    if (u.hp <= 0) killUnit(g, u, 'been crushed by a trap');
    void c;
  }
}
function hostileTick(g: Game, u: Unit) {
  if (CREATURES[u.kind].thief) return thiefTick(g, u);
  if (u.flee || (u.leaveAt && g.tick > u.leaveAt)) return goHome(g, u);
  if ((u.kind === 'goblin' || u.kind === 'troglodyte') && !u.flee && u.hp < u.maxHp * 0.4) {
    u.flee = true;
    g.say(`${cap(g.unitName(u))} breaks and runs!`, 'good', g.cellOf(u));
  }
  if (g.tick >= u.nextThink) {
    u.nextThink = g.tick + 15;
    // raiders hunt the whole map; things that live in the caverns only defend their territory
    const t = nearestHostile(g, u, u.home !== undefined && u.faction === 'enemy' && !u.isDwarf ? 12 : 200);
    u.target = t ? t.id : 0;
    if (!t && (!u.path || !u.path.length)) {
      const c = g.randomNear(u.home ?? g.cellOf(u), 6);
      u.path = g.w.findPath(g.cellOf(u), c, false);
    }
  }
  const t = g.units.get(u.target);
  const before = g.cellOf(u);
  if (t && !t.dead) {
    if (!chase(g, u, t)) u.target = 0;
  } else stepPath(g, u);
  if (g.cellOf(u) !== before && u.faction === 'enemy') checkTrap(g, u);
}
function thiefTick(g: Game, u: Unit) {
  const before = g.cellOf(u);
  if (u.carry || u.flee || (u.leaveAt && g.tick > u.leaveAt) || u.hp < u.maxHp * 0.6) goHome(g, u);
  else {
    let it = g.items.get(u.stolen || 0);
    if (!it || !g.onGround(it)) {
      // go for the most valuable thing that can be reached
      let bv = 0;
      it = undefined;
      for (const o of g.items.values()) {
        if (!g.onGround(o) || !g.stored(o)) continue;
        const v = g.itemValue(o) / o.n;
        if (v > bv && g.w.canReach(before, g.cellOf(o), true)) {
          bv = v;
          it = o;
        }
      }
      u.stolen = it ? it.id : 0;
      if (!it) {
        // nothing worth taking: an animal goes back to being an animal, a kobold slinks off
        if (u.faction === 'wild') u.stolen = undefined;
        else u.flee = true;
        return;
      }
    }
    const r = walk(g, u, g.cellOf(it), true);
    if (r === 'there') {
      const part = g.split(it, 1);
      g.carry(u, part);
      if (u.faction === 'wild') {
        // caught red-handed: now it is fair game for the militia
        u.faction = 'enemy';
        u.home = undefined;
      }
      g.say(`${cap(g.unitName(u))} has snatched ${g.itemName(part)}! Stop it before it escapes!`, 'bad', before);
    } else if (r === 'blocked') u.flee = true;
  }
  if (!u.dead && g.cellOf(u) !== before) checkTrap(g, u);
}
function wildTick(g: Game, u: Unit) {
  const d = CREATURES[u.kind];
  const here = g.cellOf(u);
  if (d.thief) {
    // raccoons, keas and macaques: every so often one decides your stockpile looks interesting
    if (u.stolen === undefined && g.tick >= u.nextThink && g.wealth > 400 && g.rng.chance(0.04)) u.stolen = 0;
    if (u.stolen !== undefined) return thiefTick(g, u);
  }
  if (d.water) {
    // lurk in the water and bite anything on the bank
    if ((g.tick + u.id) % 10 === 0) {
      for (const o of g.units.values()) {
        if (o.faction !== 'fort' || o.dead || Math.abs(o.z - u.z) > 1 || cheb(here, g.cellOf(o)) > 1) continue;
        if (!g.rng.chance(0.12)) continue;
        u.target = o.id;
        attack(g, u, o);
        return;
      }
      u.target = 0;
    }
    if (u.moveCd-- > 0) return;
    u.moveCd = d.speed * 3;
    const [dx, dy] = DIRS8[g.rng.int(8)];
    if (!inMap(u.x + dx, u.y + dy, u.z)) return;
    const n = here + dx + dy * 96;
    if (g.w.water[n] >= 4 && g.w.tile[n] !== 1) g.moveUnit(u, n);
    return;
  }
  if (u.leaveAt && g.tick > u.leaveAt && !u.target) return goHome(g, u);
  if (u.flee) {
    if (!u.path || !u.path.length) {
      if (g.rng.chance(0.25)) u.flee = false;
      u.path = g.w.findPath(here, g.randomNear(here, 12), false);
    }
    if (u.moveCd > 1) u.moveCd--; // panic: a bit faster
    stepPath(g, u);
    return;
  }
  if (g.tick >= u.nextThink) {
    u.nextThink = g.tick + 20 + g.rng.int(10);
    const t = g.units.get(u.target);
    if (t && (t.dead || dist(here, g.cellOf(t)) > 14)) u.target = 0;
    // a hurt animal gives up the fight
    if (u.target && u.hp < u.maxHp * 0.5) {
      u.target = 0;
      u.flee = true;
    }
    if (!u.target && d.predator) {
      for (const o of g.units.values()) {
        if (o.faction !== 'fort' || o.dead || o.z !== u.z || cheb(here, g.cellOf(o)) > 4) continue;
        if (!g.rng.chance(0.35) || !g.w.canReach(here, g.cellOf(o), true)) continue;
        u.target = o.id;
        if (o.isDwarf) g.say(`${cap(g.unitName(u))} is stalking ${o.name}!`, 'bad', here);
        break;
      }
    }
    if (!u.target && (!u.path || !u.path.length) && g.rng.chance(0.3)) u.path = g.w.findPath(here, g.randomNear(u.home ?? here, 7), false);
  }
  const t = g.units.get(u.target);
  if (t && !t.dead) {
    if (!chase(g, u, t)) u.target = 0;
  } else stepPath(g, u);
}
function petTick(g: Game, u: Unit) {
  const here = g.cellOf(u);
  if (g.tick >= u.nextThink) {
    u.nextThink = g.tick + 25 + g.rng.int(10);
    if (u.kind === 'dog' || u.kind === 'war_dog') {
      const t = nearestHostile(g, u, u.kind === 'war_dog' ? 14 : 8);
      u.target = t ? t.id : 0;
    }
    if (!u.target && (!u.path || !u.path.length) && g.rng.chance(0.35)) {
      let c = g.meetingSpot();
      const pastures = g.zonesOf('pasture');
      if (pastures.length) {
        const z = pastures[u.id % pastures.length];
        c = z.cells[g.rng.int(z.cells.length)];
      }
      if (!g.w.connected(here, c)) c = here;
      u.path = g.w.findPath(here, g.randomNear(c, CREATURES[u.kind].size >= 0.7 ? 2 : 5), false);
    }
  }
  const t = g.units.get(u.target);
  if (t && !t.dead && g.hostile(u, t)) {
    if (!chase(g, u, t)) u.target = 0;
  } else {
    u.target = 0;
    stepPath(g, u);
  }
}

export function tickUnit(g: Game, u: Unit) {
  if (u.dead) return;
  if (u.atkCd > 0) u.atkCd--;
  if ((g.tick + u.id) % 10 === 0) {
    slowTick(g, u);
    if (u.dead) return;
  }
  if (u.state === 'caged' || u.carriedBy) return;
  const brain = brains[u.kind];
  if (brain && brain(g, u)) return;
  if (u.isDwarf) dwarfTick(g, u);
  else if (u.faction === 'enemy') hostileTick(g, u);
  else if (u.faction === 'wild') wildTick(g, u);
  else if (u.faction === 'fort') petTick(g, u);
  else if (u.job) runJob(g, u); // merchants are driven by events.ts
}

// ------------------------------------------------------------------ explanations
export interface Explain {
  status: string; // one line: what they are doing
  tone: 'ok' | 'warn' | 'bad';
  lines: string[]; // why, and what would fix it
}
/** The answer to "why is this dwarf just standing there?" */
export function explainUnit(g: Game, u: Unit): Explain {
  const e: Explain = { status: '', tone: 'ok', lines: [] };
  const days = (t: number) => (t / TICKS_DAY).toFixed(1);
  if (u.dead) return { status: 'Dead', tone: 'bad', lines: [] };
  if (!u.isDwarf) {
    if (u.kind === 'ghost') {
      e.status = 'Haunting the fortress';
      e.tone = 'warn';
      e.lines.push('The dead do not rest until they are buried. Put the body in a coffin; if the body is gone, have a mason engrave a memorial slab and place it (Build > Furniture). A ghost cannot be fought.');
      return e;
    }
    if (u.kind === 'necromancer') e.lines.push('Raises any corpse it can see as a zombie. Kill it and everything it raised collapses: marksdwarves are ideal. Bury your dead before it gets to them.');
    if (u.kind === 'werebeast') e.lines.push('Any dwarf it wounds is cursed, and will transform at every full moon. It leaves when the moon sets.');
    if (u.state === 'caged') e.status = 'Caged';
    else if (u.target && g.units.get(u.target)) e.status = `Attacking ${g.unitName(g.units.get(u.target)!)}`;
    else if (u.flee) e.status = 'Fleeing';
    else if (u.faction === 'enemy') {
      e.status = 'Looking for a way in';
      e.lines.push('Cannot find a path to any of your dwarves or animals.');
    } else e.status = u.faction === 'merchant' ? 'Trading' : 'Wandering';
    if (u.hunted) e.lines.push('Marked for hunting. ' + explainTask(g, 'hunt', (d) => (d.labors.hunt ? 'ok' : 'x'), 'u' + u.id));
    if (u.slaughter) e.lines.push('Marked for slaughter.');
    return e;
  }
  if (u.carriedBy) {
    const c = g.units.get(u.carriedBy);
    e.status = `Being carried to bed by ${c ? c.name : 'someone'}`;
    e.tone = 'warn';
  } else if (u.downSince && downReason(u)) {
    const why = downReason(u);
    e.tone = 'bad';
    e.status = cap(why);
    if (u.inBed) {
      e.lines.push('In bed, and will stay there until healed enough to stand.');
      if (needsTending(u)) e.lines.push('Needs a doctor to treat the wounds — ' + explainTask(g, 'doctor', (d) => tryTend(g, d, u), 'u' + u.id));
      else e.lines.push('Wounds have been treated; healing takes time.');
    } else {
      e.lines.push(`Lying where they fell (for ${days(g.tick - u.downSince)} days). Someone with the Doctor labor must carry them to a bed.`);
      e.lines.push('Rescue — ' + explainTask(g, 'doctor', (d) => tryRescue(g, d, u), 'u' + u.id));
    }
    if (needsFeeding(u)) e.lines.push(`Cannot fetch their own food and drink (hunger ${Math.round(u.hunger)}%, thirst ${Math.round(u.thirst)}%). A doctor will bring some.`);
  } else if (u.state === 'were') {
    e.status = `Transformed into a were${u.cursed}!`;
    e.tone = 'bad';
    e.lines.push('Will attack anyone it can reach until the moon sets, then change back with every wound healed. Keep others away, or lock the door.');
  } else if (u.state === 'berserk') {
    e.status = 'Berserk!';
    e.tone = 'bad';
    e.lines.push('Has snapped and will attack anyone. There is no cure. Draft your militia.');
  } else if (u.state === 'melancholy') {
    e.status = 'Melancholy';
    e.tone = 'bad';
    e.lines.push('Has given up on life: will not work or eat.');
  } else if (u.job && u.job.type !== 'idle') {
    e.status = u.job.label + (u.job.forced ? ' (your order)' : '');
    if (u.state === 'mood' && u.moodNeeds) {
      e.lines.push(`Possessed by a strange mood: will make an artifact, or go insane trying (${days(Math.max(0, u.stateUntil - g.tick))} days left).`);
      e.lines.push('Needs: ' + (u.moodShop ? 'a workshop ✓' : 'a free workshop ✗ (build any workshop)') + ' · ' + u.moodNeeds.map((n) => `${n.kind || n.type} ${n.have ? '✓' : '✗'}`).join(' · '));
    }
    if (u.state === 'tantrum') {
      e.tone = 'bad';
      e.lines.push('Mood hit rock bottom. Will calm down eventually; keep others (and furniture) away. Fix the unhappy thoughts listed below.');
    }
    if (u.state === 'mood') e.tone = 'warn';
    if (u.job.type === 'rest') {
      e.tone = 'warn';
      const bad = u.wounds.filter((w) => w.sev === 2 || w.bleed > 0);
      e.lines.push(`Resting until healed: ${bad.map(woundText).join('; ') || (u.blood < 60 ? 'lost a lot of blood' : 'recovering')}.`);
      if (needsTending(u)) e.lines.push('Doctor — ' + explainTask(g, 'doctor', (d) => tryTend(g, d, u), 'u' + u.id));
    }
    if (u.job.type === 'drink' && u.job.data === 1) e.tone = 'warn';
  } else if (u.drafted) {
    e.status = 'Drafted: standing by';
    e.lines.push('Right-click a tile to move, or an enemy to attack. Press R to undraft and return to work.');
  } else {
    e.status = 'Idle';
    if (u.whyIdle) e.lines.push(u.whyIdle);
    if (u.whyIdle.startsWith('Found')) e.tone = 'warn';
  }
  if (u.lastFail && g.tick - u.lastFailTick < TICKS_DAY / 2) e.lines.push(`Earlier — ${u.lastFail}`);
  if (u.cursed && u.state !== 'were') e.lines.push(`☾ Cursed: bitten by a were${u.cursed}. Transforms at every full moon (next in ${g.daysToMoon().toFixed(1)} days) and attacks everyone in reach. Before then, put them alone in a room and lock the door.`);
  if (u.sober > SOBER_SICK) e.lines.push(`⚠ ${days(u.sober)} days without alcohol: withdrawal is killing them. Brew drinks at a Still!`);
  else if (u.sober > SOBER_SLOW) e.lines.push(`⚠ ${days(u.sober)} days without alcohol: working and walking slowly.`);
  if ((u.wear ?? 100) < 25) {
    const t = tryDress(g, u);
    e.lines.push(`${u.wear! <= 0 ? 'Naked' : 'Clothes are in tatters'}: ${isJob(t) ? 'will change into new clothes soon' : t}.`);
  }
  if (u.hunger > 100) e.lines.push('⚠ Starving.');
  if (u.thirst > 100) e.lines.push('⚠ Dehydrated.');
  return e;
}

hook({ fallDamage, killUnit, attack, engage: chase });
