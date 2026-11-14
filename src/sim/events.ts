// The world acting on the fortress: embark, seasons, migrants, caravans, raids, wildlife,
// strange moods, the things that live below — and the alert list that tells you what is wrong.
import { BUILDINGS, CREATURES, CROPS, CreatureDef, creaturesOf, FIRST_NAMES, H, ITEMS, LABOR_NAME, MAT, MATS, PLANT, PLANTS, RECIPES, T, TICKS_DAY, TICKS_SEASON, TICKS_YEAR, W, plantOf } from './defs';
import { Game } from './game';
import {
  DG_LABOR, DG_NAME, RUN, assign, canWalk, endJob, explainTask, fetch, isJob, needsTending, tryBuild, tryDesig, tryHaul, tryRescue, walk,
} from './jobs';
import { SOBER_SLOW, downReason, killUnit } from './life';
import { civicAlerts, petsAdopt, tickCivics } from './civics';
import { machineAlerts } from './machines';
import { nightAlerts, tickNight } from './night';
import type { Alert, Building, Item, Job, Unit } from './types';
import { WH, X, Y, Z, dist, idx, inMap } from './world';
import { CAVERN1_Z, CAVERN2_Z, SHRUBS, SURFACE_TREES } from './worldgen';

const first = (u: Unit) => u.name.split(' ')[0];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const mkJob = (type: string, label: string, cell: number, extra: Partial<Job> = {}): Job => ({ type, label, step: 0, x: X(cell), y: Y(cell), z: Z(cell), t: 0, started: 0, ...extra });

// ------------------------------------------------------------------ embark
export function embark(g: Game) {
  const at = idx(g.embark.x, g.embark.y, g.embark.z);
  const near = () => g.randomNear(at, 2);
  const team: string[][] = [['mine', 'mason'], ['mine', 'build'], ['chop', 'carpenter'], ['farm', 'brew'], ['cook', 'doctor'], ['craft', 'smith'], ['fight', 'hunt']];
  for (const skills of team) {
    const u = g.addDwarf(near(), skills);
    if (skills[0] === 'mine') g.equip(u, g.spawnItem('pick', MAT.copper, at), 'pick');
    if (skills[0] === 'chop') g.equip(u, g.spawnItem('axe', MAT.copper, at), 'axe');
    if (skills[0] === 'fight') {
      g.equip(u, g.spawnItem('axe', MAT.bronze, at), 'weapon');
      g.equip(u, g.spawnItem('shield', MAT.oak, at), 'shield');
      u.labors.fish = 3;
    }
  }
  const drinks = ['dwarven ale', 'dwarven wine', 'dwarven beer', 'dwarven rum'];
  for (let k = 0; k < 16; k++) g.spawnItem('drink', MAT.oak, near(), 5, { sub: drinks[k % 4] });
  for (const m of ['plump helmet biscuits', 'yak stew', 'cave wheat hash']) g.spawnItem('meal', MAT.none, near(), 20, { sub: m });
  g.spawnItem('plant', MAT.none, near(), 10, { sub: 'plump_helmet' });
  for (const s of ['plump_helmet', 'pig_tail', 'cave_wheat', 'sweet_pod']) g.spawnItem('seed', MAT.none, near(), s === 'plump_helmet' ? 12 : 6, { sub: s });
  g.spawnItem('log', MAT.oak, near(), 8);
  g.spawnItem('barrel', MAT.oak, near(), 3);
  g.spawnItem('cloth', MAT.cloth, near(), 4);
  g.spawnItem('splint', MAT.oak, near(), 2);
  g.spawnItem('pick', MAT.copper, near());
  for (let k = 0; k < 2; k++) g.spawnItem('spear', MAT.copper, near());
  g.spawnItem('crossbow', MAT.oak, near());
  g.spawnItem('bolt', MAT.oak, near(), 20);
  g.spawnItem('bolt', MAT.oak, near(), 20);
  for (const k of ['dog', 'dog', 'cat', 'yak', 'yak', 'chicken', 'chicken', 'sheep']) {
    const p = g.addUnit(k, near(), 'fort');
    p.name = g.rng.pick(FIRST_NAMES);
  }
  for (let k = 0; k < 7; k++) spawnWild(g);
  g.ev.nextMigrants = TICKS_DAY * 9;
  g.ev.nextThief = TICKS_DAY * 14;
  g.ev.nextRaid = TICKS_DAY * 34;
  g.ev.nextCaravan = TICKS_DAY * 16;
  g.ev.nextMood = TICKS_DAY * 20;
  g.ev.nextBeast = TICKS_DAY * 60;
  g.ev.nextWere = TICKS_DAY * 40;
  g.ev.nextNecro = TICKS_DAY * 75;
  g.ev.nextMega = TICKS_DAY * 110;
  g.say(`Strike the earth! Seven dwarves have arrived to found ${g.fortName}.`, 'event', at);
  g.chronicle(`Seven dwarves founded ${g.fortName}.`);
  g.say('Dwarves need alcohol to function. Dig in, plant a farm, and build a Still before the barrels run dry.', 'info');
}

// ------------------------------------------------------------------ wildlife
/** a random creature native to `where`, weighted by how common it is, no more dangerous than allowed */
function pickCreature(g: Game, where: CreatureDef['where'], maxDanger: number, ok?: (c: CreatureDef) => boolean): CreatureDef {
  const list = creaturesOf(where).filter((c) => (c.danger || 0) <= maxDanger && (!ok || ok(c)));
  let total = 0;
  for (const c of list) total += c.freq ?? 1;
  let r = g.rng.next() * total;
  for (const c of list) {
    r -= c.freq ?? 1;
    if (r <= 0) return c;
  }
  return list[0];
}
function spawnWild(g: Game) {
  // the first weeks are quiet: predators and thieving animals turn up once the fortress has found its feet
  const gentle = g.tick < TICKS_DAY * 18;
  const d = pickCreature(g, 'surface', gentle ? 0 : g.strength() < 12 ? 1 : 2, (c) => !gentle || !c.thief);
  const c = g.randomEdgeCell();
  const inland = g.randomNear(c, 12);
  const u = g.addUnit(d.id, inland, 'wild');
  u.home = inland;
  u.leaveAt = g.tick + TICKS_DAY * (6 + g.rng.int(10));
  return u;
}
function cavernCell(g: Game, z0: number): number {
  for (let t = 0; t < 300; t++) {
    const x = g.rng.int(W), y = g.rng.int(H);
    for (let z = z0; z <= z0 + 1; z++) {
      const c = idx(x, y, z);
      if (g.w.safe(c) && g.w.revealed(c) && !g.w.outside(c) && g.w.flag[c] & 16) {
        if (g.dwarves().every((d) => dist(g.cellOf(d), c) > 15)) return c;
      }
    }
  }
  return -1;
}
function spawnCavern(g: Game) {
  const c = cavernCell(g, g.ev.cavern >= 2 && g.rng.chance(0.5) ? CAVERN2_Z : CAVERN1_Z);
  if (c < 0) return;
  // the nastier things only take an interest once the fortress is worth their while
  const pop = g.strength();
  const d = pickCreature(g, 'cavern', pop >= 25 ? 4 : pop >= 15 ? 3 : pop >= 10 ? 2 : 1, (k) => !k.water);
  const n = d.size < 0.5 ? 2 + g.rng.int(2) : 1;
  for (let i = 0; i < n; i++) {
    const u = g.addUnit(d.id, g.randomNear(c, 2), d.hostile ? 'enemy' : 'wild');
    u.home = c;
  }
}
/** fire imps and magma crabs crawl out of the magma once it has been found */
function spawnMagma(g: Game) {
  for (let t = 0; t < 200; t++) {
    const x = g.rng.int(W), y = g.rng.int(H), z = 1 + g.rng.int(13);
    const c = idx(x, y, z);
    if (!g.w.safe(c) || !g.w.revealed(c) || !g.w.nearMagma(c, 1)) continue;
    if (g.dwarves().some((d) => dist(g.cellOf(d), c) < 10)) continue;
    const d = pickCreature(g, 'magma', 9);
    g.addUnit(d.id, c, 'enemy').home = c;
    return;
  }
}
function riverCheck(g: Game) {
  let n = 0;
  for (const u of g.units.values()) if (CREATURES[u.kind].where === 'river') n++;
  if (n >= 4) return;
  for (let t = 0; t < 60; t++) {
    const x = g.rng.int(W), y = g.rng.int(H);
    const c = idx(x, y, g.w.surface[x + y * W]);
    if (g.w.water[c] >= 7) {
      g.addUnit(pickCreature(g, 'river', 9).id, c, 'wild');
      return;
    }
  }
}

// ------------------------------------------------------------------ migrants
function migrants(g: Game) {
  const pop = g.dwarves().length;
  g.ev.nextMigrants = g.tick + TICKS_SEASON * (0.8 + g.rng.next() * 0.4);
  if (pop >= 40 || g.season === 3) return;
  if (pop > 0 && g.ev.deaths > pop && g.rng.chance(0.6)) {
    g.say('No migrants arrived this season: word of the deaths here has spread.', 'info');
    return;
  }
  const n = Math.min(40 - pop, 2 + g.rng.int(3) + Math.min(4, Math.floor(g.wealth / 4000)));
  const c = g.randomEdgeCell();
  const arrivals: Unit[] = [];
  for (let k = 0; k < n; k++) arrivals.push(g.addDwarf(g.randomNear(c, 2)));
  // now and then one of the newcomers is not what they seem
  if (pop >= 14 && !g.dwarves().some((u) => u.vampire) && g.rng.chance(0.3)) {
    const v = g.rng.pick(arrivals);
    v.vampire = true;
    v.age = 150 + g.rng.int(300);
  }
  g.ev.migrants++;
  g.say(`${n} migrants have arrived${g.wealth > 5000 ? ', drawn by tales of wealth' : ''}.`, 'event', c);
}

// ------------------------------------------------------------------ raids
function arm(g: Game, u: Unit, tier: number) {
  const mat = tier >= 2 ? MAT.iron : MAT.copper;
  const c = g.cellOf(u);
  if (g.ev.raids >= 1 && g.rng.chance(0.25)) {
    // an archer: stands off and shoots
    g.equip(u, g.spawnItem('crossbow', MAT.oak, c), 'weapon');
    g.equip(u, g.spawnItem('bolt', mat, c, 20), 'ammo');
    return;
  }
  g.equip(u, g.spawnItem(g.rng.pick(['sword', 'spear', 'hammer', 'axe', 'mace', 'whip', 'dagger']), mat, c), 'weapon');
  // the first raiding parties are a rabble; later ones come properly equipped
  if (g.rng.chance(0.1 + tier * 0.25)) g.equip(u, g.spawnItem('shield', mat, c), 'shield');
  if (g.rng.chance(0.1 + tier * 0.25)) g.equip(u, g.spawnItem('helm', mat, c), 'head');
  if (g.rng.chance(tier * 0.25)) g.equip(u, g.spawnItem('mail', tier >= 2 ? mat : MAT.leather, c), 'body');
}
export function raid(g: Game, size?: number) {
  const pop = g.strength(); // adults: children do not draw a bigger raid
  // the first party is a pair of scouts; later ones grow with the fortress but never outnumber what it could field
  const n = size ?? Math.max(2, Math.min(Math.ceil(pop * 0.4), Math.round(1 + g.ev.raids * 0.8 + pop / 8)));
  const c = g.randomEdgeCell();
  const tier = Math.min(3, Math.floor(g.ev.raids / 3));
  for (let k = 0; k < n; k++) {
    const u = g.addUnit('goblin', g.randomNear(c, 3), 'enemy');
    u.name = g.rng.pick(['Snodub', 'Ngokang', 'Utes', 'Osmstozu', 'Azstrog', 'Bax', 'Stozu', 'Zom', 'Dostngosp', 'Smunstu']);
    u.skill = 1 + tier + g.rng.int(2);
    u.leaveAt = g.tick + TICKS_DAY * 5;
    arm(g, u, tier);
  }
  if (g.ev.raids >= 4 && pop >= 20) for (let k = 0; k < Math.floor(g.ev.raids / 4); k++) g.addUnit(g.rng.pick(['troll', 'ogre']), g.randomNear(c, 3), 'enemy').leaveAt = g.tick + TICKS_DAY * 5;
  g.ev.raids++;
  g.say(n >= 8 ? `A vile force of darkness has arrived! ${n} goblins lay siege to ${g.fortName.split(',')[0]}.` : `An ambush! ${n} goblins charge from the wilderness. Draft your militia (R) or lock the doors.`, 'death', c, true);
  g.ev.nextRaid = g.tick + TICKS_DAY * (22 + g.rng.int(16));
}
function thief(g: Game) {
  g.ev.nextThief = g.tick + TICKS_DAY * (10 + g.rng.int(12));
  if (g.wealth < 600) return;
  const u = g.addUnit('kobold', g.randomEdgeCell(), 'enemy');
  u.leaveAt = g.tick + TICKS_DAY * 3;
}
const BEAST_FORMS: [string, string][] = [
  ['towering eyeless lizard', 'croc'], ['great three-headed toad', 'blob'], ['enormous blob', 'blob'], ['huge skinless bat', 'bird'], ['gigantic one-eyed crab', 'spider'],
  ['colossal feathered serpent', 'snake'], ['vast hairy spider', 'spider'], ['monstrous winged wolf', 'were'], ['mountainous shelled ox', 'elephant'], ['immense horned worm', 'snake'],
  ['hulking three-eyed bear', 'bear'], ['enormous quadruped with wings', 'dragon'],
];
/** what it is made of: [name, colour, armor, hit point multiplier] */
const BEAST_STUFF: [string, string, number, number][] = [
  ['flesh', '#d06060', 2, 1], ['ash', '#909090', 0, 0.6], ['salt', '#f0f0f0', 1, 0.7], ['green glass', '#70d090', 5, 0.8], ['iron', '#b8bcc8', 7, 1.1], ['vomit', '#a0b040', 0, 0.6],
  ['snow', '#e0f0ff', 0, 0.5], ['amber', '#ffb030', 4, 0.9], ['steam', '#c0d0e0', 0, 0.5], ['granite', '#b9b0ac', 6, 1.2], ['coal', '#505050', 3, 0.9],
];
const BEAST_POWERS: [string, Unit['breath'] | null][] = [
  ['Beware its deadly dust!', { dmg: 5, range: 5, verb: 'breathes a cloud of dust over', type: 'dust' }],
  ['Beware its webs!', { dmg: 0, range: 6, verb: 'sprays webs over', type: 'web' }],
  ['Beware its fiery breath!', { dmg: 16, range: 6, verb: 'breathes fire on', type: 'burn' }],
  ['Beware its poisonous bite!', null],
  ['It knows nothing but hunger.', undefined],
];
/** Every forgotten beast is one of a kind: a random body, made of a random substance, with a random power. */
export function beast(g: Game, at?: number): Unit | null {
  g.ev.nextBeast = g.tick + TICKS_DAY * (50 + g.rng.int(40));
  if (at === undefined && (!g.ev.cavern || g.strength() < 12)) return null;
  const c = at ?? cavernCell(g, g.ev.cavern >= 2 ? CAVERN2_Z : CAVERN1_Z);
  if (c < 0) return null;
  const u = g.addUnit('beast', c, 'enemy');
  // it prowls the cavern it woke in, and comes up after the fortress only once that is big enough to draw it
  // (and never in the first year: a young fortress gets to meet it on its own terms, by digging down)
  if (g.strength() < 25 || g.tick < TICKS_YEAR) u.home = c;
  const [form, shape] = g.rng.pick(BEAST_FORMS);
  const [stuff, colour, armor, hpMul] = g.rng.pick(BEAST_STUFF);
  const [warning, breath] = g.rng.pick(BEAST_POWERS);
  const feature = g.rng.pick(['a gaunt appearance', 'emerald scales', 'lidless eyes', 'a bloated body', 'long curling horns', 'a regal bearing', 'thin wings of stretched skin', 'a pair of knobby antennae']);
  u.name = `${g.rng.pick(['Osplu', 'Ngathsesh', 'Zuspo', 'Thrak', 'Olngo', 'Asob', 'Ithra', 'Umoz'])} ${g.rng.pick(['Wraithfang', 'the Cinder of Ends', 'Rotmaw', 'Doomgrasp', 'the Night of Sorrows', 'Plaguehowl'])}`;
  u.shape = shape;
  u.fg = colour;
  u.armor = armor;
  u.maxHp = u.hp = Math.round(u.maxHp * hpMul);
  if (breath) u.breath = breath;
  else if (breath === null) u.venom = true;
  u.desc = `A ${form} composed of ${stuff}. It has ${feature}. ${warning}${armor >= 5 ? ' Blades glance off it: use picks, hammers or traps.' : armor === 0 ? ' It is fragile for its size.' : ''}`;
  g.say(`The Forgotten Beast ${u.name} has come! ${u.desc}`, 'death', c, true);
  return u;
}
function hell(g: Game, cell: number) {
  if (g.ev.hell) return;
  g.ev.hell = true;
  g.say('Horrifying screams come from the darkness below! You have dug too deep, too greedily.', 'death', cell, true);
  const at = g.nearestFree(cell);
  for (let k = 0; k < 6; k++) {
    const u = g.addUnit('demon', g.randomNear(at, 1), 'enemy');
    u.name = g.rng.pick(['Ôsed', 'Stroza', 'Xuspgas', 'Ngoso', 'Asno', 'Slusmnul']);
  }
}

// ------------------------------------------------------------------ caravan
const depot = (g: Game) => Array.from(g.buildings.values()).find((b) => b.type === 'depot' && b.built);
function caravanArrive(g: Game) {
  g.ev.nextCaravan = g.tick + TICKS_SEASON * 2;
  const civ = g.rng.pick(['dwarven', 'human', 'elven']);
  const c = g.randomEdgeCell();
  const goods: Item[] = [];
  const add = (type: string, mat: number, n: number, extra: Partial<Item> = {}) => goods.push({ id: g.nextId++, type, mat, n, x: 0, y: 0, z: 0, held: 0, in: 0, res: 0, q: 0, born: g.tick, ...extra });
  const r = g.rng;
  add('drink', MAT.oak, 5, { sub: r.pick(['dwarven ale', 'dwarven rum', 'mead', 'sewer brew']) });
  add('drink', MAT.oak, 5, { sub: r.pick(['dwarven beer', 'dwarven wine', 'perry']) });
  add('drink', MAT.oak, 5, { sub: 'dwarven ale' });
  add('meal', MAT.none, 10, { sub: 'salted fish roast' });
  add('meat', MAT.flesh, 10, { sub: 'horse' });
  add('cheese', MAT.none, 8, { sub: r.pick(['goat', 'cow', 'sheep']) });
  for (const s of ['plump_helmet', 'pig_tail', 'cave_wheat', 'sweet_pod']) add('seed', MAT.none, 5, { sub: s });
  for (const s of ['rope_reed', 'longland_grass', 'quarry_bush', 'dimple_cup']) if (r.chance(0.6)) add('seed', MAT.none, 5, { sub: s });
  add('log', MAT.oak, 10);
  add('cloth', MAT.cloth, 5);
  add('leather', MAT.leather, 3);
  add('barrel', MAT.oak, 3);
  for (let k = 0; k < 3; k++) add('clothes', MAT.cloth, 1, { q: r.int(3) });
  if (civ !== 'elven') {
    add('pick', MAT.iron, 1);
    add('axe', MAT.iron, 1);
    add('bar', MAT.iron, 4);
    add('bar', MAT.bronze, 3);
    add('fuel', MAT.coke, 6);
    add(r.pick(['sword', 'spear', 'hammer']), civ === 'dwarven' ? MAT.steel : MAT.iron, 1, { q: 2 });
    add('mail', MAT.iron, 1);
    add('helm', MAT.iron, 1);
    add('shield', MAT.iron, 1);
    add('crossbow', MAT.oak, 1, { q: 1 });
    add('bolt', MAT.iron, 20);
    add('bolt', MAT.iron, 20);
    add(r.pick(['gauntlets', 'boots', 'breastplate', 'greaves']), MAT.iron, 1);
    add('mechanism', MAT.granite, 2);
  } else {
    add('plant', MAT.none, 10, { sub: 'strawberry' });
    add('plant', MAT.none, 10, { sub: 'sun_berry' });
    add('craft', MAT.oak, 4, { q: 2 });
    add('cage', MAT.oak, 2);
  }
  const units: number[] = [];
  for (let k = 0; k < 3; k++) {
    const u = g.addUnit(k === 0 ? 'wagon' : 'merchant', g.randomNear(c, 2), 'merchant');
    if (k) u.name = `${r.pick(FIRST_NAMES)}`;
    units.push(u.id);
  }
  g.caravan = { civ, arrive: g.tick, leave: g.tick + TICKS_DAY * 6, state: 'coming', goods, units, traded: 0 };
  g.say(`A ${civ} caravan has arrived.${depot(g) ? '' : ' You have no Trade Depot: they will wait a while, but cannot trade without one.'}`, 'event', c);
}
function caravanTick(g: Game) {
  const cv = g.caravan!;
  const us = cv.units.map((i) => g.units.get(i)).filter((u): u is Unit => !!u && !u.dead);
  if (!us.length) {
    if (cv.state !== 'leaving') g.say('The caravan has been destroyed. The outside world will remember this.', 'bad');
    g.caravan = null;
    return;
  }
  const d = depot(g);
  if (cv.state !== 'leaving' && g.tick > cv.leave) {
    cv.state = 'leaving';
    g.say(`The ${cv.civ} merchants are packing up to leave.`, 'info');
    for (const u of us) u.job = null;
  }
  for (const u of us) {
    if (u.job) continue;
    const here = g.cellOf(u);
    if (cv.state === 'leaving') {
      const edge = u.home ?? (u.home = g.randomEdgeCell());
      if (here === edge || !g.w.connected(here, edge)) {
        g.units.delete(u.id);
        u.dead = true;
      } else u.job = mkJob('move', 'Leaving', edge, { started: g.tick });
      continue;
    }
    const dest = d ? g.center(d) : g.meetingSpot();
    if (dist(here, dest) > 2) {
      if (g.w.canReach(here, dest, true)) u.job = mkJob('idle', 'Travelling to the depot', g.randomNear(dest, 1), { data: 30, started: g.tick });
    } else if (d && cv.state === 'coming') {
      cv.state = 'trading';
      g.say(`The merchants have unloaded at the Trade Depot. Open Trade (T) to barter.`, 'event', dest);
    }
  }
}
/** What the fortress can offer: finished goods lying in stockpiles (and anything else of value). */
export function tradeable(g: Game): Item[] {
  const out: Item[] = [];
  for (const it of g.items.values()) if (g.onGround(it) && !it.forbid && !it.res && it.type !== 'corpse' && g.itemValue(it) > 0) out.push(it);
  return out.sort((a, b) => g.itemValue(b) - g.itemValue(a));
}
export const BUY_MARKUP = 1.25;
export function tradeCan(g: Game): string {
  const cv = g.caravan;
  if (!cv) return 'No caravan is here. They visit twice a year.';
  if (!depot(g)) return 'You need a finished Trade Depot (Build > Production) for the merchants to unload at.';
  if (cv.state === 'coming') return 'The merchants are still on their way to the depot.';
  if (cv.state === 'leaving') return 'The merchants have packed up and are leaving.';
  return '';
}
/** Swap items. sell: fortress item id -> count. buy: indexes into caravan goods -> count. */
export function trade(g: Game, sell: Map<number, number>, buy: Map<number, number>): string {
  const why = tradeCan(g);
  if (why) return why;
  const cv = g.caravan!;
  let offer = 0, ask = 0;
  for (const [id, n] of sell) {
    const it = g.items.get(id);
    if (!it || !g.onGround(it) || it.res) return 'Some offered items are no longer available';
    offer += (g.itemValue(it) / it.n) * Math.min(n, it.n);
  }
  for (const [k, n] of buy) {
    const it = cv.goods[k];
    if (!it) return 'Some goods are gone';
    ask += (g.itemValue(it) / it.n) * Math.min(n, it.n) * BUY_MARKUP;
  }
  if (!sell.size && !buy.size) return 'Select something to trade';
  if (cv.civ === 'elven') {
    // elves will not touch anything that cost a tree or an animal its life
    for (const id of sell.keys()) {
      const it = g.items.get(id)!;
      const why = MATS[it.mat].kind === 'wood' ? 'made of wood' : ['bone', 'leather', 'flesh', 'wool'].includes(MATS[it.mat].id) && it.type !== 'cloth' ? 'made from a slain animal' : '';
      if (why) return `The elves recoil from the ${g.itemName(it, true)}: it is ${why}. Offer them stone, metal, gems, glass or cloth instead.`;
    }
  }
  if (offer < ask) return `The merchants want more: you offer ${Math.round(offer)}☼ for goods they value at ${Math.round(ask)}☼.`;
  const at = g.center(depot(g)!);
  for (const [id, n] of sell) {
    const it = g.items.get(id)!;
    const part = g.split(it, Math.min(n, it.n));
    g.removeItem(part);
  }
  const taken: number[] = [];
  for (const [k, n] of buy) {
    const it = cv.goods[k];
    const m = Math.min(n, it.n);
    const { id: _id, n: _n, ...rest } = it;
    g.spawnItem(it.type, it.mat, at, m, { sub: rest.sub, q: rest.q });
    it.n -= m;
    if (it.n <= 0) taken.push(k);
  }
  cv.goods = cv.goods.filter((_, k) => !taken.includes(k));
  cv.traded += offer;
  g.say(`Trade complete: gave ${Math.round(offer)}☼ of goods for ${Math.round(ask)}☼.${offer > ask * 1.5 ? ' The merchants are delighted by your generosity.' : ''}`, 'good', at);
  return '';
}

// ------------------------------------------------------------------ strange moods
function startMood(g: Game) {
  g.ev.nextMood = g.tick + TICKS_DAY * (18 + g.rng.int(20));
  const c = g.dwarves().filter((u) => !u.state && !u.child && canWalk(u) && !u.drafted && g.tick - u.arrived > TICKS_DAY * 5);
  if (c.length < 5 || g.dwarves().some((u) => u.state === 'mood')) return;
  beginMood(g, g.rng.pick(c));
}
/** Put a dwarf into a strange mood. It only ever demands kinds of material the fortress already owns. */
export function beginMood(g: Game, u: Unit) {
  const pool: { type: string; kind?: string }[] = [
    { type: 'boulder', kind: 'stone' }, { type: 'log', kind: 'wood' }, { type: 'gem', kind: 'rough gem' }, { type: 'bone', kind: 'bones' }, { type: 'bar', kind: 'metal bar' },
    { type: 'cloth', kind: 'cloth' }, { type: 'leather', kind: 'leather' },
  ];
  const owned = pool.filter((n) => g.count((i) => i.type === n.type) > 0);
  const from = owned.length ? owned : [pool[0]];
  const needs: typeof pool = [];
  while (needs.length < Math.min(3, from.length)) {
    const n = g.rng.pick(from);
    if (!needs.includes(n)) needs.push(n);
  }
  endJob(g, u);
  u.state = 'mood';
  u.stateUntil = g.tick + TICKS_DAY * 8;
  u.moodNeeds = needs.map((n) => ({ ...n, have: false }));
  u.moodShop = 0;
  u.job = mkJob('mood', 'Strange mood: seeking a workshop', g.cellOf(u), { started: g.tick, items: [] });
  g.say(`${u.name} is taken by a fey mood! ${first(u)} withdraws from society...`, 'event', g.cellOf(u));
}
function moodFail(g: Game, u: Unit): string {
  u.state = g.rng.chance(0.5) ? 'berserk' : 'melancholy';
  const b = g.buildings.get(u.moodShop || 0);
  if (b) b.worker = 0;
  for (const id of u.job?.items || []) {
    const it = g.items.get(id);
    if (it) it.res = 0;
  }
  u.moodNeeds = undefined;
  g.say(`${u.name} has been unable to complete the artifact and has gone ${u.state === 'berserk' ? 'berserk' : 'melancholy'}!`, 'death', g.cellOf(u));
  return 'done';
}
RUN.mood = (g, u, j) => {
  if (g.tick > u.stateUntil) return moodFail(g, u);
  const needs = u.moodNeeds!;
  let shop = g.buildings.get(u.moodShop || 0);
  if (!shop) {
    u.moodShop = 0;
    if (g.tick % 30) return 'run';
    let bd = 1e9;
    for (const b of g.buildings.values()) {
      if (!b.built || !BUILDINGS[b.type].shop || (b.worker && b.worker !== u.id) || g.claimed('b' + b.id, u)) continue;
      const d = dist(g.cellOf(u), g.center(b));
      if (d < bd && g.w.canReach(g.cellOf(u), g.center(b), false)) {
        shop = b;
        bd = d;
      }
    }
    if (!shop) {
      j.label = 'Strange mood: needs a workshop!';
      return 'run';
    }
    u.moodShop = shop.id;
    shop.worker = u.id;
    g.say(`${u.name} has claimed the ${g.buildingName(shop)}.`, 'event', g.center(shop));
  }
  const c = g.center(shop);
  shop.worker = u.id;
  const k = needs.findIndex((n) => !n.have);
  if (k >= 0) {
    const need = needs[k];
    if (!u.carry && !j.item) {
      if (g.tick % 30) return 'run';
      const it = g.findItem(u, (i) => i.type === need.type && !j.items!.includes(i.id));
      if (!it) {
        j.label = `Strange mood: needs ${need.kind}!`;
        const w = walk(g, u, c, false);
        void w;
        return 'run';
      }
      j.item = it.id;
      it.res = u.id;
      j.label = `Strange mood: fetching ${need.kind}`;
    }
    if (!u.carry) {
      const f = fetch(g, u, j, j.item, 1);
      if (f === 'run') return 'run';
      if (typeof f === 'string') {
        j.item = undefined;
        return 'run';
      }
      j.item = f.id;
    }
    const w = walk(g, u, c, false);
    if (w === 'going') return 'run';
    if (w === 'blocked') {
      g.drop(u);
      j.item = undefined;
      return 'run';
    }
    const it = g.items.get(u.carry)!;
    u.carry = 0;
    it.held = 0;
    g.placeItem(it, c);
    it.res = u.id;
    j.items!.push(it.id);
    j.item = undefined;
    need.have = true;
    return 'run';
  }
  const w = walk(g, u, c, false);
  if (w === 'going') return 'run';
  j.label = 'Strange mood: working secretly...';
  if (++j.t < 500) return 'run';
  const ins = j.items!.map((i) => g.items.get(i)).filter((i): i is Item => !!i);
  const mat = ins[0] ? ins[0].mat : MAT.granite;
  for (const it of ins) g.removeItem(it);
  j.items = [];
  // An artifact is a real thing of legendary quality: a weapon to wield, armor to wear, furniture to place.
  // What it is follows from what it was made of; odd materials make a trinket.
  const kind = MATS[mat].kind;
  const type = g.rng.pick(
    kind === 'metal' ? ['sword', 'axe', 'hammer', 'mace', 'spear', 'shield', 'helm', 'mail', 'breastplate']
      : kind === 'stone' || kind === 'gem' || kind === 'ore' ? ['table', 'chair', 'door', 'statue', 'coffin', 'cabinet', 'chest']
        : kind === 'wood' ? ['bed', 'table', 'chair', 'door', 'chest', 'cabinet', 'shield', 'crossbow']
          : MATS[mat].id === 'leather' ? ['mail', 'helm', 'shield'] : ['artifact'],
  );
  const a = g.rng.pick(['Planned', 'Ancient', 'Glittering', 'Drunken', 'Bearded', 'Molten', 'Sunken', 'Howling']);
  const b2 = g.rng.pick(['Anvil', 'Tankard', 'Abyss', 'Vault', 'Beard', 'Ember', 'Oath', 'Carp']);
  const title = `${g.rng.pick(FIRST_NAMES)}${g.rng.pick(['ilral', 'ostar', 'umbor', 'akith'])}, "The ${a} ${b2}"`;
  const name = type === 'artifact' ? `${title}, a ${MATS[mat].name} ${g.rng.pick(['sceptre', 'crown', 'amulet', 'goblet', 'figurine', 'mug'])}` : title;
  const art = g.spawnItem(type, mat, c, 1, { name, q: 6 });
  g.ev.artifacts++;
  shop.worker = 0;
  u.state = '';
  u.moodNeeds = undefined;
  u.moodShop = 0;
  const skill = g.rng.pick(['craft', 'mason', 'carpenter', 'smith']);
  u.skills[skill] = 1500;
  g.think(u, 'created a legendary artifact', 30, 30);
  g.chronicle(`${u.name} created the artifact ${g.itemName(art, true)}.`);
  g.say(`${u.name} has created ${g.itemName(art)}! ${first(u)} is now a legendary ${skill === 'craft' ? 'craftsdwarf' : skill}.`, 'event', c);
  return 'done';
};

// ------------------------------------------------------------------ nature
function nature(g: Game) {
  const w = g.w;
  // regrowth on the surface
  for (let k = 0; k < 12; k++) {
    const x = g.rng.int(W), y = g.rng.int(H);
    const c = idx(x, y, w.surface[x + y * W]);
    if (w.tile[c] !== T.Floor || w.water[c] || g.bAt.has(c) || g.zoneAt.has(c) || g.itemsAt.has(c) || w.flag[c] & 2) continue;
    if (MATS[w.mat[c]].kind !== 'soil' || !w.outside(c)) continue;
    if (w.plant[c] === 0) w.plant[c] = PLANT.grass;
    else if (w.plant[c] === PLANT.grass && g.season !== 3) {
      if (g.rng.chance(0.04) && !g.unitsIn(c).length) {
        const kind = g.rng.pick(SURFACE_TREES);
        w.plant[c] = PLANT[kind];
        w.setTile(c, T.Tree, MAT[kind]);
      } else if (g.rng.chance(0.12)) w.plant[c] = PLANT[g.rng.pick(SHRUBS)];
      w.version++;
    }
  }
  // rot: perishable food left outside a stockpile. Stockpiled food keeps.
  for (const it of Array.from(g.items.values())) {
    if (!ITEMS[it.type].rots || !g.onGround(it)) continue;
    if (g.stored(it)) {
      it.born = g.tick;
      continue;
    }
    if (g.tick - it.born > TICKS_DAY * 8) {
      if (it.type !== 'hide') g.say(`${cap(g.itemName(it))} has rotted away (it was never hauled to a food stockpile).`, 'info', g.cellOf(it));
      g.removeItem(it);
    }
  }
  // animal corpses that are never butchered rot too; dwarf corpses stay until buried
  for (const it of Array.from(g.items.values())) {
    if (it.type === 'corpse' && !it.dwarf && g.onGround(it) && g.tick - it.born > TICKS_DAY * 10) {
      const c = g.cellOf(it);
      g.removeItem(it);
      g.spawnItem('bone', MAT.bone, c, 1, { sub: CREATURES[it.sub || '']?.name });
    }
    if (it.type === 'corpse' && it.dwarf && g.onGround(it) && g.tick - it.born > TICKS_DAY * 3 && g.tick % (TICKS_DAY / 2) < 100) {
      for (const d of g.dwarves()) if (dist(g.cellOf(d), g.cellOf(it)) < 12) g.think(d, 'saw the rotting, unburied body of a friend', -5, 2);
    }
  }
  petsAdopt(g);
  // livestock: birds lay, and where there are two of a kind there will sooner or later be three
  const tame = Array.from(g.units.values()).filter((u) => u.faction === 'fort' && !u.isDwarf && !u.dead && u.state !== 'caged');
  if (g.count((i) => i.type === 'egg') < 40) for (const u of tame) if (CREATURES[u.kind].eggs && g.rng.chance(0.02)) g.spawnItem('egg', MAT.none, g.cellOf(u), 1, { sub: CREATURES[u.kind].name });
  if (tame.length < 45 && g.rng.chance(0.012)) {
    const byKind = new Map<string, Unit[]>();
    for (const u of tame) byKind.set(u.kind === 'war_dog' ? 'dog' : u.kind, [...(byKind.get(u.kind === 'war_dog' ? 'dog' : u.kind) || []), u]);
    const pairs = Array.from(byKind.entries()).filter(([, l]) => l.length >= 2 && l.length < 8);
    if (pairs.length) {
      const [kind, l] = g.rng.pick(pairs);
      const mother = g.rng.pick(l);
      const baby = g.addUnit(kind, g.cellOf(mother), 'fort');
      baby.name = g.rng.pick(FIRST_NAMES);
      g.say(CREATURES[kind].eggs ? `A ${CREATURES[kind].name} chick has hatched.` : `${mother.name} the ${CREATURES[mother.kind].name} has given birth to a ${CREATURES[kind].name === 'sheep' ? 'lamb' : 'young ' + CREATURES[kind].name}.`, 'info', g.cellOf(mother));
    }
  }
  let wild = 0, cav = 0;
  for (const u of g.units.values()) {
    if (u.faction === 'wild' && !CREATURES[u.kind].water && u.kind !== 'ghost' && g.outsideAt(u)) wild++;
    if (CREATURES[u.kind].where === 'cavern' && !CREATURES[u.kind].water) cav++;
  }
  if (wild < 7 && g.rng.chance(0.5)) spawnWild(g);
  if (g.ev.cavern && cav < 2 + g.ev.cavern * 2 && g.rng.chance(0.03)) spawnCavern(g);
  riverCheck(g);
  let hot = 0;
  for (const u of g.units.values()) if (CREATURES[u.kind].where === 'magma') hot++;
  if (g.ev.magmaSeen && hot < 3 && g.rng.chance(0.03)) spawnMagma(g);
  // wealth
  let v = 0;
  for (const it of g.items.values()) if (!it.held || g.units.get(it.held)?.faction === 'fort') v += g.itemValue(it);
  for (const b of g.buildings.values()) if (b.built) v += 20 * (1 + b.q);
  g.wealth = v;
}

// ------------------------------------------------------------------ alerts
export function computeAlerts(g: Game): Alert[] {
  const out: Alert[] = [];
  const ds = g.dwarves();
  const pop = ds.length;
  const s = g.stocks();
  const at = (c: number) => ({ x: X(c), y: Y(c), z: Z(c) });
  if (!pop) return out;
  // ---- booze
  const drinks = s.drink || 0;
  const stills = Array.from(g.buildings.values()).filter((b) => b.type === 'still' && b.built);
  if (drinks < pop * 2) {
    let fix: string;
    if (!stills.length) fix = 'Build a Still (Build > Production), then add a "Brew drink" order.';
    else if (!stills.some((b) => b.bills.some((x) => x.recipe === 'brew'))) fix = 'Your Still has no orders: click it and add "Brew drink" (repeat forever).';
    else fix = stills.map((b) => b.bills.find((x) => x.recipe === 'brew')?.why).find((x) => x) ? 'Brewing is stuck — ' + stills.map((b) => b.bills.find((x) => x.recipe === 'brew')?.why).find((x) => x) : 'Brewing is under way; add more Stills, brewers and farm plots to keep up.';
    out.push({ id: 'booze', sev: drinks === 0 ? 'bad' : 'warn', text: drinks === 0 ? 'No alcohol!' : `Alcohol low (${drinks})`, detail: `${drinks} drinks for ${pop} dwarves. Sober dwarves work slowly, grow miserable and eventually die. ${fix}` });
  }
  const sober = ds.filter((u) => u.sober > SOBER_SLOW);
  if (sober.length) out.push({ id: 'sober', sev: 'bad', text: `${sober.length} sober dwar${sober.length > 1 ? 'ves' : 'f'}`, detail: `${sober.map(first).join(', ')} ha${sober.length > 1 ? 've' : 's'} gone days without a drink.`, unit: sober[0].id });
  // ---- food
  if ((s.food || 0) < pop * 2) {
    const greedy = stills.some((b) => b.bills.some((x) => x.recipe === 'brew' && !x.paused && (x.mode === 'forever' || (x.mode === 'until' && x.n > drinks))));
    const brewing = greedy && drinks > pop * 4 ? ` Your Still is turning plants into drink faster than anyone can eat them (${drinks} drinks in stock): click it and pause the brewing order, or set it to "Until you have ${pop * 4}".` : '';
    out.push({ id: 'food', sev: s.food ? 'warn' : 'bad', text: s.food ? `Food low (${s.food})` : 'No food!', detail: `${s.food || 0} meals for ${pop} dwarves.${brewing} Farm plump helmets underground (Zones > Farm on soil), gather wild plants (Orders > Gather), fish, hunt or butcher livestock.` });
  }
  // ---- the wounded
  for (const u of ds) {
    if (u.downSince && !u.inBed && !u.carriedBy) {
      out.push({ id: 'down' + u.id, sev: 'bad', text: `${first(u)} is down`, detail: `${u.name}: ${downReason(u)}. Rescue — ${explainTask(g, 'doctor', (d) => tryRescue(g, d, u), 'u' + u.id)}`, unit: u.id, ...at(g.cellOf(u)) });
    } else if (needsTending(u) && u.wounds.some((w) => w.sev === 2 && !w.treated) && g.tick - u.lastFailTick > 0) {
      const doc = ds.filter((d) => d.labors.doctor > 0 && d !== u && canWalk(d));
      if (!doc.length) out.push({ id: 'nodoc', sev: 'bad', text: 'No doctor', detail: `${u.name} needs treatment but nobody else has the Doctor labor enabled (Labors, L).`, unit: u.id });
    }
    if (u.state === 'tantrum' || u.state === 'berserk') out.push({ id: 'rage' + u.id, sev: 'bad', text: `${first(u)}: ${u.state}!`, detail: `${u.name} is ${u.state === 'berserk' ? 'berserk and attacking everyone' : 'throwing a tantrum'}.`, unit: u.id, ...at(g.cellOf(u)) });
    if (u.state === 'mood' && u.job && /needs/.test(u.job.label)) out.push({ id: 'mood' + u.id, sev: 'warn', text: `${first(u)}'s strange mood`, detail: `${u.name}: ${u.job.label} Will go insane in ${((u.stateUntil - g.tick) / TICKS_DAY).toFixed(1)} days without it.`, unit: u.id });
    if (!u.state && u.mood < 25) out.push({ id: 'sad' + u.id, sev: 'warn', text: `${first(u)} is miserable`, detail: `${u.name} is close to breaking. Worst thoughts: ${u.thoughts.filter((t) => t.v < 0).sort((a, b) => a.v - b.v).slice(0, 3).map((t) => t.text).join('; ') || 'none'}.`, unit: u.id });
  }
  nightAlerts(g, out);
  machineAlerts(g, out);
  civicAlerts(g, out);
  // ---- the alarm
  if (g.ev.alarm) {
    const danger = Array.from(g.units.values()).some((u) => u.faction === 'enemy' && !u.dead && u.state !== 'caged' && u.home === undefined) || ds.some((u) => u.state === 'were' || u.state === 'berserk');
    const refuge = g.zonesOf('burrow').length > 0;
    out.push({ id: 'alarm', sev: danger && refuge ? 'warn' : 'bad', text: danger ? 'Alarm raised' : 'Alarm still on', detail: `${danger ? 'Civilians have stopped work and are sheltering' : 'There is no enemy in sight, but the alarm is still raised and no civilian is working'}. ${refuge ? '' : 'There is no Refuge zone, so they just stay where they are: mark a safe room with Zones > Refuge (behind a door you can lock). '}Militia and drafted dwarves fight on. Press B (or the Alarm button) to ${danger ? 'call it off' : 'send everyone back to work'}.` });
  }
  // ---- enemies
  const foes = Array.from(g.units.values()).filter((u) => u.faction === 'enemy' && !u.dead && u.state !== 'caged' && g.w.revealed(g.cellOf(u)) && u.kind !== 'kobold' && (u.home === undefined || !!u.target));
  // an enemy that has no route to anyone is a different problem from one at the gate
  const canReachUs = (f: Unit) => ds.some((d) => g.w.canReach(g.cellOf(f), g.cellOf(d), true));
  const coming = foes.filter(canReachUs), lurking = foes.filter((f) => !canReachUs(f));
  const names = (l: Unit[]) => `${l.slice(0, 4).map((f) => g.unitName(f)).join(', ')}${l.length > 4 ? '…' : ''}`;
  if (coming.length) out.push({ id: 'foes', sev: 'bad', text: `${coming.length} hostile${coming.length > 1 ? 's' : ''}`, detail: `${names(coming)}. Draft dwarves (select, R) and right-click the enemy to attack — or seal the entrance.`, ...at(g.cellOf(coming[0])) });
  if (lurking.length) out.push({ id: 'lurk', sev: 'warn', text: `${lurking.length} lurking, cut off`, detail: `${names(lurking)}: hostile, but there is no walkable route between it and any of your dwarves right now, so nobody needs to be drafted. Digging into where it lives (or opening a door) changes that.`, ...at(g.cellOf(lurking[0])) });
  // ---- idle dwarves who wanted to work but could not
  const stuck = ds.filter((u) => (!u.job || u.job.type === 'idle') && u.whyIdle.startsWith('Found') && g.tick - u.idleSince > 150 && !u.drafted);
  if (stuck.length) out.push({ id: 'stuck', sev: 'warn', text: `${stuck.length} dwar${stuck.length > 1 ? 'ves' : 'f'} blocked`, detail: `${first(stuck[0])}: ${stuck[0].whyIdle}`, unit: stuck[0].id });
  const nolabor = ds.filter((u) => !u.child && (!u.job || u.job.type === 'idle') && !u.whyIdle.startsWith('Found') && g.tick - u.idleSince > 400 && !u.drafted && canWalk(u) && !u.state);
  if (nolabor.length >= Math.max(2, pop / 3)) out.push({ id: 'idle', sev: 'warn', text: `${nolabor.length} idle`, detail: `${nolabor.map(first).slice(0, 6).join(', ')} have nothing to do. Designate more work, or enable more labors for them (L).`, unit: nolabor[0].id });
  // ---- designations nobody can do
  const byKind = new Map<number, number[]>();
  for (const c of g.desigs) {
    const d = g.w.desig[c];
    const l = byKind.get(d);
    if (l) l.push(c);
    else byKind.set(d, [c]);
  }
  for (const [d, cells] of byKind) {
    const labor = DG_LABOR[d];
    const workers = ds.filter((u) => u.labors[labor] > 0 && canWalk(u));
    if (cells.some((c) => g.claimed('d' + c))) continue;
    if (!workers.length) {
      out.push({ id: 'dg' + d, sev: 'warn', text: `${DG_NAME[d]}: no workers`, detail: `${cells.length} tiles are designated for "${DG_NAME[d]}" but nobody able has the ${LABOR_NAME[labor]} labor. Enable it in Labors (L).`, ...at(cells[0]) });
      continue;
    }
    // sample a few cells: if no worker can do any of them, say why
    const sample = cells.slice(0, 40);
    let why = '', okCell = false;
    for (const c of sample) {
      for (const u of workers) {
        const t = tryDesig(g, u, c);
        if (isJob(t)) okCell = true;
        else if (!why || /path|nowhere/.test(why)) why = t;
        if (okCell) break;
      }
      if (okCell) break;
    }
    if (!okCell && why && cells.length) out.push({ id: 'dg' + d, sev: 'warn', text: `${DG_NAME[d]} stalled`, detail: `${cells.length} tiles designated for "${DG_NAME[d]}" cannot be worked: ${why}.`, ...at(cells[0]) });
  }
  // ---- construction waiting on materials
  for (const b of g.buildings.values()) {
    if (b.built || b.suspended || g.claimed('b' + b.id)) continue;
    const builders = ds.filter((u) => u.labors.build > 0 && canWalk(u));
    if (!builders.length) {
      out.push({ id: 'nobuild', sev: 'warn', text: 'No builders', detail: 'Buildings are waiting but nobody has the Build labor enabled (L).', ...at(g.center(b)) });
      break;
    }
    let ok = false, why = '';
    for (const u of builders) {
      const t = tryBuild(g, u, b);
      if (isJob(t)) {
        ok = true;
        break;
      }
      why = t;
    }
    b.why = ok ? '' : why;
    if (!ok && why) {
      const id = 'bld' + b.type + why;
      const prev = out.find((a) => a.id === id);
      if (prev) prev.text = prev.text.replace(/^(\d+ × )?/, (m) => `${(parseInt(m) || 1) + 1} × `);
      else if (out.filter((a) => a.id.startsWith('bld')).length < 4) out.push({ id, sev: 'warn', text: `${BUILDINGS[b.type].name} stalled`, detail: `Cannot build ${BUILDINGS[b.type].name}: ${why}.`, ...at(g.center(b)) });
    }
  }
  // ---- stuck work orders
  for (const b of g.buildings.values()) {
    if (!b.built || !b.bills.length) continue;
    for (const bill of b.bills) {
      const labor = RECIPES[bill.recipe].labor;
      if (!bill.paused && !ds.some((u) => u.labors[labor] > 0)) bill.why = `nobody has the ${LABOR_NAME[labor]} labor enabled`;
    }
    const bad = b.bills.find((x) => x.why && !x.paused && !/^(Target reached|This work order|.* is using)/.test(x.why));
    if (bad && !g.claimed('b' + b.id) && out.filter((a) => a.id.startsWith('bill')).length < 3) out.push({ id: 'bill' + b.id, sev: 'warn', text: `${BUILDINGS[b.type].name.replace(/'s Workshop|'s Shop/, '')}: order stuck`, detail: `"${RECIPES[bad.recipe].name}" at the ${BUILDINGS[b.type].name}: ${bad.why}.`, ...at(g.center(b)) });
  }
  // ---- the dead
  const dead = Array.from(g.items.values()).filter((i) => i.type === 'corpse' && i.dwarf && g.onGround(i));
  if (dead.length) out.push({ id: 'dead', sev: 'warn', text: `${dead.length} unburied`, detail: `The unburied dead upset everyone who sees them. Build coffins (Mason/Carpenter, then Build > Furniture > Coffin); anyone with the Haul labor will bury them.`, ...at(g.cellOf(dead[0])) });
  // ---- farms with empty plots and no seeds
  for (const z of g.zones.values()) {
    if (z.kind !== 'farm') continue;
    const empty = z.cells.filter((c) => !g.crops.has(c)).length;
    if (empty < Math.max(1, z.cells.length / 2)) continue;
    if (g.count((i) => i.type === 'seed' && i.sub === z.crop) > 0) continue;
    const other = CROPS.find((p) => p.id !== z.crop && g.count((i) => i.type === 'seed' && i.sub === p.id) > 0);
    out.push({ id: 'seed' + z.id, sev: 'warn', text: `${z.name}: no seeds`, detail: `${empty} empty plots and no ${plantOf(z.crop).name} seeds. Processing the plant (brew, cook, eat) gives seeds back.${other ? ` You do have ${other.name} seeds: click the farm to switch crop.` : ' Caravans sell seeds.'}`, ...at(z.cells[0]) });
  }
  // ---- stockpiles that cannot take what is lying around
  const hauler = ds.find((u) => u.labors.haul > 0 && canWalk(u));
  if (hauler) {
    const cats = new Set<string>(), probs: string[] = [];
    for (const id of g.looseItems()) {
      const it = g.items.get(id);
      if (!it || cats.has(ITEMS[it.type].cat)) continue;
      cats.add(ITEMS[it.type].cat);
      const t = tryHaul(g, hauler, it);
      if (!isJob(t) && /stockpile/.test(t)) probs.push(t);
    }
    if (probs.length) out.push({ id: 'spfull', sev: 'warn', text: 'Stockpiles full', detail: `Items are being left where they lie: ${probs.slice(0, 4).join('; ')}. Make the stockpile bigger or add another (Zones > Stockpile). Food left outside a stockpile rots.` });
  }
  // ---- leisure nobody can have
  const restless = ds.filter((u) => (u.fun ?? 0) > 110).length, pious = ds.filter((u) => (u.faith ?? 0) > 110).length;
  if (restless >= Math.max(2, pop / 3) && !g.zonesOf('tavern').length) out.push({ id: 'notavern', sev: 'warn', text: 'No tavern', detail: `${restless} dwarves want somewhere to drink and talk, and are growing unhappy. Mark a room as a Tavern (Zones > Tavern). Tables, chairs and drink close by make it better.` });
  if (pious >= Math.max(2, pop / 3) && !g.zonesOf('temple').length) out.push({ id: 'notemple', sev: 'warn', text: 'No temple', detail: `${pious} dwarves want somewhere to pray. Mark a room as a Temple (Zones > Temple). Statues, smoothed and engraved walls make it better.` });
  // ---- no stockpile / tools
  if (!g.zonesOf('stockpile').length && g.tick > 300) out.push({ id: 'nostock', sev: 'warn', text: 'No stockpile', detail: 'Items are lying where they fell. Create a stockpile (Zones > Stockpile) so haulers gather everything in one place; food left outside rots.' });
  return out;
}

// ------------------------------------------------------------------ master tick
export function tickEvents(g: Game) {
  g.onHell = (c) => hell(g, c);
  const e = g.ev;
  const t = g.tick;
  if (t % 100 === 0) nature(g);
  if (t % 50 === 0) g.alerts = computeAlerts(g);
  if (t % 20 === 0 && g.caravan) caravanTick(g);
  if (t % 50 !== 0) return;
  const pop = g.dwarves().length;
  if (!pop) {
    if (!e.lost) {
      e.lost = true;
      g.say(`${g.fortName} has crumbled to its end. Losing is fun!`, 'death');
    }
    return;
  }
  if (t >= e.nextMigrants) migrants(g);
  if (t >= e.nextCaravan && !g.caravan) caravanArrive(g);
  if (t >= e.nextThief) thief(g);
  if (t >= e.nextRaid) {
    // one disaster at a time: goblins wait their turn while the dead are at the gates
    if (Array.from(g.units.values()).some((u) => u.kind === 'necromancer' || u.kind === 'werebeast' || CREATURES[u.kind].where === 'mega')) e.nextRaid = t + TICKS_DAY * 4;
    else if (g.strength() >= 9 || g.wealth > 3000) raid(g);
    else e.nextRaid = t + TICKS_DAY * 6;
  }
  if (t >= e.nextMood) startMood(g);
  if (t >= e.nextBeast) beast(g);
  tickNight(g);
  tickCivics(g);
}

export { killUnit, plantOf, PLANTS };
