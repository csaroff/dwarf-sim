// Static game data: materials, plants, items, creatures, buildings, recipes, labors.
// Everything here is plain data so that it is easy to tweak.

export const W = 96;
export const H = 96;
export const D = 32;
export const N = W * H * D;

export const TICKS_DAY = 1800;
export const DAYS_SEASON = 12;
export const TICKS_SEASON = TICKS_DAY * DAYS_SEASON;
export const TICKS_YEAR = TICKS_SEASON * 4;
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

// ---------------------------------------------------------------- tiles
export const T = { Open: 0, Wall: 1, Floor: 2, Ramp: 3, Stair: 4, Tree: 5 } as const;

// flag bits (per cell)
export const F = {
  Revealed: 1,
  Built: 2, // constructed by dwarves (wall/floor/stair/ramp)
  Smooth: 4,
  Engraved: 8,
  Mud: 16,
  Source: 32, // endless water (river edge)
  Hollow: 64, // the inside of an adamantine spire. Do not dig here.
  Blood: 128,
} as const;

// ---------------------------------------------------------------- materials
export type MatKind = 'soil' | 'stone' | 'ore' | 'gem' | 'wood' | 'metal' | 'organic' | 'special';
export interface MatDef {
  id: string;
  name: string;
  kind: MatKind;
  fg: string; // glyph colour
  bg: string; // wall background
  glyph: string; // natural wall glyph
  hard: number; // dig time multiplier
  value: number; // value multiplier for things made of it
  smelt?: string; // ores: resulting metal
  weapon?: number; // metals: damage multiplier
  armor?: number; // metals/leather: protection
  flux?: boolean;
}

export const MATS: MatDef[] = [
  { id: 'none', name: 'nothing', kind: 'special', fg: '#000', bg: '#000', glyph: ' ', hard: 1, value: 0 },
  // soils
  { id: 'loam', name: 'loam', kind: 'soil', fg: '#8a6a3a', bg: '#3d2c16', glyph: '▒', hard: 0.3, value: 0 },
  { id: 'sand', name: 'sand', kind: 'soil', fg: '#d6c27a', bg: '#6e6236', glyph: '░', hard: 0.3, value: 0 },
  { id: 'clay', name: 'clay', kind: 'soil', fg: '#b5714a', bg: '#55301c', glyph: '▒', hard: 0.35, value: 0 },
  // stone
  { id: 'limestone', name: 'limestone', kind: 'stone', fg: '#d8d4c0', bg: '#55534a', glyph: '░', hard: 1, value: 1, flux: true },
  { id: 'sandstone', name: 'sandstone', kind: 'stone', fg: '#d1a871', bg: '#5a4526', glyph: '░', hard: 0.9, value: 1 },
  { id: 'granite', name: 'granite', kind: 'stone', fg: '#b9b0ac', bg: '#4a4544', glyph: '▓', hard: 1.2, value: 1 },
  { id: 'marble', name: 'marble', kind: 'stone', fg: '#f2f2f2', bg: '#6c6c70', glyph: '▓', hard: 1.1, value: 2, flux: true },
  { id: 'gabbro', name: 'gabbro', kind: 'stone', fg: '#8c8c8c', bg: '#2e2e30', glyph: '▓', hard: 1.3, value: 1 },
  { id: 'basalt', name: 'basalt', kind: 'stone', fg: '#77777f', bg: '#242428', glyph: '▓', hard: 1.3, value: 1 },
  { id: 'obsidian', name: 'obsidian', kind: 'stone', fg: '#a070c8', bg: '#1a1420', glyph: '▓', hard: 1.5, value: 3 },
  { id: 'slade', name: 'slade', kind: 'special', fg: '#555', bg: '#111', glyph: '█', hard: 999, value: 0 },
  // ores
  { id: 'hematite', name: 'hematite', kind: 'ore', fg: '#d0503a', bg: '#4a4544', glyph: '£', hard: 1.2, value: 8, smelt: 'iron' },
  { id: 'native_copper', name: 'native copper', kind: 'ore', fg: '#e08a4a', bg: '#4a4544', glyph: '£', hard: 1.1, value: 2, smelt: 'copper' },
  { id: 'cassiterite', name: 'cassiterite', kind: 'ore', fg: '#c8c8a0', bg: '#4a4544', glyph: '£', hard: 1.1, value: 2, smelt: 'tin' },
  { id: 'native_silver', name: 'native silver', kind: 'ore', fg: '#e8e8ff', bg: '#4a4544', glyph: '£', hard: 1.1, value: 10, smelt: 'silver' },
  { id: 'native_gold', name: 'native gold', kind: 'ore', fg: '#ffd040', bg: '#4a4544', glyph: '£', hard: 1.1, value: 30, smelt: 'gold' },
  { id: 'coal', name: 'bituminous coal', kind: 'ore', fg: '#606060', bg: '#1c1c1c', glyph: '£', hard: 0.9, value: 2 },
  { id: 'raw_adamantine', name: 'raw adamantine', kind: 'ore', fg: '#40f0f0', bg: '#0a3a48', glyph: '£', hard: 3, value: 250, smelt: 'adamantine' },
  // gems
  { id: 'rock_crystal', name: 'rock crystal', kind: 'gem', fg: '#e0ffff', bg: '#4a4544', glyph: '☼', hard: 1.3, value: 10 },
  { id: 'amethyst', name: 'amethyst', kind: 'gem', fg: '#c070ff', bg: '#4a4544', glyph: '☼', hard: 1.3, value: 15 },
  { id: 'emerald', name: 'emerald', kind: 'gem', fg: '#40e070', bg: '#2e2e30', glyph: '☼', hard: 1.5, value: 40 },
  { id: 'ruby', name: 'ruby', kind: 'gem', fg: '#ff3050', bg: '#2e2e30', glyph: '☼', hard: 1.5, value: 40 },
  { id: 'diamond', name: 'diamond', kind: 'gem', fg: '#ffffff', bg: '#2e2e30', glyph: '☼', hard: 1.8, value: 60 },
  // wood
  { id: 'oak', name: 'oak', kind: 'wood', fg: '#b07a3c', bg: '#4a3418', glyph: '♣', hard: 1, value: 1 },
  { id: 'pine', name: 'pine', kind: 'wood', fg: '#c79a55', bg: '#4a3418', glyph: '♠', hard: 1, value: 1 },
  { id: 'tower_cap', name: 'tower-cap', kind: 'wood', fg: '#e8e0d0', bg: '#55504a', glyph: '♠', hard: 1, value: 1 },
  // metals
  { id: 'copper', name: 'copper', kind: 'metal', fg: '#e08a4a', bg: '#5a341c', glyph: '≡', hard: 1, value: 2, weapon: 0.9, armor: 0.9 },
  { id: 'tin', name: 'tin', kind: 'metal', fg: '#c8c8c8', bg: '#4c4c4c', glyph: '≡', hard: 1, value: 2, weapon: 0.6, armor: 0.6 },
  { id: 'bronze', name: 'bronze', kind: 'metal', fg: '#d8a040', bg: '#55401a', glyph: '≡', hard: 1, value: 5, weapon: 1.1, armor: 1.1 },
  { id: 'iron', name: 'iron', kind: 'metal', fg: '#b8bcc8', bg: '#44464c', glyph: '≡', hard: 1, value: 10, weapon: 1.3, armor: 1.3 },
  { id: 'steel', name: 'steel', kind: 'metal', fg: '#e0e4f0', bg: '#50525a', glyph: '≡', hard: 1, value: 30, weapon: 1.6, armor: 1.6 },
  { id: 'silver', name: 'silver', kind: 'metal', fg: '#f0f0ff', bg: '#5c5c66', glyph: '≡', hard: 1, value: 10, weapon: 0.8, armor: 0.7 },
  { id: 'gold', name: 'gold', kind: 'metal', fg: '#ffd040', bg: '#665218', glyph: '≡', hard: 1, value: 30, weapon: 0.5, armor: 0.5 },
  { id: 'adamantine', name: 'adamantine', kind: 'metal', fg: '#40f0f0', bg: '#0a4a58', glyph: '≡', hard: 1, value: 300, weapon: 3, armor: 3 },
  // organics (items only)
  { id: 'leather', name: 'leather', kind: 'organic', fg: '#b07040', bg: '#3a2412', glyph: '§', hard: 1, value: 2, armor: 0.5 },
  { id: 'bone', name: 'bone', kind: 'organic', fg: '#f0f0e0', bg: '#55554c', glyph: '~', hard: 1, value: 1 },
  { id: 'cloth', name: 'pig tail cloth', kind: 'organic', fg: '#e0d8c0', bg: '#55503c', glyph: '§', hard: 1, value: 2 },
  { id: 'flesh', name: 'flesh', kind: 'organic', fg: '#c05050', bg: '#3a1818', glyph: '%', hard: 1, value: 1 },
  { id: 'charcoal', name: 'charcoal', kind: 'organic', fg: '#707070', bg: '#1c1c1c', glyph: '*', hard: 1, value: 1 },
  { id: 'coke', name: 'coke', kind: 'organic', fg: '#808088', bg: '#1c1c1c', glyph: '*', hard: 1, value: 1 },
];
export const MAT: Record<string, number> = {};
MATS.forEach((m, i) => (MAT[m.id] = i));
export const matOf = (id: string): MatDef => MATS[MAT[id] ?? 0];

// ---------------------------------------------------------------- plants
export interface PlantDef {
  id: string;
  name: string;
  kind: 'tree' | 'shrub' | 'crop' | 'grass';
  glyph: string;
  fg: string;
  under?: boolean; // grows underground
  raw?: boolean; // edible raw
  cook?: boolean;
  drink?: string; // name of the booze it brews into
  cloth?: boolean;
  wood?: string; // trees: wood material
  grow?: number; // crop grow time in ticks
}
export const PLANTS: PlantDef[] = [
  { id: 'none', name: '', kind: 'grass', glyph: ' ', fg: '#000' },
  { id: 'grass', name: 'grass', kind: 'grass', glyph: ',', fg: '#4f9a3a' },
  { id: 'cave_moss', name: 'cave moss', kind: 'grass', glyph: ',', fg: '#4a8a80' },
  { id: 'oak', name: 'oak', kind: 'tree', glyph: '♣', fg: '#3fa03a', wood: 'oak' },
  { id: 'pine', name: 'pine', kind: 'tree', glyph: '♠', fg: '#2a8048', wood: 'pine' },
  { id: 'tower_cap', name: 'tower-cap', kind: 'tree', glyph: '♠', fg: '#e8e0d0', wood: 'tower_cap', under: true },
  { id: 'plump_helmet', name: 'plump helmet', kind: 'crop', glyph: '♠', fg: '#c060e0', under: true, raw: true, cook: true, drink: 'dwarven wine', grow: TICKS_DAY * 5 },
  { id: 'pig_tail', name: 'pig tail', kind: 'crop', glyph: 'τ', fg: '#d8d0b0', under: true, drink: 'dwarven ale', cloth: true, grow: TICKS_DAY * 6 },
  { id: 'cave_wheat', name: 'cave wheat', kind: 'crop', glyph: '"', fg: '#e8e8a0', under: true, cook: true, drink: 'dwarven beer', grow: TICKS_DAY * 6 },
  { id: 'sweet_pod', name: 'sweet pod', kind: 'crop', glyph: 'σ', fg: '#ff9060', under: true, cook: true, drink: 'dwarven rum', grow: TICKS_DAY * 6 },
  { id: 'strawberry', name: 'wild strawberry', kind: 'shrub', glyph: '"', fg: '#ff5070', raw: true, cook: true, drink: 'strawberry wine', grow: TICKS_DAY * 5 },
  { id: 'prickle_berry', name: 'prickle berry', kind: 'shrub', glyph: '"', fg: '#b070ff', raw: true, cook: true, drink: 'prickle berry wine', grow: TICKS_DAY * 5 },
  { id: 'rat_weed', name: 'rat weed', kind: 'shrub', glyph: '"', fg: '#90b050', drink: 'sewer brew', grow: TICKS_DAY * 5 },
];
export const PLANT: Record<string, number> = {};
PLANTS.forEach((p, i) => (PLANT[p.id] = i));
export const plantOf = (id: string): PlantDef => PLANTS[PLANT[id] ?? 0];
export const CROPS = PLANTS.filter((p) => p.grow);

// ---------------------------------------------------------------- items
export type Cat =
  | 'stone' | 'ore' | 'wood' | 'bars' | 'gems' | 'food' | 'drink' | 'seeds' | 'furniture'
  | 'weapons' | 'armor' | 'tools' | 'goods' | 'cloth' | 'refuse' | 'corpses';
export const CATS: Cat[] = ['stone', 'ore', 'wood', 'bars', 'gems', 'food', 'drink', 'seeds', 'furniture', 'weapons', 'armor', 'tools', 'goods', 'cloth', 'refuse', 'corpses'];

export interface ItemDef {
  id: string;
  name: string;
  cat: Cat;
  glyph: string;
  fg?: string; // default: material colour
  value: number;
  build?: string; // furniture: building type it installs as
  weapon?: { dmg: number; verb: string; type: 'edge' | 'blunt' | 'pierce' };
  tool?: 'pick' | 'axe';
  armor?: { slot: 'head' | 'body' | 'legs' | 'shield'; prot: number };
  rots?: boolean;
}
const I = (d: ItemDef) => d;
export const ITEMS: Record<string, ItemDef> = {
  boulder: I({ id: 'boulder', name: 'boulder', cat: 'stone', glyph: '•', value: 1 }),
  ore: I({ id: 'ore', name: 'ore', cat: 'ore', glyph: '*', value: 2 }),
  gem: I({ id: 'gem', name: 'rough gem', cat: 'gems', glyph: '☼', value: 3 }),
  cutgem: I({ id: 'cutgem', name: 'cut gem', cat: 'gems', glyph: '♦', value: 10 }),
  log: I({ id: 'log', name: 'log', cat: 'wood', glyph: '▬', value: 2 }),
  bar: I({ id: 'bar', name: 'bar', cat: 'bars', glyph: '≡', value: 5 }),
  block: I({ id: 'block', name: 'block', cat: 'stone', glyph: '■', value: 2 }),
  fuel: I({ id: 'fuel', name: 'fuel', cat: 'bars', glyph: '*', value: 2 }),
  plant: I({ id: 'plant', name: 'plant', cat: 'food', glyph: '♠', value: 2, rots: true }),
  seed: I({ id: 'seed', name: 'seeds', cat: 'seeds', glyph: '·', value: 1 }),
  meat: I({ id: 'meat', name: 'meat', cat: 'food', glyph: '%', fg: '#d06060', value: 2, rots: true }),
  fish: I({ id: 'fish', name: 'fish', cat: 'food', glyph: 'α', fg: '#80c0e0', value: 2, rots: true }),
  meal: I({ id: 'meal', name: 'prepared meal', cat: 'food', glyph: '%', fg: '#f0c060', value: 10 }),
  drink: I({ id: 'drink', name: 'drink', cat: 'drink', glyph: 'ö', fg: '#d0a040', value: 3 }),
  barrel: I({ id: 'barrel', name: 'barrel', cat: 'tools', glyph: 'ö', value: 10 }),
  bed: I({ id: 'bed', name: 'bed', cat: 'furniture', glyph: 'Θ', value: 20, build: 'bed' }),
  table: I({ id: 'table', name: 'table', cat: 'furniture', glyph: '╤', value: 15, build: 'table' }),
  chair: I({ id: 'chair', name: 'chair', cat: 'furniture', glyph: '╥', value: 15, build: 'chair' }),
  door: I({ id: 'door', name: 'door', cat: 'furniture', glyph: '┼', value: 15, build: 'door' }),
  chest: I({ id: 'chest', name: 'chest', cat: 'furniture', glyph: 'æ', value: 15, build: 'chest' }),
  cabinet: I({ id: 'cabinet', name: 'cabinet', cat: 'furniture', glyph: 'π', value: 15, build: 'cabinet' }),
  coffin: I({ id: 'coffin', name: 'coffin', cat: 'furniture', glyph: '0', value: 15, build: 'coffin' }),
  statue: I({ id: 'statue', name: 'statue', cat: 'furniture', glyph: 'Ω', value: 30, build: 'statue' }),
  floodgate: I({ id: 'floodgate', name: 'floodgate', cat: 'furniture', glyph: 'X', value: 15, build: 'floodgate' }),
  mechanism: I({ id: 'mechanism', name: 'mechanism', cat: 'tools', glyph: '¤', value: 15 }),
  cage: I({ id: 'cage', name: 'cage', cat: 'tools', glyph: '▓', value: 12 }),
  pick: I({ id: 'pick', name: 'pick', cat: 'tools', glyph: '/', value: 25, tool: 'pick', weapon: { dmg: 9, verb: 'strikes', type: 'pierce' } }),
  axe: I({ id: 'axe', name: 'battle axe', cat: 'weapons', glyph: '/', value: 30, tool: 'axe', weapon: { dmg: 12, verb: 'hacks', type: 'edge' } }),
  sword: I({ id: 'sword', name: 'short sword', cat: 'weapons', glyph: '/', value: 30, weapon: { dmg: 11, verb: 'slashes', type: 'edge' } }),
  spear: I({ id: 'spear', name: 'spear', cat: 'weapons', glyph: '/', value: 25, weapon: { dmg: 10, verb: 'stabs', type: 'pierce' } }),
  hammer: I({ id: 'hammer', name: 'war hammer', cat: 'weapons', glyph: '/', value: 30, weapon: { dmg: 10, verb: 'bashes', type: 'blunt' } }),
  shield: I({ id: 'shield', name: 'shield', cat: 'armor', glyph: '[', value: 20, armor: { slot: 'shield', prot: 3 } }),
  helm: I({ id: 'helm', name: 'helm', cat: 'armor', glyph: '[', value: 20, armor: { slot: 'head', prot: 4 } }),
  mail: I({ id: 'mail', name: 'mail shirt', cat: 'armor', glyph: '[', value: 40, armor: { slot: 'body', prot: 5 } }),
  greaves: I({ id: 'greaves', name: 'greaves', cat: 'armor', glyph: '[', value: 30, armor: { slot: 'legs', prot: 4 } }),
  hide: I({ id: 'hide', name: 'raw hide', cat: 'refuse', glyph: '≈', fg: '#a08060', value: 1, rots: true }),
  leather: I({ id: 'leather', name: 'leather', cat: 'cloth', glyph: '§', value: 5 }),
  cloth: I({ id: 'cloth', name: 'cloth', cat: 'cloth', glyph: '§', value: 5 }),
  bone: I({ id: 'bone', name: 'bones', cat: 'refuse', glyph: '~', fg: '#f0f0e0', value: 1 }),
  skull: I({ id: 'skull', name: 'skull', cat: 'refuse', glyph: '☻', fg: '#f0f0e0', value: 1 }),
  corpse: I({ id: 'corpse', name: 'corpse', cat: 'corpses', glyph: '☺', fg: '#905050', value: 0 }),
  craft: I({ id: 'craft', name: 'crafts', cat: 'goods', glyph: '♦', value: 10 }),
  totem: I({ id: 'totem', name: 'totem', cat: 'goods', glyph: '♦', fg: '#f0f0e0', value: 15 }),
  splint: I({ id: 'splint', name: 'splint', cat: 'tools', glyph: '|', value: 5 }),
  crutch: I({ id: 'crutch', name: 'crutch', cat: 'tools', glyph: '|', value: 5 }),
  artifact: I({ id: 'artifact', name: 'artifact', cat: 'goods', glyph: '☼', value: 2400 }),
};
export const QUALITY = ['', 'well-crafted', 'finely-crafted', 'superior', 'exceptional', 'masterful', 'artifact'];
export const QMARK = ['', '-', '+', '*', '≡', '☼', '☼'];
export const QVALUE = [1, 1.2, 1.5, 2, 3, 5, 12];

// ---------------------------------------------------------------- labors & skills
export const LABORS = ['doctor', 'mine', 'chop', 'build', 'farm', 'brew', 'cook', 'mason', 'carpenter', 'smith', 'craft', 'hunt', 'fish', 'haul'] as const;
export type Labor = (typeof LABORS)[number];
export const LABOR_NAME: Record<Labor, string> = {
  doctor: 'Doctor', mine: 'Mine', chop: 'Chop', build: 'Build', farm: 'Farm', brew: 'Brew', cook: 'Cook',
  mason: 'Mason', carpenter: 'Carpentry', smith: 'Smith', craft: 'Craft', hunt: 'Hunt', fish: 'Fish', haul: 'Haul',
};
export const LABOR_HELP: Record<Labor, string> = {
  doctor: 'Rescue the wounded, tend wounds, feed patients',
  mine: 'Dig, channel, carve stairs (needs a pick)',
  chop: 'Fell trees (needs an axe)',
  build: 'Construct buildings, walls, furniture; deconstruct',
  farm: 'Plant, harvest, gather wild plants',
  brew: 'Brew drinks at the Still',
  cook: 'Cook meals, butcher animals',
  mason: 'Stone furniture, blocks, smoothing and engraving',
  carpenter: 'Wooden furniture, barrels',
  smith: 'Smelt ore, forge metal',
  craft: 'Crafts, gems, leather, cloth, mechanisms',
  hunt: 'Hunt marked animals',
  fish: 'Fish at fishing zones',
  haul: 'Carry things to stockpiles, pull levers, bury the dead',
};
export const SKILLS = [...LABORS.filter((l) => l !== 'haul'), 'fight'] as string[];
export const SKILL_LEVELS = ['Dabbling', 'Novice', 'Adequate', 'Competent', 'Skilled', 'Proficient', 'Talented', 'Adept', 'Expert', 'Professional', 'Accomplished', 'Great', 'Master', 'High Master', 'Grand Master', 'Legendary'];
export const PROFESSION: Record<string, string> = {
  doctor: 'Doctor', mine: 'Miner', chop: 'Woodcutter', build: 'Architect', farm: 'Farmer', brew: 'Brewer', cook: 'Cook',
  mason: 'Mason', carpenter: 'Carpenter', smith: 'Metalsmith', craft: 'Craftsdwarf', hunt: 'Hunter', fish: 'Fisherdwarf', fight: 'Axedwarf',
};

// ---------------------------------------------------------------- creatures
export interface CreatureDef {
  id: string;
  name: string;
  glyph: string;
  fg: string;
  size: number; // hit points scale (dwarf = 1)
  speed: number; // ticks per tile
  dmg: number;
  verb: string;
  dtype: 'edge' | 'blunt' | 'pierce';
  skill: number;
  hostile?: boolean; // attacks fort units on sight
  predator?: boolean; // wild, but attacks when close
  meat?: number;
  water?: boolean; // lives in water
  tame?: boolean;
  where?: 'surface' | 'cavern' | 'river';
  armor?: number;
  flies?: boolean;
}
export const CREATURES: Record<string, CreatureDef> = {
  dwarf: { id: 'dwarf', name: 'dwarf', glyph: '☺', fg: '#fff', size: 1, speed: 6, dmg: 4, verb: 'punches', dtype: 'blunt', skill: 0 },
  dog: { id: 'dog', name: 'dog', glyph: 'd', fg: '#c09050', size: 0.6, speed: 4, dmg: 5, verb: 'bites', dtype: 'edge', skill: 3, tame: true, meat: 3 },
  cat: { id: 'cat', name: 'cat', glyph: 'c', fg: '#e0e0e0', size: 0.2, speed: 4, dmg: 1, verb: 'scratches', dtype: 'edge', skill: 2, tame: true, meat: 1 },
  yak: { id: 'yak', name: 'yak', glyph: 'Y', fg: '#a08060', size: 2.5, speed: 8, dmg: 4, verb: 'kicks', dtype: 'blunt', skill: 1, tame: true, meat: 10 },
  deer: { id: 'deer', name: 'deer', glyph: 'D', fg: '#c09050', size: 1.2, speed: 4, dmg: 3, verb: 'kicks', dtype: 'blunt', skill: 1, meat: 6, where: 'surface' },
  groundhog: { id: 'groundhog', name: 'groundhog', glyph: 'g', fg: '#b08050', size: 0.2, speed: 6, dmg: 1, verb: 'bites', dtype: 'edge', skill: 0, meat: 1, where: 'surface' },
  boar: { id: 'boar', name: 'wild boar', glyph: 'B', fg: '#806040', size: 1.1, speed: 5, dmg: 5, verb: 'gores', dtype: 'pierce', skill: 2, meat: 6, where: 'surface' },
  wolf: { id: 'wolf', name: 'wolf', glyph: 'w', fg: '#a0a0a0', size: 0.8, speed: 4, dmg: 6, verb: 'bites', dtype: 'edge', skill: 3, predator: true, meat: 3, where: 'surface' },
  bear: { id: 'bear', name: 'grizzly bear', glyph: 'G', fg: '#906030', size: 2.2, speed: 5, dmg: 9, verb: 'mauls', dtype: 'edge', skill: 4, predator: true, meat: 9, where: 'surface' },
  elephant: { id: 'elephant', name: 'elephant', glyph: 'E', fg: '#b0b0b0', size: 6, speed: 6, dmg: 14, verb: 'tramples', dtype: 'blunt', skill: 3, meat: 30, where: 'surface' },
  carp: { id: 'carp', name: 'carp', glyph: 'α', fg: '#ffa040', size: 0.5, speed: 4, dmg: 7, verb: 'bites', dtype: 'edge', skill: 6, predator: true, water: true, meat: 2, where: 'river' },
  goblin: { id: 'goblin', name: 'goblin', glyph: 'g', fg: '#60e040', size: 0.9, speed: 6, dmg: 5, verb: 'strikes', dtype: 'blunt', skill: 3, hostile: true },
  kobold: { id: 'kobold', name: 'kobold thief', glyph: 'k', fg: '#e0a060', size: 0.4, speed: 4, dmg: 2, verb: 'stabs', dtype: 'pierce', skill: 1, hostile: true },
  troll: { id: 'troll', name: 'troll', glyph: 'T', fg: '#60a0a0', size: 4, speed: 7, dmg: 13, verb: 'smashes', dtype: 'blunt', skill: 3, hostile: true, where: 'cavern' },
  crundle: { id: 'crundle', name: 'crundle', glyph: 'c', fg: '#e06060', size: 0.3, speed: 5, dmg: 3, verb: 'kicks', dtype: 'blunt', skill: 1, hostile: true, meat: 1, where: 'cavern' },
  cave_croc: { id: 'cave_croc', name: 'cave crocodile', glyph: 'C', fg: '#60a060', size: 2.5, speed: 7, dmg: 11, verb: 'bites', dtype: 'edge', skill: 3, predator: true, meat: 10, where: 'cavern' },
  spider: { id: 'spider', name: 'giant cave spider', glyph: 'S', fg: '#c050c0', size: 3, speed: 4, dmg: 13, verb: 'bites', dtype: 'pierce', skill: 6, hostile: true, where: 'cavern', meat: 4 },
  beast: { id: 'beast', name: 'forgotten beast', glyph: 'Ω', fg: '#ff40ff', size: 10, speed: 6, dmg: 20, verb: 'rends', dtype: 'edge', skill: 8, hostile: true, armor: 3 },
  demon: { id: 'demon', name: 'demon', glyph: '&', fg: '#ff3020', size: 8, speed: 3, dmg: 24, verb: 'tears at', dtype: 'edge', skill: 10, hostile: true, armor: 4, flies: true },
  merchant: { id: 'merchant', name: 'merchant', glyph: '☺', fg: '#e0c040', size: 1, speed: 6, dmg: 4, verb: 'punches', dtype: 'blunt', skill: 2 },
  wagon: { id: 'wagon', name: 'wagon', glyph: 'W', fg: '#c09050', size: 5, speed: 8, dmg: 0, verb: 'bumps', dtype: 'blunt', skill: 0 },
};

export const PARTS = ['head', 'upper body', 'lower body', 'right arm', 'left arm', 'right leg', 'left leg'];
export const PART_W = [1, 4, 3, 2, 2, 2, 2]; // hit chance weights

// ---------------------------------------------------------------- buildings
export interface Ing {
  type: string | string[]; // item type(s)
  n: number;
  mat?: string; // exact material
  kind?: MatKind; // material kind
  sub?: string; // exact subtype (plant id...)
  tag?: 'brewable' | 'cookable' | 'butcherable' | 'emptybarrel' | 'cloth' | 'flux';
}
export interface BuildingDef {
  id: string;
  name: string;
  w: number;
  h: number;
  glyphs: string; // w*h characters
  fg: string;
  needs: Ing[];
  work: number;
  menu: 'structure' | 'furniture' | 'production' | 'machines';
  shop?: boolean;
  item?: string; // furniture is built from this prefab item
  blocks?: boolean; // impassable when built
  tile?: number; // constructions: resulting tile type
  desc: string;
  magma?: boolean; // needs magma nearby
}
const anyBuildMat: Ing = { type: ['boulder', 'block', 'log'], n: 1 };
const B = (d: BuildingDef) => d;
export const BUILDINGS: Record<string, BuildingDef> = {
  // constructions (become part of the map)
  wall: B({ id: 'wall', name: 'Wall', w: 1, h: 1, glyphs: '#', fg: '#aaa', needs: [anyBuildMat], work: 90, menu: 'structure', tile: T.Wall, desc: 'A solid wall. Keeps goblins and water out.' }),
  floor: B({ id: 'floor', name: 'Floor', w: 1, h: 1, glyphs: '+', fg: '#aaa', needs: [anyBuildMat], work: 50, menu: 'structure', tile: T.Floor, desc: 'A floor. Can bridge open space next to an existing floor.' }),
  stairs: B({ id: 'stairs', name: 'Stairs', w: 1, h: 1, glyphs: 'X', fg: '#aaa', needs: [anyBuildMat], work: 90, menu: 'structure', tile: T.Stair, desc: 'Up/down stairs. Connects to stairs directly above or below.' }),
  ramp: B({ id: 'ramp', name: 'Ramp', w: 1, h: 1, glyphs: '▲', fg: '#aaa', needs: [anyBuildMat], work: 70, menu: 'structure', tile: T.Ramp, desc: 'A ramp up to the level above (needs a wall next to it).' }),
  // furniture
  bed: B({ id: 'bed', name: 'Bed', w: 1, h: 1, glyphs: 'Θ', fg: '#c79a55', needs: [{ type: 'bed', n: 1 }], work: 30, menu: 'furniture', item: 'bed', desc: 'Dwarves sleep here. In a hospital zone it is a hospital bed.' }),
  table: B({ id: 'table', name: 'Table', w: 1, h: 1, glyphs: '╤', fg: '#ccc', needs: [{ type: 'table', n: 1 }], work: 30, menu: 'furniture', item: 'table', desc: 'Dwarves hate eating without a table.' }),
  chair: B({ id: 'chair', name: 'Chair / Throne', w: 1, h: 1, glyphs: '╥', fg: '#ccc', needs: [{ type: 'chair', n: 1 }], work: 30, menu: 'furniture', item: 'chair', desc: 'Place next to a table.' }),
  door: B({ id: 'door', name: 'Door', w: 1, h: 1, glyphs: '┼', fg: '#c79a55', needs: [{ type: 'door', n: 1 }], work: 30, menu: 'furniture', item: 'door', desc: 'Blocks fluids. Can be locked to block everything.' }),
  chest: B({ id: 'chest', name: 'Chest', w: 1, h: 1, glyphs: 'æ', fg: '#c79a55', needs: [{ type: 'chest', n: 1 }], work: 30, menu: 'furniture', item: 'chest', desc: 'Decorative storage. Makes a room nicer.' }),
  cabinet: B({ id: 'cabinet', name: 'Cabinet', w: 1, h: 1, glyphs: 'π', fg: '#c79a55', needs: [{ type: 'cabinet', n: 1 }], work: 30, menu: 'furniture', item: 'cabinet', desc: 'Decorative storage. Makes a room nicer.' }),
  coffin: B({ id: 'coffin', name: 'Coffin', w: 1, h: 1, glyphs: '0', fg: '#ccc', needs: [{ type: 'coffin', n: 1 }], work: 30, menu: 'furniture', item: 'coffin', desc: 'A final resting place. The unburied dead upset everyone.' }),
  statue: B({ id: 'statue', name: 'Statue', w: 1, h: 1, glyphs: 'Ω', fg: '#ccc', needs: [{ type: 'statue', n: 1 }], work: 30, menu: 'furniture', item: 'statue', blocks: true, desc: 'Dwarves admire statues. Blocks movement.' }),
  // workshops
  carpenter: B({ id: 'carpenter', name: "Carpenter's Workshop", w: 3, h: 3, glyphs: '"═╗ ☼║╚═ ', fg: '#c79a55', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Beds, barrels, doors, tables and other things of wood.' }),
  mason: B({ id: 'mason', name: "Mason's Workshop", w: 3, h: 3, glyphs: '•╔═ ☼║═╝•', fg: '#c8c8c8', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Stone furniture, blocks, coffins, statues.' }),
  craftsdwarf: B({ id: 'craftsdwarf', name: "Craftsdwarf's Workshop", w: 3, h: 3, glyphs: '♦ ╗ ☼ ╚ ♦', fg: '#e0c060', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Trade goods from stone, wood and bone.' }),
  mechanic: B({ id: 'mechanic', name: "Mechanic's Workshop", w: 3, h: 3, glyphs: '¤═ ║☼  ═¤', fg: '#c0c0d0', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Mechanisms for levers, bridges and floodgates.' }),
  still: B({ id: 'still', name: 'Still', w: 3, h: 3, glyphs: 'ö ö ☼ ╚═╝', fg: '#d0a040', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Brews plants into alcohol. The most important building in any fortress.' }),
  kitchen: B({ id: 'kitchen', name: 'Kitchen', w: 3, h: 3, glyphs: '%═╗ ☼ ╚ %', fg: '#f0c060', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Cooks meals from plants, meat and fish.' }),
  butcher: B({ id: 'butcher', name: "Butcher's Shop", w: 3, h: 3, glyphs: '% ~ ☼ ≈ %', fg: '#d06060', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Turns dead animals into meat, bones and hides.' }),
  tannery: B({ id: 'tannery', name: 'Tannery', w: 3, h: 3, glyphs: '≈ § ☼ § ≈', fg: '#b07040', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Tans raw hides into leather.' }),
  leatherworks: B({ id: 'leatherworks', name: 'Leather Works', w: 3, h: 3, glyphs: '§ [ ☼ [ §', fg: '#b07040', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Leather armor.' }),
  loom: B({ id: 'loom', name: 'Loom', w: 3, h: 3, glyphs: '║║║ ☼ §§§', fg: '#e0d8c0', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Weaves pig tails into cloth (for bandages and trade).' }),
  jeweler: B({ id: 'jeweler', name: "Jeweler's Workshop", w: 3, h: 3, glyphs: '☼ ♦ ☼ ♦ ☼', fg: '#60e0e0', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Cuts rough gems.' }),
  furnace: B({ id: 'furnace', name: 'Wood Furnace', w: 3, h: 3, glyphs: '▬╔╗ ☼║*╚╝', fg: '#e08040', needs: [{ type: ['boulder', 'block'], n: 1 }], work: 150, menu: 'production', shop: true, desc: 'Burns logs into charcoal (fuel).' }),
  smelter: B({ id: 'smelter', name: 'Smelter', w: 3, h: 3, glyphs: '*╔╗ ☼║≡╚╝', fg: '#e06030', needs: [{ type: ['boulder', 'block'], n: 1 }], work: 150, menu: 'production', shop: true, desc: 'Smelts ore into metal bars. Needs fuel.' }),
  forge: B({ id: 'forge', name: "Metalsmith's Forge", w: 3, h: 3, glyphs: '≡╔╗ ☼║/╚╝', fg: '#c0c0d0', needs: [{ type: ['boulder', 'block'], n: 1 }, { type: 'bar', n: 1 }], work: 200, menu: 'production', shop: true, desc: 'Forges weapons, armor and picks. Needs fuel and an anvil’s worth of metal.' }),
  magma_smelter: B({ id: 'magma_smelter', name: 'Magma Smelter', w: 3, h: 3, glyphs: '≈╔╗ ☼║≡╚╝', fg: '#ff5020', needs: [{ type: ['boulder', 'block'], n: 1 }], work: 150, menu: 'production', shop: true, magma: true, desc: 'A smelter powered by magma: no fuel needed. Must be built within 3 levels above magma.' }),
  magma_forge: B({ id: 'magma_forge', name: 'Magma Forge', w: 3, h: 3, glyphs: '≈╔╗ ☼║/╚╝', fg: '#ff5020', needs: [{ type: ['boulder', 'block'], n: 1 }, { type: 'bar', n: 1 }], work: 200, menu: 'production', shop: true, magma: true, desc: 'A forge powered by magma: no fuel needed. Must be built within 3 levels above magma.' }),
  depot: B({ id: 'depot', name: 'Trade Depot', w: 3, h: 3, glyphs: '╔═╗║☼║╚═╝', fg: '#e0c040', needs: [{ type: ['boulder', 'block', 'log'], n: 3 }], work: 250, menu: 'production', desc: 'Caravans come here to trade. Without one they leave.' }),
  // machines
  lever: B({ id: 'lever', name: 'Lever', w: 1, h: 1, glyphs: 'ò', fg: '#e0e0e0', needs: [{ type: 'mechanism', n: 1 }], work: 80, menu: 'machines', desc: 'Link it to floodgates, bridges and doors, then order it pulled.' }),
  floodgate: B({ id: 'floodgate', name: 'Floodgate', w: 1, h: 1, glyphs: 'X', fg: '#ccc', needs: [{ type: 'floodgate', n: 1 }, { type: 'mechanism', n: 1 }], work: 80, menu: 'machines', item: 'floodgate', blocks: true, desc: 'Blocks water and magma until opened by a lever.' }),
  bridge: B({ id: 'bridge', name: 'Drawbridge', w: 1, h: 1, glyphs: '═', fg: '#ccc', needs: [{ type: ['boulder', 'block', 'log'], n: 1 }, { type: 'mechanism', n: 1 }], work: 100, menu: 'machines', desc: 'Drag to size. A walkable deck over open space. A lever raises it: the deck is gone and anything on it falls. When it slams back down it obliterates whatever is standing underneath.' }),
  cagetrap: B({ id: 'cagetrap', name: 'Cage Trap', w: 1, h: 1, glyphs: '^', fg: '#e0e060', needs: [{ type: 'mechanism', n: 1 }, { type: 'cage', n: 1 }], work: 80, menu: 'machines', desc: 'Captures the first hostile to step on it. Any hostile. Yes, even that one.' }),
  stonetrap: B({ id: 'stonetrap', name: 'Stone-fall Trap', w: 1, h: 1, glyphs: '^', fg: '#c0c0c0', needs: [{ type: 'mechanism', n: 1 }, { type: 'boulder', n: 1 }], work: 80, menu: 'machines', desc: 'Drops a boulder on the first hostile to step on it. Single use.' }),
  well: B({ id: 'well', name: 'Well', w: 1, h: 1, glyphs: 'O', fg: '#80c0ff', needs: [{ type: ['block', 'boulder'], n: 2 }], work: 150, menu: 'furniture', desc: 'Safe drinking water for the wounded (and the desperate). Needs water somewhere below it.' }),
};

// ---------------------------------------------------------------- recipes
export interface Recipe {
  id: string;
  name: string;
  shop: string[];
  labor: Labor;
  work: number;
  in: Ing[];
  out: { type: string; n: number; mat?: string; sub?: string }[]; // mat default: material of first ingredient
  fuel?: boolean; // needs a fuel item unless the shop is magma powered
  special?: 'butcher' | 'brew' | 'cook' | 'smelt';
}
const R: Recipe[] = [];
const wood = (id: string, name: string, n = 1, work = 220) =>
  R.push({ id: 'c_' + id, name: name, shop: ['carpenter'], labor: 'carpenter', work, in: [{ type: 'log', n: 1 }], out: [{ type: id, n }] });
wood('bed', 'Make bed', 1, 300);
wood('barrel', 'Make barrel');
wood('door', 'Make wooden door');
wood('table', 'Make wooden table');
wood('chair', 'Make wooden chair');
wood('chest', 'Make wooden chest');
wood('cabinet', 'Make wooden cabinet');
wood('coffin', 'Make casket');
wood('splint', 'Make splint', 2, 120);
wood('crutch', 'Make crutch', 1, 120);
wood('shield', 'Make wooden shield');
wood('cage', 'Make wooden cage');
const stone = (id: string, name: string, n = 1, work = 240) =>
  R.push({ id: 'm_' + id, name: name, shop: ['mason'], labor: 'mason', work, in: [{ type: 'boulder', n: 1 }], out: [{ type: id, n }] });
stone('block', 'Cut stone blocks', 4, 150);
stone('table', 'Make stone table');
stone('chair', 'Make stone throne');
stone('door', 'Make stone door');
stone('chest', 'Make stone coffer');
stone('cabinet', 'Make stone cabinet');
stone('coffin', 'Make stone coffin');
stone('statue', 'Carve statue', 1, 400);
stone('floodgate', 'Make floodgate');
R.push(
  { id: 'mech', name: 'Make mechanism', shop: ['mechanic'], labor: 'craft', work: 300, in: [{ type: 'boulder', n: 1 }], out: [{ type: 'mechanism', n: 1 }] },
  { id: 'craft_stone', name: 'Make rock crafts', shop: ['craftsdwarf'], labor: 'craft', work: 240, in: [{ type: 'boulder', n: 1 }], out: [{ type: 'craft', n: 3 }] },
  { id: 'craft_wood', name: 'Make wooden crafts', shop: ['craftsdwarf'], labor: 'craft', work: 240, in: [{ type: 'log', n: 1 }], out: [{ type: 'craft', n: 3 }] },
  { id: 'craft_bone', name: 'Make bone crafts', shop: ['craftsdwarf'], labor: 'craft', work: 240, in: [{ type: 'bone', n: 1 }], out: [{ type: 'craft', n: 3, mat: 'bone' }] },
  { id: 'totem', name: 'Make totem', shop: ['craftsdwarf'], labor: 'craft', work: 200, in: [{ type: 'skull', n: 1 }], out: [{ type: 'totem', n: 1, mat: 'bone' }] },
  { id: 'brew', name: 'Brew drink', shop: ['still'], labor: 'brew', work: 260, in: [{ type: 'plant', n: 1, tag: 'brewable' }, { type: 'barrel', n: 1, tag: 'emptybarrel' }], out: [], special: 'brew' },
  { id: 'meal', name: 'Cook easy meal', shop: ['kitchen'], labor: 'cook', work: 220, in: [{ type: ['plant', 'meat', 'fish'], n: 2, tag: 'cookable' }], out: [], special: 'cook' },
  { id: 'feast', name: 'Cook lavish meal', shop: ['kitchen'], labor: 'cook', work: 360, in: [{ type: ['plant', 'meat', 'fish'], n: 4, tag: 'cookable' }], out: [], special: 'cook' },
  { id: 'butcher', name: 'Butcher an animal', shop: ['butcher'], labor: 'cook', work: 200, in: [{ type: 'corpse', n: 1, tag: 'butcherable' }], out: [], special: 'butcher' },
  { id: 'tan', name: 'Tan a hide', shop: ['tannery'], labor: 'craft', work: 200, in: [{ type: 'hide', n: 1 }], out: [{ type: 'leather', n: 1, mat: 'leather' }] },
  { id: 'l_mail', name: 'Make leather armor', shop: ['leatherworks'], labor: 'craft', work: 300, in: [{ type: 'leather', n: 1 }], out: [{ type: 'mail', n: 1, mat: 'leather' }] },
  { id: 'l_helm', name: 'Make leather cap', shop: ['leatherworks'], labor: 'craft', work: 240, in: [{ type: 'leather', n: 1 }], out: [{ type: 'helm', n: 1, mat: 'leather' }] },
  { id: 'l_greaves', name: 'Make leather leggings', shop: ['leatherworks'], labor: 'craft', work: 240, in: [{ type: 'leather', n: 1 }], out: [{ type: 'greaves', n: 1, mat: 'leather' }] },
  { id: 'weave', name: 'Weave cloth', shop: ['loom'], labor: 'craft', work: 240, in: [{ type: 'plant', n: 1, sub: 'pig_tail' }], out: [{ type: 'cloth', n: 2, mat: 'cloth' }] },
  { id: 'cutgem', name: 'Cut gem', shop: ['jeweler'], labor: 'craft', work: 260, in: [{ type: 'gem', n: 1 }], out: [{ type: 'cutgem', n: 1 }] },
  { id: 'charcoal', name: 'Make charcoal', shop: ['furnace'], labor: 'smith', work: 200, in: [{ type: 'log', n: 1 }], out: [{ type: 'fuel', n: 2, mat: 'charcoal' }] },
  { id: 'coke', name: 'Make coke from coal', shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 200, in: [{ type: 'ore', n: 1, mat: 'coal' }], out: [{ type: 'fuel', n: 4, mat: 'coke' }] },
  { id: 'steel', name: 'Make steel bars', shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 300, fuel: true, in: [{ type: 'bar', n: 1, mat: 'iron' }, { type: 'boulder', n: 1, tag: 'flux' }, { type: 'fuel', n: 1 }], out: [{ type: 'bar', n: 2, mat: 'steel' }] },
  { id: 'bronze', name: 'Make bronze bars', shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 260, fuel: true, in: [{ type: 'bar', n: 1, mat: 'copper' }, { type: 'bar', n: 1, mat: 'tin' }], out: [{ type: 'bar', n: 3, mat: 'bronze' }] },
);
for (const m of MATS.filter((m) => m.smelt)) {
  R.push({ id: 'smelt_' + m.id, name: `Smelt ${m.name} ore`, shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 260, fuel: true, in: [{ type: 'ore', n: 1, mat: m.id }], out: [{ type: 'bar', n: 2, mat: m.smelt }], special: 'smelt' });
}
export const FORGE_METALS = ['copper', 'bronze', 'iron', 'steel', 'silver', 'adamantine'];
const forgeItems: [string, string, number][] = [
  ['pick', 'pick', 1], ['axe', 'battle axe', 1], ['sword', 'short sword', 1], ['spear', 'spear', 1], ['hammer', 'war hammer', 1],
  ['shield', 'shield', 1], ['helm', 'helm', 1], ['mail', 'mail shirt', 2], ['greaves', 'greaves', 1],
];
for (const metal of FORGE_METALS) {
  for (const [id, name, bars] of forgeItems) {
    R.push({ id: `f_${metal}_${id}`, name: `Forge ${matOf(metal).name} ${name}`, shop: ['forge', 'magma_forge'], labor: 'smith', work: 320, fuel: true, in: [{ type: 'bar', n: bars, mat: metal }], out: [{ type: id, n: 1 }] });
  }
}
R.push({ id: 'f_goblet', name: 'Forge metal crafts', shop: ['forge', 'magma_forge'], labor: 'smith', work: 260, fuel: true, in: [{ type: 'bar', n: 1 }], out: [{ type: 'craft', n: 3 }] });
export const RECIPES: Record<string, Recipe> = {};
R.forEach((r) => (RECIPES[r.id] = r));
export const recipesFor = (shop: string) => R.filter((r) => r.shop.includes(shop));

// ---------------------------------------------------------------- names
export const FIRST_NAMES = ['Urist', 'Kadol', 'Thob', 'Zon', 'Likot', 'Ingish', 'Mosus', 'Datan', 'Tosid', 'Erush', 'Aban', 'Dodok', 'Nil', 'Sibrek', 'Morul', 'Catten', 'Bomrek', 'Stukos', 'Ast', 'Rith', 'Olin', 'Meng', 'Vabok', 'Kib', 'Ral', 'Udib', 'Edem', 'Fikod', 'Litast', 'Domas', 'Tun', 'Zuglar', 'Asmel', 'Onul', 'Tekkud', 'Cog', 'Feb', 'Lor', 'Iden', 'Kogan', 'Rigoth', 'Shem', 'Zas', 'Ustuth', 'Nish', 'Mebzuth', 'Vucar', 'Sodel', 'Athel', 'Kel', 'Tulon', 'Zefon', 'Lokum', 'Deler', 'Obok', 'Momuz', 'Reg', 'Id', 'Urvad', 'Solon', 'Monom', 'Ducim', 'Minkot', 'Logem', 'Besmar', 'Inod'];
export const SUR_A = ['Granite', 'Iron', 'Pick', 'Hammer', 'Anvil', 'Gold', 'Deep', 'Ale', 'Stone', 'Copper', 'Axe', 'Tomb', 'Lantern', 'Boulder', 'Ember', 'Coal', 'Silver', 'Bridge', 'Gear', 'Oaken', 'Lava', 'Mug', 'Cave', 'Rune'];
export const SUR_B = ['beard', 'fist', 'hall', 'delver', 'shield', 'braid', 'forge', 'brew', 'helm', 'guard', 'tongs', 'hand', 'heart', 'chisel', 'strike', 'vault', 'maw', 'brow', 'keeper', 'murdered'];
export const DWARF_WORDS: [string, string][] = [
  ['Kogan', 'Boat'], ['Usân', 'Murdered'], ['Lolor', 'Hame'], ['Zasit', 'Torch'], ['Mörul', 'Shadow'], ['Nil', 'Hammer'], ['Urdim', 'Tomb'], ['Etur', 'Ale'],
  ['Sarvesh', 'Treasure'], ['Gusil', 'Gold'], ['Rakust', 'Dagger'], ['Ducim', 'Bridge'], ['Nitig', 'Gears'], ['Lanzil', 'Fortress'], ['Okil', 'Bold'], ['Rimtar', 'Rim'],
  ['Besmar', 'Lance'], ['Ilral', 'Deep'], ['Kivish', 'Realm'], ['Astesh', 'Gate'], ['Erith', 'Purple'], ['Tathtat', 'Brew'], ['Zuden', 'Mug'], ['Morul', 'Beard'],
];
export const DWARF_COLORS = ['#ffffff', '#ffe080', '#80e0ff', '#ff9070', '#b0ff80', '#e0a0ff', '#ffb0d0', '#c0c0ff'];
