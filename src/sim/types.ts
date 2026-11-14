import type { Cat, Labor } from './defs';

export interface Item {
  id: number;
  type: string; // key into ITEMS
  mat: number; // material index
  sub?: string; // plant id, creature id, drink name, corpse name...
  n: number; // stack size
  x: number;
  y: number;
  z: number;
  held: number; // unit id carrying / wearing it (0 = no one)
  in: number; // building id it is stored inside / built into (0 = none)
  res: number; // unit id that has reserved it for a job
  q: number; // quality 0..6
  forbid?: boolean;
  born: number; // tick created (rot)
  name?: string; // artifacts
  dwarf?: boolean; // corpse of a fortress dwarf
  skipHaul?: number; // tick until which haulers ignore it
}

export interface Wound {
  part: number;
  sev: 1 | 2; // 1 minor, 2 major (broken / mangled)
  bleed: number; // blood lost per 10 ticks
  treated: boolean;
  heal: number; // ticks until healed
  desc: string;
}

export interface Thought {
  text: string;
  v: number; // mood effect
  until: number; // tick it expires
  n?: number; // stack count
}

export interface Job {
  type: string;
  label: string; // human readable: "Mining granite"
  step: number;
  x: number;
  y: number;
  z: number;
  t: number; // work timer
  item?: number;
  items?: number[]; // for multi-ingredient jobs
  b?: number; // building id
  u?: number; // target unit id
  zone?: number;
  bill?: number; // bill index
  recipe?: string;
  forced?: boolean; // ordered directly by the player
  data?: number; // misc
  started: number;
  key?: string; // claim on the thing being worked on (cell, building, unit) so two dwarves do not do the same task
  dest?: number; // destination cell (hauling)
  counts?: number[]; // how many units of each of `items` are needed
  labor?: string; // labor / skill this job trains
  sub?: string;
  next?: Job; // job to start right after this one finishes (e.g. fetch a pick, then dig)
  n?: number;
}

export interface Unit {
  id: number;
  kind: string; // CREATURES key
  name: string;
  fg: string;
  x: number;
  y: number;
  z: number;
  faction: 'fort' | 'wild' | 'enemy' | 'merchant';
  hp: number;
  maxHp: number;
  blood: number; // 0..100
  wounds: Wound[];
  dead: boolean;
  path: number[] | null;
  pathGoal: number; // idx the path leads to (or -1)
  moveCd: number;
  atkCd: number;
  job: Job | null;
  carry: number; // item id
  equip: Record<string, number>; // slot -> item id (pick, axe, weapon, shield, head, body, legs, hands, feet, ammo)
  wear?: number; // dwarves: condition of the clothes on their back, 0 (naked) .. 100 (new)
  target: number; // unit id being attacked
  idleSince: number;
  nextThink: number;
  skill: number; // base combat skill for non dwarves
  // ---- dwarves only
  isDwarf: boolean;
  hunger: number;
  thirst: number;
  tired: number;
  sober: number; // ticks since last proper drink
  thoughts: Thought[];
  mood: number; // 0..100
  skills: Record<string, number>; // xp
  labors: Record<Labor, number>; // 0 off, 1 (highest) .. 4
  bed: number; // owned bed building id
  drafted: boolean;
  militia: boolean;
  moveOrder: number; // idx to walk to when drafted (-1 none)
  inBed: number; // building id of the bed currently lying in
  downSince: number; // tick incapacitated (0 = fine)
  whyIdle: string; // explanation shown in UI
  lastFail: string; // most recent job failure, for the UI
  lastFailTick: number;
  state: '' | 'tantrum' | 'berserk' | 'melancholy' | 'mood' | 'caged' | 'were';
  cursed?: string; // werebeast curse: the animal form ("wolf"); transforms at the full moon
  vampire?: boolean;
  raised?: boolean; // zombie raised by a necromancer
  stateUntil: number;
  moodNeeds?: { type: string; kind?: string; have: boolean }[]; // strange mood
  moodShop?: number;
  trait: string;
  likes: string;
  age: number;
  arrived: number;
  kills: number;
  // ---- non-dwarves
  hunted?: boolean;
  slaughter?: boolean;
  leaveAt?: number; // tick when visitors / raiders give up and leave
  flee?: boolean;
  stolen?: number;
  home?: number; // idx wild animals wander around
  owner?: number; // pets
  cagedIn?: number; // building id
  chaseAt?: number; // cell the current chase path leads to
  carriedBy?: number; // unit id of the doctor carrying this unit
}

export interface Bill {
  recipe: string;
  mode: 'count' | 'forever' | 'until';
  n: number; // count remaining, or target stock for 'until'
  paused: boolean;
  why?: string; // last reason it could not be worked on
}

export interface Building {
  id: number;
  type: string; // BUILDINGS key
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  built: boolean;
  progress: number;
  mats: number[]; // item ids delivered / built in
  mat: number; // main material once built
  bills: Bill[];
  worker: number; // unit id currently working on / in it
  owner: number; // beds, coffins: unit id
  locked?: boolean; // doors
  open?: boolean; // floodgates (open = passable), bridges (open = raised), levers (state)
  links?: number[]; // levers: linked building ids
  pull?: boolean; // lever: pull requested
  q: number;
  suspended?: boolean;
  remove?: boolean; // marked for deconstruction
  caged?: number; // cage trap: unit id inside
  corpse?: string; // coffins: who is buried here
  name?: string;
  why?: string;
}

export interface Zone {
  id: number;
  kind: 'stockpile' | 'meeting' | 'hospital' | 'fishing' | 'farm' | 'pasture' | 'burrow';
  name: string;
  z: number;
  cells: number[];
  cats: Cat[]; // stockpiles
  crop: string; // farms
}

export interface LogEntry {
  tick: number;
  text: string;
  kind: 'info' | 'good' | 'bad' | 'combat' | 'death' | 'event';
  x?: number;
  y?: number;
  z?: number;
}

export interface Alert {
  id: string;
  text: string; // short title
  detail: string; // explanation of what is wrong and how to fix
  sev: 'warn' | 'bad';
  x?: number;
  y?: number;
  z?: number;
  unit?: number;
}

/** Result of asking "can this be done?": ok, or a human readable reason why not. */
export type Can = { ok: true } | { ok: false; why: string };

/** A context menu entry: what the right-clicked thing lets the selected dwarf do. */
export interface Option {
  label: string;
  why?: string; // if set the option is disabled and this explains why
  job?: Job; // job to assign when chosen
  act?: string; // or a non-job action id handled by Game.act
  arg?: number;
}

export interface Caravan {
  civ: string;
  arrive: number;
  leave: number;
  state: 'coming' | 'trading' | 'leaving';
  goods: Item[]; // not on the map
  units: number[];
  traded: number;
}
