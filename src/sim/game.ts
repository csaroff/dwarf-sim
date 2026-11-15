// Game state + basic operations on items, units, buildings and zones.
// The behaviour lives in jobs.ts (work), life.ts (needs, health, combat) and events.ts (the world acting on you).
import {
  BUILDINGS, CATS, CREATURES, Cat, DAYS_SEASON, DWARF_COLORS, GODS, DWARF_WORDS, F, FIRST_NAMES, H, ITEMS, Ing, LABORS, Labor, MAT, MATS, PLANTS,
  PROFESSION, QMARK, QVALUE, SEASONS, SKILLS, SKILL_LEVELS, SUR_A, SUR_B, T, TICKS_DAY, TICKS_SEASON, TICKS_YEAR, W, plantOf,
} from './defs';
import { Rng } from './rng';
import type { Alert, Building, Caravan, Item, Job, LogEntry, Unit, Zone } from './types';
import { BLOCK_DECK, BLOCK_FLUID, BLOCK_WALK, DIRS8, WH, World, X, Y, Z, dist, idx, inMap } from './world';
import { generate, generateFlat } from './worldgen';

/** jobs that are only about being somewhere: these spread out rather than stack on one tile */
const LOITER = new Set(['idle', 'move', 'drill', 'relax', 'pray', 'shelter', 'attack', 'flee']);

export const MONTHS = ['Granite', 'Slate', 'Felsite', 'Hematite', 'Malachite', 'Galena', 'Limestone', 'Sandstone', 'Timber', 'Moonstone', 'Opal', 'Obsidian'];
export const START_YEAR = 250;
export const MAX_STACK = 20;
export const MAX_AMMO = 40;
export const MOON_DAYS = 12;
export const MOON_TICKS = 800;

export interface Crop {
  plant: string;
  t: number; // tick planted
}

export class Game {
  w = new World();
  rng: Rng;
  seed: number;
  tick = 0;
  nextId = 1;
  items = new Map<number, Item>();
  units = new Map<number, Unit>();
  buildings = new Map<number, Building>();
  zones = new Map<number, Zone>();
  log: LogEntry[] = [];
  crops = new Map<number, Crop>();
  history: { tick: number; text: string }[] = [];
  engravings = new Map<number, string>(); // cell -> what is carved there
  wetOk = new Set<number>(); // cells the miners have already warned about: digging there again is deliberate
  desigs = new Set<number>();
  fortName = '';
  embark = { x: 0, y: 0, z: 0 };
  caravan: Caravan | null = null;
  // event bookkeeping (see events.ts)
  ev = {
    nextMigrants: 0, nextRaid: 0, nextCaravan: 0, nextMood: 0, nextBeast: 0, nextWild: 0, nextThief: 0,
    nextWere: 0, nextNecro: 0, nextMega: 0, nextSnatch: 0, drained: 0, alarm: false,
    mayor: 0, nextMandate: 0, mandate: null as null | { type: string; name: string; where: string; n: number; made: number; until: number },
    cavern: 0, magmaSeen: false, hell: false, raids: 0, deaths: 0, migrants: 0, lost: false, artifacts: 0,
  };
  wealth = 0;
  /** set when something happens that the player must see: the UI pauses and jumps there */
  attention: LogEntry | null = null;

  // derived indexes (rebuilt on load)
  itemsAt = new Map<number, number[]>();
  bAt = new Map<number, number>();
  zoneAt = new Map<number, number[]>();
  claims = new Map<string, number>(); // job key -> unit id
  spRes = new Map<number, number>(); // stockpile cell -> unit id bringing something there
  alerts: Alert[] = [];
  /** who is standing where: rebuilt every tick, kept up to date as units move */
  unitsAt = new Map<number, Unit[]>();
  private haulCache: number[] = [];
  private haulCacheTick = -999;
  stockCache: Record<string, number> = {};
  private stockCacheTick = -999;

  constructor(seed = 1, flat = false) {
    this.seed = seed;
    this.rng = new Rng(seed);
    if (flat) {
      generateFlat(this.w);
      this.embark = { x: W >> 1, y: H >> 1, z: 20 };
    } else {
      this.embark = generate(this.w, seed).embark;
    }
    const a = this.rng.pick(DWARF_WORDS), b = this.rng.pick(DWARF_WORDS);
    this.fortName = `${a[0]}${b[0].toLowerCase()}, "${a[1]}${b[1].toLowerCase()}"`;
  }

  // ------------------------------------------------------------------ time
  get day() {
    return Math.floor(this.tick / TICKS_DAY);
  }
  get season() {
    return Math.floor(this.tick / TICKS_SEASON) % 4;
  }
  get year() {
    return START_YEAR + Math.floor(this.tick / TICKS_YEAR);
  }
  /** the date at a tick (default: now); short = without season and hour */
  dateString(tick = this.tick, short = false) {
    const day = Math.floor(tick / TICKS_DAY);
    const dayOfYear = day % (DAYS_SEASON * 4);
    const month = Math.floor(dayOfYear / (DAYS_SEASON / 3));
    const dom = (dayOfYear % (DAYS_SEASON / 3)) + 1;
    const hour = Math.floor(((tick % TICKS_DAY) / TICKS_DAY) * 24);
    const date = `${dom}${['st', 'nd', 'rd', 'th'][Math.min(dom - 1, 3)]} ${MONTHS[month]} ${START_YEAR + Math.floor(tick / TICKS_YEAR)}`;
    return short ? date : `${date}, ${SEASONS[Math.floor(tick / TICKS_SEASON) % 4]} · ${String(hour).padStart(2, '0')}:00`;
  }
  /** Write an event into the fortress's history: it shows in Legends, and masons engrave scenes from it. */
  chronicle(text: string) {
    this.history.push({ tick: this.tick, text });
    if (this.history.length > 400) this.history.splice(0, 100);
  }

  /** The moon is full for the first part of the last day of every 12-day cycle. Werebeasts change. */
  fullMoon() {
    return this.day % MOON_DAYS === MOON_DAYS - 1 && this.tick % TICKS_DAY < MOON_TICKS;
  }
  /** days until the next full moon begins (0 while it is up) */
  daysToMoon() {
    if (this.fullMoon()) return 0;
    const start = (Math.floor(this.day / MOON_DAYS) * MOON_DAYS + MOON_DAYS - 1) * TICKS_DAY;
    return ((start > this.tick ? start : start + MOON_DAYS * TICKS_DAY) - this.tick) / TICKS_DAY;
  }

  // ------------------------------------------------------------------ log
  say(text: string, kind: LogEntry['kind'] = 'info', cell?: number, urgent = false) {
    const e: LogEntry = { tick: this.tick, text, kind };
    if (cell !== undefined && cell >= 0) {
      e.x = X(cell);
      e.y = Y(cell);
      e.z = Z(cell);
    }
    this.log.push(e);
    if (urgent) this.attention = e;
    if (urgent || kind === 'death') this.chronicle(text); // the things worth remembering
    if (this.log.length > 600) this.log.splice(0, 150);
  }

  // ------------------------------------------------------------------ items
  spawnItem(type: string, mat: number, cell: number, n = 1, extra: Partial<Item> = {}): Item {
    const it: Item = { id: this.nextId++, type, mat, n, x: X(cell), y: Y(cell), z: Z(cell), held: 0, in: 0, res: 0, q: 0, born: this.tick, ...extra };
    this.items.set(it.id, it);
    if (!it.held && !it.in) this.indexItem(it);
    return it;
  }
  cellOf(o: { x: number; y: number; z: number }) {
    return idx(o.x, o.y, o.z);
  }
  private indexItem(it: Item) {
    const c = this.cellOf(it);
    const l = this.itemsAt.get(c);
    if (l) l.push(it.id);
    else this.itemsAt.set(c, [it.id]);
  }
  private unindexItem(it: Item) {
    const c = this.cellOf(it);
    const l = this.itemsAt.get(c);
    if (!l) return;
    const k = l.indexOf(it.id);
    if (k >= 0) l.splice(k, 1);
    if (!l.length) this.itemsAt.delete(c);
  }
  onGround(it: Item) {
    return !it.held && !it.in;
  }
  removeItem(it: Item) {
    if (this.onGround(it)) this.unindexItem(it);
    if (it.held) {
      const u = this.units.get(it.held);
      if (u) {
        if (u.carry === it.id) u.carry = 0;
        for (const s in u.equip) if (u.equip[s] === it.id) delete u.equip[s];
      }
    }
    if (it.in) {
      const b = this.buildings.get(it.in);
      if (b) b.mats = b.mats.filter((m) => m !== it.id);
    }
    this.items.delete(it.id);
  }
  /** Put an item on the ground at a cell. Merges into an existing stack of the same thing if possible. */
  placeItem(it: Item, cell: number) {
    if (this.onGround(it)) this.unindexItem(it);
    it.held = 0;
    it.in = 0;
    it.x = X(cell);
    it.y = Y(cell);
    it.z = Z(cell);
    if (this.stackable(it)) {
      for (const oid of this.itemsAt.get(cell) || []) {
        const o = this.items.get(oid)!;
        if (o.type === it.type && o.mat === it.mat && o.sub === it.sub && o.q === it.q && !o.res && !it.res && !o.forbid === !it.forbid && o.n + it.n <= MAX_STACK) {
          o.n += it.n;
          o.born = Math.max(o.born, it.born);
          this.items.delete(it.id);
          return o;
        }
      }
    }
    this.indexItem(it);
    return it;
  }
  stackable(it: Item) {
    return it.type !== 'drink' && it.type !== 'corpse' && it.type !== 'artifact' && !ITEMS[it.type].build && !ITEMS[it.type].weapon && !ITEMS[it.type].armor && !ITEMS[it.type].clothes;
  }
  /** Split `n` off a stack (or return the stack itself when it is all of it). The split-off part stays in the same place. */
  split(it: Item, n: number): Item {
    if (n >= it.n) return it;
    it.n -= n;
    const part: Item = { ...it, id: this.nextId++, n, res: 0 };
    this.items.set(part.id, part);
    if (this.onGround(part)) this.indexItem(part);
    return part;
  }
  /** Use up n of a stack. Empty drink barrels come back as barrels. */
  consume(it: Item, n = 1) {
    it.n -= n;
    if (it.n > 0) return;
    const cell = this.cellOf(it);
    const holder = it.held ? this.units.get(it.held) : undefined;
    const drink = it.type === 'drink';
    const barrelMat = it.mat;
    this.removeItem(it);
    if (drink) this.spawnItem('barrel', barrelMat, holder ? this.cellOf(holder) : cell);
  }
  carry(u: Unit, it: Item) {
    if (this.onGround(it)) this.unindexItem(it);
    if (it.in) {
      const b = this.buildings.get(it.in);
      if (b) b.mats = b.mats.filter((m) => m !== it.id);
      it.in = 0;
    }
    it.held = u.id;
    u.carry = it.id;
  }
  drop(u: Unit) {
    const it = this.items.get(u.carry);
    u.carry = 0;
    if (!it) return null;
    it.res = 0;
    return this.placeItem(it, this.cellOf(u));
  }
  equip(u: Unit, it: Item, slot: string) {
    const old = this.items.get(u.equip[slot]);
    if (old && slot === 'ammo' && old.type === it.type && old.mat === it.mat) {
      // more of the same bolts go into the same quiver
      old.n += it.n;
      this.removeItem(it);
      return;
    }
    if (old) {
      old.res = 0;
      this.placeItem(old, this.cellOf(u));
    }
    if (this.onGround(it)) this.unindexItem(it);
    if (u.carry === it.id) u.carry = 0;
    it.held = u.id;
    it.res = 0;
    u.equip[slot] = it.id;
  }
  slotFor(it: Item): string | null {
    const d = ITEMS[it.type];
    if (d.tool === 'pick') return 'pick';
    if (d.tool === 'axe') return 'axe';
    if (d.weapon) return 'weapon';
    if (d.ammo) return 'ammo';
    if (d.armor) return d.armor.slot;
    return null;
  }
  /** Everything a dying / leaving unit has falls to the ground. */
  dropAll(u: Unit) {
    const c = this.cellOf(u);
    if (u.carry) this.drop(u);
    for (const s in u.equip) {
      const it = this.items.get(u.equip[s]);
      if (it) {
        it.res = 0;
        this.placeItem(it, c);
      }
    }
    u.equip = {};
  }
  itemName(it: Item, plain = false): string {
    const d = ITEMS[it.type];
    const m = MATS[it.mat];
    let s: string;
    switch (it.type) {
      case 'boulder': s = `${m.name} boulder`; break;
      case 'sand': s = 'pile of sand'; break;
      case 'clay': s = 'lump of clay'; break;
      case 'barrel': s = m.kind === 'ceramic' ? `${m.name} large pot` : `${m.name} barrel`; break;
      case 'ore': s = m.id === 'coal' ? 'bituminous coal' : `${m.name}`; break;
      case 'gem': s = `rough ${m.name}`; break;
      case 'cutgem': s = `cut ${m.name}`; break;
      case 'plant': s = plantOf(it.sub || '').name; break;
      case 'seed': s = `${plantOf(it.sub || '').name} seeds`; break;
      case 'drink': s = `barrel of ${it.sub}`; break;
      case 'meat': s = `${it.sub || ''} meat`.trim(); break;
      case 'fish': s = it.sub || 'fish'; break;
      case 'meal': s = it.sub || 'prepared meal'; break;
      case 'corpse': s = `${CREATURES[it.sub || '']?.name || it.sub} corpse`; break;
      case 'hide': s = `${it.sub || ''} hide`.trim(); break;
      case 'bone': s = `${it.sub || ''} bones`.trim(); break;
      case 'skull': s = `${it.sub || ''} skull`.trim(); break;
      case 'fuel': s = m.name; break;
      case 'flour': s = it.sub || 'flour'; break;
      case 'egg': s = `${it.sub || ''} egg`.trim(); break;
      case 'milk': s = `${it.sub || ''} milk`.trim(); break;
      case 'cheese': s = `${it.sub || ''} cheese`.trim(); break;
      case 'wool': s = `${it.sub || ''} wool`.trim(); break;
      case 'leather': case 'cloth': s = m.id === 'wool' ? 'wool cloth' : m.name; break;
      case 'artifact': s = it.name || 'artifact'; break;
      default: s = m.id === 'none' ? d.name : `${m.name} ${d.name}`;
    }
    if (it.name && it.type !== 'artifact') s = `${it.name}, ${s}`;
    if (plain) return s;
    const q = QMARK[it.q] || '';
    s = `${q}${s}${q}`;
    if (it.n > 1) s += ` [${it.n}]`;
    return s;
  }
  itemValue(it: Item): number {
    const d = ITEMS[it.type];
    const m = MATS[it.mat];
    let v = d.value * (it.type === 'drink' || it.type === 'meal' || it.type === 'plant' || it.type === 'seed' || it.type === 'meat' || it.type === 'fish' || it.type === 'flour' ? 1 : Math.max(1, m.value));
    if (it.type === 'boulder' || it.type === 'ore' || it.type === 'gem') v = Math.max(1, m.value) * (it.type === 'gem' ? 1 : 1);
    if (it.type === 'cutgem') v = m.value * 2;
    v *= QVALUE[it.q] || 1;
    if (it.q >= 6 && it.name) v = Math.max(v, 2400 * Math.max(1, m.value)); // a named artifact is priceless whatever it is
    return Math.max(0, Math.round(v * it.n));
  }
  /** Can unit u (or anyone, if u is undefined) use this item right now? */
  itemFree(it: Item, u?: Unit): boolean {
    return this.onGround(it) && !it.forbid && (!it.res || (u !== undefined && it.res === u.id) || !this.units.has(it.res) || this.units.get(it.res)!.dead);
  }
  matches(it: Item, ing: Ing): boolean {
    if (Array.isArray(ing.type) ? !ing.type.includes(it.type) : it.type !== ing.type) return false;
    const m = MATS[it.mat];
    if (ing.mat && m.id !== ing.mat) return false;
    if (ing.kind && m.kind !== ing.kind) return false;
    if (ing.sub && it.sub !== ing.sub) return false;
    switch (ing.tag) {
      case 'brewable': return !!plantOf(it.sub || '').drink;
      case 'cookable': return it.type !== 'plant' || !!plantOf(it.sub || '').cook;
      case 'butcherable': return !it.dwarf && !!CREATURES[it.sub || '']?.meat;
      case 'flux': return !!m.flux;
    }
    return true;
  }
  /**
   * Nearest free item matching `pred` that unit u can walk to.
   * Returns null when there is none; `seen` is set to true if matching items exist but are unreachable / reserved.
   */
  findItem(u: Unit, pred: (it: Item) => boolean, info?: { exists?: boolean; unreachable?: boolean; reserved?: boolean; forbidden?: boolean }): Item | null {
    const from = this.cellOf(u);
    let best: Item | null = null, bestD = 1e9;
    for (const it of this.items.values()) {
      if (!pred(it)) continue;
      if (info) info.exists = true;
      if (!this.onGround(it)) continue;
      if (it.forbid) {
        if (info) info.forbidden = true;
        continue;
      }
      if (!this.itemFree(it, u)) {
        if (info) info.reserved = true;
        continue;
      }
      const c = this.cellOf(it);
      const d = dist(from, c);
      if (d >= bestD) continue;
      if (!this.w.canReach(from, c, true)) {
        if (info) info.unreachable = true;
        continue;
      }
      best = it;
      bestD = d;
    }
    return best;
  }
  /** Describe why an item of some kind could not be found, for failure messages. */
  whyNoItem(what: string, info: { exists?: boolean; unreachable?: boolean; reserved?: boolean; forbidden?: boolean }): string {
    if (info.unreachable) return `${what}: there is some, but no path to it`;
    if (info.reserved) return `${what}: all of it is reserved for other jobs`;
    if (info.forbidden) return `${what}: only forbidden items available (right-click the item to allow it)`;
    return `${what}: none in the fortress`;
  }
  itemsIn(cell: number): Item[] {
    return (this.itemsAt.get(cell) || []).map((i) => this.items.get(i)!).filter(Boolean);
  }
  /** total count of items matching, anywhere usable (on the ground, not forbidden) */
  count(pred: (it: Item) => boolean): number {
    let n = 0;
    for (const it of this.items.values()) if (this.onGround(it) && !it.forbid && pred(it)) n += it.n;
    return n;
  }
  /** cached stock totals by item type (+ a few specials) for the top bar and bills */
  stocks(): Record<string, number> {
    if (this.tick - this.stockCacheTick < 20 && this.stockCacheTick >= 0) return this.stockCache;
    const s: Record<string, number> = { drink: 0, food: 0, seeds: 0 };
    for (const it of this.items.values()) {
      // things being carried by a dwarf still belong to the fortress
      const carried = it.held && this.units.get(it.held)?.carry === it.id && this.units.get(it.held)?.faction === 'fort';
      if ((!this.onGround(it) && !carried) || it.forbid) continue;
      s[it.type] = (s[it.type] || 0) + it.n;
      if (this.edible(it)) s.food += it.n;
      if (it.type === 'seed') s.seeds += it.n;
    }
    this.stockCache = s;
    this.stockCacheTick = this.tick;
    return s;
  }
  edible(it: Item) {
    return it.type === 'meal' || it.type === 'meat' || it.type === 'fish' || it.type === 'cheese' || (it.type === 'plant' && !!plantOf(it.sub || '').raw);
  }

  // ------------------------------------------------------------------ units
  addUnit(kind: string, cell: number, faction: Unit['faction'], extra: Partial<Unit> = {}): Unit {
    const d = CREATURES[kind];
    const hp = Math.round(40 * d.size);
    const u: Unit = {
      id: this.nextId++, kind, name: d.name, fg: d.fg, x: X(cell), y: Y(cell), z: Z(cell), faction,
      hp, maxHp: hp, blood: 100, wounds: [], dead: false, path: null, pathGoal: -1, moveCd: 0, atkCd: 0, job: null, carry: 0, equip: {},
      target: 0, idleSince: this.tick, nextThink: this.tick + this.rng.int(20), skill: d.skill,
      isDwarf: false, hunger: 0, thirst: 0, tired: 0, sober: 0, thoughts: [], mood: 60, skills: {}, labors: {} as Record<Labor, number>,
      bed: 0, drafted: false, militia: false, moveOrder: -1, inBed: 0, downSince: 0, whyIdle: '', lastFail: '', lastFailTick: -9999, state: '', stateUntil: 0,
      trait: '', likes: '', age: 0, arrived: this.tick, kills: 0, ...extra,
    };
    this.units.set(u.id, u);
    this.place(u, cell);
    return u;
  }
  addDwarf(cell: number, skilled: string[] = []): Unit {
    const r = this.rng;
    const name = `${r.pick(FIRST_NAMES)} ${r.pick(SUR_A)}${r.pick(SUR_B)}`;
    const u = this.addUnit('dwarf', cell, 'fort', { name, isDwarf: true, fg: r.pick(DWARF_COLORS) });
    for (const s of SKILLS) u.skills[s] = 0;
    for (const l of LABORS) u.labors[l] = 0;
    u.labors.haul = 3;
    u.labors.build = 3;
    u.labors.doctor = 4;
    u.labors.farm = 4;
    const picks = skilled.length ? skilled : [r.pick(SKILLS), r.pick(SKILLS)];
    picks.forEach((s, k) => {
      u.skills[s] = (k === 0 ? 5 : 3) * 100 + r.int(100);
      if (s !== 'fight' && s !== 'shoot') u.labors[s as Labor] = k === 0 ? 1 : 2;
      else u.militia = true;
    });
    u.hunger = r.int(30);
    u.thirst = r.int(25);
    u.tired = r.int(30);
    u.age = r.range(20, 110);
    u.wear = r.range(55, 100);
    u.fun = r.int(40);
    u.faith = r.int(40);
    u.god = r.pick(GODS);
    u.trait = r.pick(['stoic', 'quick to anger', 'cheerful', 'gloomy', 'greedy', 'brave', 'nervous', 'stubborn', 'lazy', 'tireless', 'curious', 'grudge-holding']);
    u.likes = r.pick([...PLANTS.filter((p) => p.drink).map((p) => p.drink!), 'granite', 'iron', 'gold', 'cats', 'yaks', 'plump helmets', 'prepared meals', 'obsidian', 'statues']);
    return u;
  }
  /** how many dwarves can work and fight: what the fortress's enemies size themselves against */
  strength(): number {
    let n = 0;
    for (const u of this.units.values()) if (u.isDwarf && !u.dead && !u.child) n++;
    return n;
  }
  dwarves(): Unit[] {
    const out: Unit[] = [];
    for (const u of this.units.values()) if (u.isDwarf && !u.dead) out.push(u);
    return out;
  }
  skillLevel(u: Unit, s: string): number {
    if (!u.isDwarf) return u.skill;
    return Math.min(15, Math.floor((u.skills[s] || 0) / 100));
  }
  skillName(u: Unit, s: string) {
    return SKILL_LEVELS[this.skillLevel(u, s)];
  }
  train(u: Unit, s: string, xp: number) {
    if (u.isDwarf) u.skills[s] = (u.skills[s] || 0) + xp;
  }
  profession(u: Unit): string {
    if (!u.isDwarf) return CREATURES[u.kind].name;
    if (u.child) return 'Child';
    if (this.ev.mayor === u.id) return 'Mayor';
    let best = '', bv = 99;
    for (const s of SKILLS) if ((u.skills[s] || 0) > bv) {
      bv = u.skills[s];
      best = s;
    }
    if (u.militia || u.drafted) return best === 'fight' ? 'Militia Commander' : 'Militia Recruit';
    return best ? PROFESSION[best] : 'Peasant';
  }
  unitName(u: Unit): string {
    if (u.isDwarf) return u.name;
    const d = CREATURES[u.kind];
    if (u.kind === 'werebeast') return `${u.name} the were${u.cursed || 'beast'}`;
    if ((u.kind === 'zombie' || u.kind === 'ghost') && u.name !== d.name) return u.name;
    return u.name !== d.name ? `${u.name} the ${d.name}` : `the ${d.name}`;
  }
  /** work speed multiplier from skill (1 = dabbling, 2.5 = legendary) */
  speedMul(u: Unit, s: string) {
    return 1 + this.skillLevel(u, s) * 0.1;
  }
  qualityRoll(u: Unit, s: string): number {
    const lvl = this.skillLevel(u, s);
    let q = 0;
    for (let k = 0; k < 5; k++) if (this.rng.next() < 0.08 + lvl * 0.045) q++;
    return q;
  }
  unitsIn(cell: number): Unit[] {
    const out: Unit[] = [];
    const x = X(cell), y = Y(cell), z = Z(cell);
    for (const u of this.units.values()) if (!u.dead && u.x === x && u.y === y && u.z === z && u.state !== 'caged') out.push(u);
    return out;
  }
  /** a body takes up its tile: the dead, the downed, the caged, the carried and ghosts do not */
  isBody(o: Unit) {
    return !o.dead && !o.downSince && o.state !== 'caged' && !o.carriedBy && o.kind !== 'ghost';
  }
  indexUnits() {
    this.unitsAt.clear();
    for (const u of this.units.values()) if (this.isBody(u)) this.place(u, this.cellOf(u));
  }
  private place(u: Unit, c: number) {
    const a = this.unitsAt.get(c);
    if (a) a.push(u);
    else this.unitsAt.set(c, [u]);
  }
  /** an enemy of u standing at c: u cannot walk through it */
  blockerAt(u: Unit, c: number): Unit | undefined {
    return this.unitsAt.get(c)?.find((o) => o !== u && this.isBody(o) && this.hostile(u, o) && o.x === X(c) && o.y === Y(c) && o.z === Z(c));
  }
  /**
   * Is u just standing about (or fighting), so it can stand anywhere near where it meant to be? Someone at a
   * workbench, in bed or at a meal is where the job needs them, and may share a tile while they do it.
   */
  loitering(u: Unit) {
    const t = u.job?.type;
    return !u.isDwarf || !t || LOITER.has(t);
  }
  /** someone else who has stopped at c (rather than passing through): a loiterer should not stop there too */
  standerAt(u: Unit, c: number): Unit | undefined {
    return this.unitsAt.get(c)?.find((o) => o !== u && this.isBody(o) && (!o.path || !o.path.length) && o.x === X(c) && o.y === Y(c) && o.z === Z(c));
  }
  /**
   * A route for u: around enemies and onto a free work spot when there is one nearby, otherwise straight
   * on (and the enemy in the way gets fought, the dwarf at the work spot waited out).
   */
  pathFor(u: Unit, from: number, to: number, adjacent: boolean, brave = false, includeSelf = true): number[] | null {
    if (this.unitsAt.size) {
      this.w.avoid = (c) => !!this.blockerAt(u, c);
      this.w.taken = adjacent && this.loitering(u) ? (c) => !!this.standerAt(u, c) : null;
      const p = this.w.findPath(from, to, adjacent, brave, includeSelf);
      this.w.avoid = this.w.taken = null;
      if (p) return p;
    }
    return this.w.findPath(from, to, adjacent, brave, includeSelf);
  }
  moveUnit(u: Unit, cell: number) {
    const was = this.unitsAt.get(this.cellOf(u));
    if (was) {
      const k = was.indexOf(u);
      if (k >= 0) was.splice(k, 1);
    }
    if (this.isBody(u)) this.place(u, cell);
    u.x = X(cell);
    u.y = Y(cell);
    u.z = Z(cell);
  }
  think(u: Unit, text: string, v: number, days = 3) {
    if (!u.isDwarf) return;
    const t = u.thoughts.find((t) => t.text === text);
    if (t) {
      t.until = this.tick + days * TICKS_DAY;
      t.n = Math.min(5, (t.n || 1) + 1);
      return;
    }
    u.thoughts.push({ text, v, until: this.tick + days * TICKS_DAY });
  }

  // ------------------------------------------------------------------ buildings
  buildingAt(cell: number): Building | undefined {
    const id = this.bAt.get(cell);
    return id ? this.buildings.get(id) : undefined;
  }
  cellsOf(b: { x: number; y: number; z: number; w: number; h: number }): number[] {
    const out: number[] = [];
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) out.push(idx(b.x + dx, b.y + dy, b.z));
    return out;
  }
  center(b: Building) {
    return idx(b.x + (b.w >> 1), b.y + (b.h >> 1), b.z);
  }
  /** What a building of this type and size needs. Bridges scale with their area. */
  needsFor(type: string, w: number, h: number): Ing[] {
    const d = BUILDINGS[type];
    if (type !== 'bridge') return d.needs;
    return [{ type: ['boulder', 'block', 'log'], n: Math.max(1, Math.ceil((w * h) / 4)) }, { type: 'mechanism', n: 1 }];
  }
  addBuilding(type: string, x: number, y: number, z: number, w?: number, h?: number): Building {
    const d = BUILDINGS[type];
    const b: Building = { id: this.nextId++, type, x, y, z, w: w ?? d.w, h: h ?? d.h, built: false, progress: 0, mats: [], mat: 0, bills: [], worker: 0, owner: 0, q: 0 };
    this.buildings.set(b.id, b);
    for (const c of this.cellsOf(b)) this.bAt.set(c, b.id);
    return b;
  }
  /** Update the map's block bits for a finished building according to its state. */
  applyBlock(b: Building) {
    if (!b.built) return;
    const d = BUILDINGS[b.type];
    let bits = 0;
    if (b.type === 'door') bits = BLOCK_FLUID | (b.locked ? BLOCK_WALK : 0);
    else if (b.type === 'floodgate') bits = b.open ? 0 : BLOCK_WALK | BLOCK_FLUID;
    else if (b.type === 'bridge') bits = b.open ? 0 : BLOCK_DECK; // raised: the span is simply gone
    else if (d.blocks || b.type === 'well') bits = BLOCK_WALK;
    else if (b.type === 'axle') bits = this.w.tile[this.center(b)] === T.Open ? BLOCK_DECK : 0; // an axle across a gap can be walked along
    for (const c of this.cellsOf(b)) this.w.setBlock(c, bits);
  }
  removeBuilding(b: Building, dropMats = true) {
    for (const c of this.cellsOf(b)) {
      this.bAt.delete(c);
      if (this.w.block[c]) this.w.setBlock(c, 0);
    }
    const at = this.nearestFree(this.center(b));
    for (const id of b.mats.slice()) {
      const it = this.items.get(id);
      if (!it) continue;
      it.in = 0;
      it.res = 0;
      if (dropMats) this.placeItem(it, at);
      else this.items.delete(id);
    }
    b.mats = [];
    if (b.caged) {
      const u = this.units.get(b.caged);
      if (u) {
        u.state = '';
        this.moveUnit(u, at);
        this.say(`${this.unitName(u)} is loose!`, 'bad', at);
      }
    }
    for (const u of this.units.values()) {
      if (u.bed === b.id) u.bed = 0;
      if (u.inBed === b.id) u.inBed = 0;
    }
    for (const o of this.buildings.values()) if (o.links) o.links = o.links.filter((l) => l !== b.id);
    this.buildings.delete(b.id);
    this.w.version++;
  }
  /** nearest standable cell to `cell` (itself if fine) */
  nearestFree(cell: number): number {
    if (this.w.safe(cell)) return cell;
    const x = X(cell), y = Y(cell), z = Z(cell);
    for (let r = 1; r < 6; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || !inMap(x + dx, y + dy, z)) continue;
          const n = idx(x + dx, y + dy, z);
          if (this.w.safe(n)) return n;
        }
    return cell;
  }
  buildingName(b: Building): string {
    const d = BUILDINGS[b.type];
    let s = b.name || d.name;
    if (b.mat && !d.shop) s = `${MATS[b.mat].name} ${s.toLowerCase()}`;
    const q = QMARK[b.q] || '';
    return `${q}${s}${q}`;
  }

  // ------------------------------------------------------------------ zones
  addZone(kind: Zone['kind'], cells: number[], extra: Partial<Zone> = {}): Zone {
    const names: Record<string, string> = { stockpile: 'Stockpile', meeting: 'Meeting Hall', hospital: 'Hospital', fishing: 'Fishing Spot', farm: 'Farm Plot', pasture: 'Pasture', burrow: 'Refuge', tavern: 'Tavern', temple: 'Temple', barracks: 'Barracks' };
    const n = Array.from(this.zones.values()).filter((z) => z.kind === kind).length + 1;
    const z: Zone = { id: this.nextId++, kind, name: `${names[kind]} ${n}`, z: Z(cells[0]), cells: [], cats: kind === 'stockpile' ? CATS.filter((c) => c !== 'refuse' && c !== 'corpses') : [], crop: 'plump_helmet', ...extra };
    this.zones.set(z.id, z);
    for (const c of cells) {
      // one zone of each kind per cell
      if (this.zoneOfKind(c, kind)) continue;
      z.cells.push(c);
      const l = this.zoneAt.get(c);
      if (l) l.push(z.id);
      else this.zoneAt.set(c, [z.id]);
    }
    if (!z.cells.length) this.zones.delete(z.id);
    this.haulCacheTick = -999;
    return z;
  }
  removeZoneCells(cells: number[], kind?: Zone['kind']) {
    for (const c of cells) {
      const l = this.zoneAt.get(c);
      if (!l) continue;
      for (const id of l.slice()) {
        const z = this.zones.get(id)!;
        if (kind && z.kind !== kind) continue;
        z.cells = z.cells.filter((k) => k !== c);
        l.splice(l.indexOf(id), 1);
        if (z.kind === 'farm') this.crops.delete(c);
        if (!z.cells.length) this.zones.delete(id);
      }
      if (!l.length) this.zoneAt.delete(c);
    }
    this.haulCacheTick = -999;
  }
  zoneOfKind(cell: number, kind: Zone['kind']): Zone | undefined {
    const l = this.zoneAt.get(cell);
    if (!l) return undefined;
    for (const id of l) {
      const z = this.zones.get(id);
      if (z && z.kind === kind) return z;
    }
    return undefined;
  }
  zonesOf(kind: Zone['kind']): Zone[] {
    return Array.from(this.zones.values()).filter((z) => z.kind === kind);
  }
  /** Is this item sitting in a stockpile that accepts it? */
  stored(it: Item): boolean {
    if (!this.onGround(it)) return false;
    const z = this.zoneOfKind(this.cellOf(it), 'stockpile');
    return !!z && z.cats.includes(ITEMS[it.type].cat);
  }
  /** Find a stockpile cell that can take this item, nearest to the item. */
  stockpileSpot(it: Item, u: Unit, info?: { any?: boolean; full?: boolean; unreachable?: boolean }): number {
    const cat = ITEMS[it.type].cat;
    const from = this.cellOf(it.held ? u : it);
    const me = this.cellOf(u);
    let best = -1, bd = 1e9;
    for (const z of this.zones.values()) {
      if (z.kind !== 'stockpile' || !z.cats.includes(cat)) continue;
      if (info) info.any = true;
      for (const c of z.cells) {
        const d = dist(from, c);
        if (d >= bd) continue;
        const r = this.spRes.get(c);
        if (r && r !== u.id && this.units.has(r)) continue;
        if (!this.w.safe(c)) continue;
        const here = this.itemsAt.get(c);
        if (here && here.length) {
          // only if it can merge into the stack that is there
          const o = this.items.get(here[0])!;
          if (!(here.length === 1 && this.stackable(it) && o.type === it.type && o.mat === it.mat && o.sub === it.sub && o.q === it.q && !o.res && o.n + it.n <= MAX_STACK)) {
            if (info) info.full = true;
            continue;
          }
        }
        if (this.bAt.has(c)) continue;
        if (!this.w.connected(me, c)) {
          if (info) info.unreachable = true;
          continue;
        }
        best = c;
        bd = d;
      }
    }
    return best;
  }
  /** Items lying around that should be in a stockpile (cached for a few ticks). */
  looseItems(): number[] {
    if (this.tick - this.haulCacheTick < 15) return this.haulCache;
    const cats = new Set<Cat>();
    for (const z of this.zones.values()) if (z.kind === 'stockpile') for (const c of z.cats) cats.add(c);
    const out: number[] = [];
    if (cats.size)
      for (const it of this.items.values()) {
        if (!this.onGround(it) || it.forbid || it.res) continue;
        if (!cats.has(ITEMS[it.type].cat)) continue;
        if (it.skipHaul && it.skipHaul > this.tick) continue;
        if (this.stored(it)) continue;
        out.push(it.id);
      }
    this.haulCache = out;
    this.haulCacheTick = this.tick;
    return out;
  }

  // ------------------------------------------------------------------ designations
  designate(cell: number, d: number) {
    this.w.desig[cell] = d;
    if (d) this.desigs.add(cell);
    else this.desigs.delete(cell);
    this.w.version++;
  }

  // ------------------------------------------------------------------ claims
  claimed(key: string, u?: Unit): boolean {
    const who = this.claims.get(key);
    if (!who || (u && who === u.id)) return false;
    const o = this.units.get(who);
    if (!o || o.dead || !o.job || !this.jobHasKey(o.job, key)) {
      this.claims.delete(key);
      return false;
    }
    return true;
  }
  private jobHasKey(j: Job, key: string): boolean {
    for (let k: Job | undefined = j; k; k = k.next) if (k.key === key) return true;
    return false;
  }
  claimant(key: string): Unit | undefined {
    return this.claimed(key) ? this.units.get(this.claims.get(key)!) : undefined;
  }

  // ------------------------------------------------------------------ misc helpers
  /** Reveal around a freshly opened cell and announce discoveries. */
  reveal(cell: number) {
    const before = this.w.flag[cell] & F.Revealed;
    const r = this.w.discover(cell);
    if (r.count > 30 || (!before && r.count > 8)) {
      if (r.hollow) this.onHell(cell);
      else if (r.cavern) {
        this.ev.cavern++;
        this.say(this.ev.cavern === 1 ? 'You have discovered an expansive cavern deep underground!' : 'You have discovered another cavern!', 'event', cell);
        this.chronicle(this.ev.cavern === 1 ? 'The miners broke through into a great cavern.' : 'A second, deeper cavern was discovered.');
      }
    }
    if (r.magma && !this.ev.magmaSeen) {
      this.ev.magmaSeen = true;
      this.chronicle('The miners struck magma.');
      this.say('You have struck magma! Praise the miners! (Magma smelters and forges need no fuel.)', 'event', cell);
    }
    if (r.hollow && !this.ev.hell) this.onHell(cell);
  }
  onHell: (cell: number) => void = () => {};

  outsideAt(u: { x: number; y: number; z: number }) {
    return this.w.outside(idx(u.x, u.y, u.z));
  }
  hostile(a: Unit, b: Unit): boolean {
    if (a.dead || b.dead || a === b) return false;
    if (a.state === 'caged' || b.state === 'caged') return false;
    if (a.state === 'berserk' || b.state === 'berserk' || a.state === 'were' || b.state === 'were') return true;
    const fa = a.faction, fb = b.faction;
    if (fa === fb) return false;
    if (fa === 'enemy' || fb === 'enemy') return true;
    return false;
  }
  randomEdgeCell(): number {
    const home = idx(this.embark.x, this.embark.y, this.embark.z);
    for (let t = 0; t < 200; t++) {
      const side = this.rng.int(3); // not the river side (north)
      const k = this.rng.range(8, W - 9);
      const x = side === 0 ? 0 : side === 1 ? W - 1 : k;
      const y = side === 2 ? H - 1 : this.rng.range(Math.floor(H * 0.35), H - 2);
      const c = idx(x, y, this.w.surface[x + y * W]);
      // visitors arrive on the low ground, somewhere they can walk to the wagon from: not on a mountain ledge
      if (t < 150 && (this.w.surface[x + y * W] > this.embark.z + 3 || !this.w.connected(c, home))) continue;
      if (this.w.safe(c)) return c;
    }
    return idx(0, H - 1, this.w.surface[(H - 1) * W]);
  }
  /** a random standable cell within r of cell on the same level */
  randomNear(cell: number, r: number): number {
    const x = X(cell), y = Y(cell), z = Z(cell);
    for (let t = 0; t < 12; t++) {
      const nx = x + this.rng.range(-r, r), ny = y + this.rng.range(-r, r);
      if (!inMap(nx, ny, z)) continue;
      const n = idx(nx, ny, z);
      if (this.w.safe(n) && this.w.connected(cell, n)) return n;
    }
    return cell;
  }
  meetingSpot(): number {
    const zs = this.zonesOf('meeting');
    if (zs.length) {
      const z = zs[0];
      return z.cells[this.rng.int(z.cells.length)];
    }
    return idx(this.embark.x, this.embark.y, this.embark.z);
  }

  // ------------------------------------------------------------------ save / load
  serialize(): string {
    return JSON.stringify({
      v: 1, seed: this.seed, rs: this.rng.s, tick: this.tick, nextId: this.nextId, fortName: this.fortName, embark: this.embark, ev: this.ev, caravan: this.caravan,
      world: this.w.save(), items: Array.from(this.items.values()), units: Array.from(this.units.values()), buildings: Array.from(this.buildings.values()),
      zones: Array.from(this.zones.values()), crops: Array.from(this.crops.entries()), log: this.log.slice(-150), claims: Array.from(this.claims.entries()),
      spRes: Array.from(this.spRes.entries()), history: this.history, engravings: Array.from(this.engravings.entries()),
    });
  }
  static deserialize(json: string): Game {
    const d = JSON.parse(json);
    const g: Game = Object.create(Game.prototype);
    Object.assign(g, {
      w: new World(), rng: new Rng(1), seed: d.seed, tick: d.tick, nextId: d.nextId, fortName: d.fortName, embark: d.embark, ev: d.ev, caravan: d.caravan, wealth: 0,
      items: new Map(), units: new Map(), buildings: new Map(), zones: new Map(), log: d.log, crops: new Map(d.crops), desigs: new Set(),
      itemsAt: new Map(), bAt: new Map(), zoneAt: new Map(), claims: new Map(d.claims), spRes: new Map(d.spRes), alerts: [], unitsAt: new Map(),
      history: d.history || [], engravings: new Map(d.engravings || []), wetOk: new Set(),
      attention: null, haulCache: [], haulCacheTick: -999, stockCache: {}, stockCacheTick: -999, onHell: () => {},
    });
    g.rng.s = d.rs;
    g.w.load(d.world);
    for (const it of d.items as Item[]) {
      g.items.set(it.id, it);
      if (g.onGround(it)) g.indexItem(it);
    }
    for (const u of d.units as Unit[]) g.units.set(u.id, u);
    for (const b of d.buildings as Building[]) {
      g.buildings.set(b.id, b);
      for (const c of g.cellsOf(b)) g.bAt.set(c, b.id);
    }
    for (const z of d.zones as Zone[]) {
      g.zones.set(z.id, z);
      for (const c of z.cells) {
        const l = g.zoneAt.get(c);
        if (l) l.push(z.id);
        else g.zoneAt.set(c, [z.id]);
      }
    }
    for (let i = 0; i < g.w.desig.length; i++) if (g.w.desig[i]) g.desigs.add(i);
    return g;
  }
}

export { DIRS8, WH, T, MAT, BUILDINGS };
