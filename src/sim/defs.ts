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
export type MatKind = 'soil' | 'stone' | 'ore' | 'gem' | 'wood' | 'metal' | 'organic' | 'glass' | 'ceramic' | 'special';
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
export const POWER = { windmill: 20, waterwheel: 40 };

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
  // (new materials are added at the end so that saved fortresses keep their meaning)
  // more stone
  { id: 'dolomite', name: 'dolomite', kind: 'stone', fg: '#e8e0d0', bg: '#5c5850', glyph: '░', hard: 1, value: 1, flux: true },
  { id: 'chalk', name: 'chalk', kind: 'stone', fg: '#f4f4ec', bg: '#66665e', glyph: '░', hard: 0.8, value: 1, flux: true },
  { id: 'shale', name: 'shale', kind: 'stone', fg: '#8a8478', bg: '#343028', glyph: '░', hard: 0.9, value: 1 },
  { id: 'slate', name: 'slate', kind: 'stone', fg: '#7c8490', bg: '#2a2e34', glyph: '▓', hard: 1.1, value: 1 },
  { id: 'diorite', name: 'diorite', kind: 'stone', fg: '#c4c4c0', bg: '#484846', glyph: '▓', hard: 1.2, value: 1 },
  { id: 'schist', name: 'schist', kind: 'stone', fg: '#a09a88', bg: '#3c3a30', glyph: '▓', hard: 1.1, value: 1 },
  { id: 'gneiss', name: 'gneiss', kind: 'stone', fg: '#b0a8a0', bg: '#423e3a', glyph: '▓', hard: 1.2, value: 1 },
  { id: 'quartzite', name: 'quartzite', kind: 'stone', fg: '#e8dcd0', bg: '#58504a', glyph: '▓', hard: 1.3, value: 1 },
  { id: 'andesite', name: 'andesite', kind: 'stone', fg: '#84848c', bg: '#2a2a30', glyph: '▓', hard: 1.3, value: 1 },
  { id: 'rhyolite', name: 'rhyolite', kind: 'stone', fg: '#b09890', bg: '#3c3230', glyph: '▓', hard: 1.3, value: 1 },
  // more ore
  { id: 'malachite', name: 'malachite', kind: 'ore', fg: '#40c080', bg: '#4a4544', glyph: '£', hard: 1.1, value: 2, smelt: 'copper' },
  { id: 'tetrahedrite', name: 'tetrahedrite', kind: 'ore', fg: '#909898', bg: '#4a4544', glyph: '£', hard: 1.1, value: 3, smelt: 'copper' },
  { id: 'magnetite', name: 'magnetite', kind: 'ore', fg: '#787880', bg: '#4a4544', glyph: '£', hard: 1.2, value: 8, smelt: 'iron' },
  { id: 'limonite', name: 'limonite', kind: 'ore', fg: '#c89040', bg: '#55534a', glyph: '£', hard: 1.1, value: 8, smelt: 'iron' },
  { id: 'galena', name: 'galena', kind: 'ore', fg: '#a0a0b0', bg: '#4a4544', glyph: '£', hard: 1.1, value: 5, smelt: 'lead' },
  { id: 'sphalerite', name: 'sphalerite', kind: 'ore', fg: '#c0b080', bg: '#4a4544', glyph: '£', hard: 1.1, value: 2, smelt: 'zinc' },
  { id: 'garnierite', name: 'garnierite', kind: 'ore', fg: '#70c070', bg: '#2e2e30', glyph: '£', hard: 1.1, value: 2, smelt: 'nickel' },
  { id: 'bismuthinite', name: 'bismuthinite', kind: 'ore', fg: '#d0b0d0', bg: '#4a4544', glyph: '£', hard: 1.1, value: 2, smelt: 'bismuth' },
  { id: 'native_platinum', name: 'native platinum', kind: 'ore', fg: '#f0f0f8', bg: '#2e2e30', glyph: '£', hard: 1.2, value: 40, smelt: 'platinum' },
  // more metal
  { id: 'lead', name: 'lead', kind: 'metal', fg: '#8088a0', bg: '#30343c', glyph: '≡', hard: 1, value: 2, weapon: 0.5, armor: 0.5 },
  { id: 'zinc', name: 'zinc', kind: 'metal', fg: '#c0c8c8', bg: '#484c4c', glyph: '≡', hard: 1, value: 2, weapon: 0.6, armor: 0.6 },
  { id: 'nickel', name: 'nickel', kind: 'metal', fg: '#c8c8b8', bg: '#4c4c44', glyph: '≡', hard: 1, value: 2, weapon: 0.7, armor: 0.7 },
  { id: 'bismuth', name: 'bismuth', kind: 'metal', fg: '#e0b0e0', bg: '#544054', glyph: '≡', hard: 1, value: 2, weapon: 0.4, armor: 0.4 },
  { id: 'platinum', name: 'platinum', kind: 'metal', fg: '#f4f4ff', bg: '#60606c', glyph: '≡', hard: 1, value: 40, weapon: 0.6, armor: 0.6 },
  { id: 'brass', name: 'brass', kind: 'metal', fg: '#e0c050', bg: '#5a4c1c', glyph: '≡', hard: 1, value: 7, weapon: 0.9, armor: 0.9 },
  { id: 'electrum', name: 'electrum', kind: 'metal', fg: '#f0e080', bg: '#605828', glyph: '≡', hard: 1, value: 20, weapon: 0.5, armor: 0.5 },
  { id: 'bismuth_bronze', name: 'bismuth bronze', kind: 'metal', fg: '#e0a878', bg: '#5a4030', glyph: '≡', hard: 1, value: 6, weapon: 1.15, armor: 1.15 },
  { id: 'rose_gold', name: 'rose gold', kind: 'metal', fg: '#ffb090', bg: '#664430', glyph: '≡', hard: 1, value: 23, weapon: 0.5, armor: 0.5 },
  { id: 'billon', name: 'billon', kind: 'metal', fg: '#d8c0b0', bg: '#564a44', glyph: '≡', hard: 1, value: 6, weapon: 0.7, armor: 0.7 },
  // more gems
  { id: 'opal', name: 'opal', kind: 'gem', fg: '#c0f0e0', bg: '#55534a', glyph: '☼', hard: 1.2, value: 20 },
  { id: 'jasper', name: 'jasper', kind: 'gem', fg: '#d05030', bg: '#55534a', glyph: '☼', hard: 1.2, value: 8 },
  { id: 'onyx', name: 'onyx', kind: 'gem', fg: '#808088', bg: '#55534a', glyph: '☼', hard: 1.2, value: 8 },
  { id: 'jade', name: 'jade', kind: 'gem', fg: '#60c090', bg: '#4a4544', glyph: '☼', hard: 1.3, value: 15 },
  { id: 'lapis_lazuli', name: 'lapis lazuli', kind: 'gem', fg: '#4060e0', bg: '#4a4544', glyph: '☼', hard: 1.3, value: 12 },
  { id: 'garnet', name: 'garnet', kind: 'gem', fg: '#c03048', bg: '#4a4544', glyph: '☼', hard: 1.4, value: 20 },
  { id: 'tourmaline', name: 'tourmaline', kind: 'gem', fg: '#e060b0', bg: '#4a4544', glyph: '☼', hard: 1.4, value: 25 },
  { id: 'aquamarine', name: 'aquamarine', kind: 'gem', fg: '#70e0e8', bg: '#4a4544', glyph: '☼', hard: 1.4, value: 30 },
  { id: 'topaz', name: 'topaz', kind: 'gem', fg: '#ffc840', bg: '#2e2e30', glyph: '☼', hard: 1.5, value: 35 },
  { id: 'sapphire', name: 'sapphire', kind: 'gem', fg: '#3070ff', bg: '#2e2e30', glyph: '☼', hard: 1.6, value: 45 },
  // more wood
  { id: 'birch', name: 'birch', kind: 'wood', fg: '#e8dcc0', bg: '#4a4430', glyph: '♣', hard: 1, value: 1 },
  { id: 'willow', name: 'willow', kind: 'wood', fg: '#b8a060', bg: '#4a3c18', glyph: '♣', hard: 1, value: 1 },
  { id: 'maple', name: 'maple', kind: 'wood', fg: '#d09050', bg: '#4a3018', glyph: '♣', hard: 1, value: 1 },
  { id: 'fungiwood', name: 'fungiwood', kind: 'wood', fg: '#d8c890', bg: '#4c4630', glyph: '♠', hard: 1, value: 1 },
  { id: 'nether_cap', name: 'nether-cap', kind: 'wood', fg: '#6080c0', bg: '#202c48', glyph: '♠', hard: 1, value: 2 },
  // made things
  { id: 'green_glass', name: 'green glass', kind: 'glass', fg: '#70d090', bg: '#1c3c28', glyph: '░', hard: 1, value: 2 },
  { id: 'earthenware', name: 'earthenware', kind: 'ceramic', fg: '#c07850', bg: '#4c2c1c', glyph: '░', hard: 1, value: 2 },
  { id: 'wool', name: 'wool', kind: 'organic', fg: '#f0ece0', bg: '#55534c', glyph: '§', hard: 1, value: 2 },
];
/** ordinary layer stone that veins and gem clusters can replace */
export const isLayerStone = (m: number) => MATS[m].kind === 'stone' && MATS[m].id !== 'obsidian';
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
  // (appended, like materials, to keep old saves valid)
  { id: 'birch', name: 'birch', kind: 'tree', glyph: '♣', fg: '#8ac860', wood: 'birch' },
  { id: 'willow', name: 'willow', kind: 'tree', glyph: '♣', fg: '#70b070', wood: 'willow' },
  { id: 'maple', name: 'maple', kind: 'tree', glyph: '♣', fg: '#d07030', wood: 'maple' },
  { id: 'fungiwood', name: 'fungiwood', kind: 'tree', glyph: '♠', fg: '#d8c890', wood: 'fungiwood', under: true },
  { id: 'nether_cap', name: 'nether-cap', kind: 'tree', glyph: '♠', fg: '#6080c0', wood: 'nether_cap', under: true },
  { id: 'fisher_berry', name: 'fisher berry', kind: 'shrub', glyph: '"', fg: '#5090ff', raw: true, cook: true, drink: 'fisher berry wine', grow: TICKS_DAY * 5 },
  { id: 'sun_berry', name: 'sun berry', kind: 'shrub', glyph: '"', fg: '#ffd030', raw: true, cook: true, drink: 'sunshine', grow: TICKS_DAY * 6 },
  { id: 'whip_vine', name: 'whip vine', kind: 'shrub', glyph: '"', fg: '#c0e060', cook: true, drink: 'whip wine', grow: TICKS_DAY * 5 },
  { id: 'quarry_bush', name: 'quarry bush', kind: 'crop', glyph: '♣', fg: '#c0c0d0', under: true, cook: true, grow: TICKS_DAY * 6 },
  { id: 'dimple_cup', name: 'dimple cup', kind: 'crop', glyph: '♠', fg: '#4080e0', under: true, cook: true, grow: TICKS_DAY * 5 },
  { id: 'rope_reed', name: 'rope reed', kind: 'crop', glyph: 'τ', fg: '#a0c070', cloth: true, grow: TICKS_DAY * 6 },
  { id: 'longland_grass', name: 'longland grass', kind: 'crop', glyph: '"', fg: '#d0d070', cook: true, drink: 'longland beer', grow: TICKS_DAY * 6 },
];
export const PLANT: Record<string, number> = {};
PLANTS.forEach((p, i) => (PLANT[p.id] = i));
export const plantOf = (id: string): PlantDef => PLANTS[PLANT[id] ?? 0];
export const CROPS = PLANTS.filter((p) => p.grow);

// ---------------------------------------------------------------- items
export type Cat =
  | 'stone' | 'ore' | 'wood' | 'bars' | 'gems' | 'food' | 'drink' | 'seeds' | 'furniture'
  | 'weapons' | 'armor' | 'clothing' | 'tools' | 'goods' | 'cloth' | 'refuse' | 'corpses';
export const CATS: Cat[] = ['stone', 'ore', 'wood', 'bars', 'gems', 'food', 'drink', 'seeds', 'furniture', 'weapons', 'armor', 'clothing', 'tools', 'goods', 'cloth', 'refuse', 'corpses'];

export interface ItemDef {
  id: string;
  name: string;
  cat: Cat;
  glyph: string;
  fg?: string; // default: material colour
  value: number;
  build?: string; // furniture: building type it installs as
  weapon?: { dmg: number; verb: string; type: 'edge' | 'blunt' | 'pierce'; ranged?: { range: number; ammo: string } };
  ammo?: boolean; // bolts: carried in the ammo slot
  tool?: 'pick' | 'axe';
  armor?: { slot: 'head' | 'body' | 'legs' | 'hands' | 'feet' | 'shield'; prot: number };
  clothes?: boolean;
  rots?: boolean;
}
const I = (d: ItemDef) => d;
export const ITEMS: Record<string, ItemDef> = {
  sand: I({ id: 'sand', name: 'sand', cat: 'stone', glyph: '░', value: 1 }),
  clay: I({ id: 'clay', name: 'clay', cat: 'stone', glyph: '▒', value: 1 }),
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
  egg: I({ id: 'egg', name: 'egg', cat: 'food', glyph: 'o', fg: '#f0e8d0', value: 2, rots: true }),
  milk: I({ id: 'milk', name: 'milk', cat: 'food', glyph: '~', fg: '#ffffff', value: 2 }),
  cheese: I({ id: 'cheese', name: 'cheese', cat: 'food', glyph: '%', fg: '#f0d060', value: 6 }),
  wool: I({ id: 'wool', name: 'wool', cat: 'cloth', glyph: '≈', fg: '#f0ece0', value: 3 }),
  flour: I({ id: 'flour', name: 'flour', cat: 'food', glyph: '░', fg: '#f0e8d0', value: 4 }),
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
  slab: I({ id: 'slab', name: 'memorial slab', cat: 'furniture', glyph: '▬', value: 15, build: 'slab' }),
  statue: I({ id: 'statue', name: 'statue', cat: 'furniture', glyph: 'Ω', value: 30, build: 'statue' }),
  floodgate: I({ id: 'floodgate', name: 'floodgate', cat: 'furniture', glyph: 'X', value: 15, build: 'floodgate' }),
  mechanism: I({ id: 'mechanism', name: 'mechanism', cat: 'tools', glyph: '¤', value: 15 }),
  cage: I({ id: 'cage', name: 'cage', cat: 'tools', glyph: '▓', value: 12 }),
  pick: I({ id: 'pick', name: 'pick', cat: 'tools', glyph: '/', value: 25, tool: 'pick', weapon: { dmg: 9, verb: 'strikes', type: 'pierce' } }),
  axe: I({ id: 'axe', name: 'battle axe', cat: 'weapons', glyph: '/', value: 30, tool: 'axe', weapon: { dmg: 12, verb: 'hacks', type: 'edge' } }),
  sword: I({ id: 'sword', name: 'short sword', cat: 'weapons', glyph: '/', value: 30, weapon: { dmg: 11, verb: 'slashes', type: 'edge' } }),
  spear: I({ id: 'spear', name: 'spear', cat: 'weapons', glyph: '/', value: 25, weapon: { dmg: 10, verb: 'stabs', type: 'pierce' } }),
  hammer: I({ id: 'hammer', name: 'war hammer', cat: 'weapons', glyph: '/', value: 30, weapon: { dmg: 10, verb: 'bashes', type: 'blunt' } }),
  mace: I({ id: 'mace', name: 'mace', cat: 'weapons', glyph: '/', value: 30, weapon: { dmg: 11, verb: 'bludgeons', type: 'blunt' } }),
  dagger: I({ id: 'dagger', name: 'dagger', cat: 'weapons', glyph: '/', value: 15, weapon: { dmg: 7, verb: 'stabs', type: 'pierce' } }),
  pike: I({ id: 'pike', name: 'pike', cat: 'weapons', glyph: '/', value: 35, weapon: { dmg: 13, verb: 'impales', type: 'pierce' } }),
  whip: I({ id: 'whip', name: 'whip', cat: 'weapons', glyph: '~', value: 25, weapon: { dmg: 9, verb: 'lashes', type: 'edge' } }),
  crossbow: I({ id: 'crossbow', name: 'crossbow', cat: 'weapons', glyph: '}', value: 30, weapon: { dmg: 10, verb: 'shoots', type: 'pierce', ranged: { range: 9, ammo: 'bolt' } } }),
  bolt: I({ id: 'bolt', name: 'bolts', cat: 'weapons', glyph: '↑', value: 1, ammo: true }),
  gauntlets: I({ id: 'gauntlets', name: 'gauntlets', cat: 'armor', glyph: '[', value: 20, armor: { slot: 'hands', prot: 3 } }),
  boots: I({ id: 'boots', name: 'boots', cat: 'armor', glyph: '[', value: 20, armor: { slot: 'feet', prot: 3 } }),
  breastplate: I({ id: 'breastplate', name: 'breastplate', cat: 'armor', glyph: '[', value: 60, armor: { slot: 'body', prot: 7 } }),
  clothes: I({ id: 'clothes', name: 'outfit', cat: 'clothing', glyph: '⌂', value: 8, clothes: true }),
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
  farm: 'Plant, harvest, gather wild plants, milk and shear livestock',
  brew: 'Brew drinks at the Still',
  cook: 'Cook meals, butcher animals',
  mason: 'Stone furniture, blocks, smoothing and engraving',
  carpenter: 'Wooden furniture, barrels',
  smith: 'Smelt ore, forge metal',
  craft: 'Crafts, gems, leather, cloth, mechanisms',
  hunt: 'Hunt marked animals, train war dogs',
  fish: 'Fish at fishing zones',
  haul: 'Carry things to stockpiles, pull levers, bury the dead',
};
export const SKILLS = [...LABORS.filter((l) => l !== 'haul'), 'fight', 'shoot'] as string[];
export const SKILL_LEVELS = ['Dabbling', 'Novice', 'Adequate', 'Competent', 'Skilled', 'Proficient', 'Talented', 'Adept', 'Expert', 'Professional', 'Accomplished', 'Great', 'Master', 'High Master', 'Grand Master', 'Legendary'];
export const PROFESSION: Record<string, string> = {
  doctor: 'Doctor', mine: 'Miner', chop: 'Woodcutter', build: 'Architect', farm: 'Farmer', brew: 'Brewer', cook: 'Cook',
  mason: 'Mason', carpenter: 'Carpenter', smith: 'Metalsmith', craft: 'Craftsdwarf', hunt: 'Hunter', fish: 'Fisherdwarf', fight: 'Axedwarf', shoot: 'Marksdwarf',
};

// ---------------------------------------------------------------- creatures
export type Shape = 'dwarf' | 'goblin' | 'were' | 'dog' | 'cat' | 'ox' | 'deer' | 'boar' | 'bear' | 'elephant' | 'fish' | 'spider' | 'critter' | 'bird' | 'fowl' | 'croc' | 'dragon' | 'blob' | 'wagon' | 'horse' | 'snake' | 'ghost';
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
  shape: Shape; // which sprite it is drawn with
  hostile?: boolean; // attacks fort units on sight
  predator?: boolean; // wild, but attacks when close
  meat?: number;
  water?: boolean; // lives in water
  tame?: boolean;
  where?: 'surface' | 'cavern' | 'river' | 'magma' | 'mega' | 'livestock';
  freq?: number; // how common among others found in the same place (default 1)
  danger?: number; // 0 harmless .. 3 terrifying: gates when it may appear
  armor?: number;
  flies?: boolean;
  thief?: boolean; // snatches an item and runs
  smasher?: boolean; // building destroyer: breaks down locked doors to get at you
  undead?: boolean; // feels no pain, never flees or bleeds out
  ranged?: { dmg: number; range: number; verb: string; type: 'pierce' | 'burn' | 'web' | 'dust' };
  venom?: boolean; // a wounding bite sickens the victim
  eggs?: boolean;
  milk?: boolean;
  wool?: boolean;
}
type CX = Partial<CreatureDef>;
const cr = (id: string, name: string, glyph: string, fg: string, shape: Shape, size: number, speed: number, dmg: number, verb: string, dtype: CreatureDef['dtype'], skill: number, x: CX = {}): CreatureDef =>
  ({ id, name, glyph, fg, shape, size, speed, dmg, verb, dtype, skill, ...x });
const CLIST: CreatureDef[] = [
  cr('dwarf', 'dwarf', '☺', '#fff', 'dwarf', 1, 6, 5, 'punches', 'blunt', 0),
  cr('merchant', 'merchant', '☺', '#e0c040', 'dwarf', 1, 6, 4, 'punches', 'blunt', 2),
  cr('wagon', 'wagon', 'W', '#c09050', 'wagon', 5, 8, 0, 'bumps', 'blunt', 0),
  // ---- livestock and pets
  cr('dog', 'dog', 'd', '#c09050', 'dog', 0.6, 4, 5, 'bites', 'edge', 3, { tame: true, meat: 3, where: 'livestock' }),
  cr('war_dog', 'war dog', 'd', '#e06040', 'dog', 0.9, 4, 9, 'bites', 'edge', 6, { tame: true, meat: 3, armor: 1 }),
  cr('cat', 'cat', 'c', '#e0e0e0', 'cat', 0.2, 4, 1, 'scratches', 'edge', 2, { tame: true, meat: 1, where: 'livestock' }),
  cr('yak', 'yak', 'Y', '#a08060', 'ox', 2.5, 8, 4, 'kicks', 'blunt', 1, { tame: true, meat: 10, where: 'livestock', milk: true, wool: true }),
  cr('cow', 'cow', 'C', '#e8e0d0', 'ox', 2.5, 8, 4, 'kicks', 'blunt', 1, { tame: true, meat: 12, where: 'livestock', milk: true }),
  cr('horse', 'horse', 'H', '#b08050', 'horse', 2.5, 3, 6, 'kicks', 'blunt', 2, { tame: true, meat: 10, where: 'livestock' }),
  cr('donkey', 'donkey', 'D', '#a0a0a0', 'horse', 1.8, 5, 5, 'kicks', 'blunt', 1, { tame: true, meat: 7, where: 'livestock' }),
  cr('sheep', 'sheep', 's', '#f0f0e8', 'boar', 0.8, 7, 2, 'butts', 'blunt', 0, { tame: true, meat: 5, where: 'livestock', wool: true, milk: true }),
  cr('goat', 'goat', 'g', '#d0c8b0', 'deer', 0.7, 6, 3, 'butts', 'blunt', 1, { tame: true, meat: 4, where: 'livestock', milk: true }),
  cr('pig', 'pig', 'p', '#f0a8a8', 'boar', 0.9, 7, 3, 'bites', 'edge', 0, { tame: true, meat: 7, where: 'livestock' }),
  cr('llama', 'llama', 'L', '#e8d8b8', 'horse', 1.5, 6, 3, 'spits at', 'blunt', 1, { tame: true, meat: 7, where: 'livestock', wool: true, milk: true }),
  cr('alpaca', 'alpaca', 'a', '#f0e8d8', 'horse', 1.0, 6, 2, 'kicks', 'blunt', 0, { tame: true, meat: 5, where: 'livestock', wool: true }),
  cr('chicken', 'chicken', 'h', '#f0e8c8', 'fowl', 0.08, 6, 1, 'pecks', 'pierce', 0, { tame: true, meat: 1, where: 'livestock', eggs: true }),
  cr('turkey', 'turkey', 't', '#a07050', 'fowl', 0.15, 6, 1, 'pecks', 'pierce', 0, { tame: true, meat: 2, where: 'livestock', eggs: true }),
  cr('duck', 'duck', 'u', '#60a060', 'fowl', 0.08, 6, 1, 'pecks', 'pierce', 0, { tame: true, meat: 1, where: 'livestock', eggs: true }),
  // ---- surface wildlife
  cr('deer', 'deer', 'D', '#c09050', 'deer', 1.2, 4, 3, 'kicks', 'blunt', 1, { meat: 6, where: 'surface', freq: 3 }),
  cr('elk', 'elk', 'E', '#a07848', 'deer', 2.2, 4, 5, 'gores', 'pierce', 2, { meat: 10, where: 'surface' }),
  cr('moose', 'moose', 'M', '#7a5a3a', 'deer', 3.2, 5, 8, 'tramples', 'blunt', 3, { meat: 14, where: 'surface', freq: 0.5 }),
  cr('groundhog', 'groundhog', 'g', '#b08050', 'critter', 0.2, 6, 1, 'bites', 'edge', 0, { meat: 1, where: 'surface', freq: 2 }),
  cr('rabbit', 'rabbit', 'r', '#d8c8b0', 'critter', 0.1, 3, 1, 'bites', 'edge', 0, { meat: 1, where: 'surface', freq: 2 }),
  cr('fox', 'fox', 'f', '#e07030', 'dog', 0.3, 4, 2, 'bites', 'edge', 1, { meat: 1, where: 'surface' }),
  cr('raccoon', 'raccoon', 'r', '#909090', 'critter', 0.25, 5, 2, 'bites', 'edge', 1, { meat: 1, where: 'surface', thief: true, freq: 0.6 }),
  cr('macaque', 'rhesus macaque', 'm', '#c0a070', 'critter', 0.25, 4, 2, 'bites', 'edge', 1, { meat: 1, where: 'surface', thief: true, freq: 0.6 }),
  cr('kea', 'kea', 'k', '#70b050', 'bird', 0.05, 3, 1, 'pecks', 'pierce', 1, { where: 'surface', thief: true, flies: true, freq: 0.6 }),
  cr('boar', 'wild boar', 'B', '#806040', 'boar', 1.1, 5, 5, 'gores', 'pierce', 2, { meat: 6, where: 'surface', freq: 1.5 }),
  cr('badger', 'badger', 'b', '#b0b0b0', 'critter', 0.3, 5, 4, 'claws', 'edge', 3, { meat: 1, where: 'surface', predator: true, danger: 1, freq: 0.7 }),
  cr('wolf', 'wolf', 'w', '#a0a0a0', 'dog', 0.8, 4, 6, 'bites', 'edge', 3, { predator: true, meat: 3, where: 'surface', danger: 1 }),
  cr('cougar', 'cougar', 'c', '#d0a060', 'cat', 1.0, 3, 7, 'claws', 'edge', 4, { predator: true, meat: 4, where: 'surface', danger: 1, freq: 0.6 }),
  cr('black_bear', 'black bear', 'B', '#404040', 'bear', 1.6, 5, 7, 'mauls', 'edge', 3, { predator: true, meat: 7, where: 'surface', danger: 1, freq: 0.7 }),
  cr('bear', 'grizzly bear', 'G', '#906030', 'bear', 2.2, 5, 9, 'mauls', 'edge', 4, { predator: true, meat: 9, where: 'surface', danger: 2, freq: 0.7 }),
  cr('elephant', 'elephant', 'E', '#b0b0b0', 'elephant', 6, 6, 14, 'tramples', 'blunt', 3, { meat: 30, where: 'surface', freq: 0.4 }),
  cr('giant_eagle', 'giant eagle', 'E', '#e0d0a0', 'bird', 1.5, 3, 9, 'claws', 'edge', 5, { predator: true, flies: true, meat: 4, where: 'surface', danger: 2, freq: 0.3 }),
  cr('unicorn', 'unicorn', 'U', '#ffffff', 'horse', 2.5, 3, 12, 'gores', 'pierce', 5, { meat: 10, where: 'surface', freq: 0.15 }),
  cr('carp', 'carp', 'α', '#ffa040', 'fish', 0.5, 4, 7, 'bites', 'edge', 6, { predator: true, water: true, meat: 2, where: 'river' }),
  cr('pike', 'longnose gar', 'α', '#80a080', 'fish', 0.7, 4, 8, 'bites', 'edge', 5, { predator: true, water: true, meat: 3, where: 'river', freq: 0.5 }),
  cr('alligator', 'alligator', 'A', '#508050', 'croc', 2.2, 6, 11, 'bites', 'edge', 4, { predator: true, water: true, meat: 9, where: 'river', freq: 0.3 }),
  // ---- invaders
  cr('goblin', 'goblin', 'g', '#60e040', 'goblin', 0.9, 6, 5, 'strikes', 'blunt', 3, { hostile: true }),
  cr('snatcher', 'goblin snatcher', 'g', '#a0e060', 'goblin', 0.8, 4, 3, 'strikes', 'blunt', 2, { hostile: true }),
  cr('kobold', 'kobold thief', 'k', '#e0a060', 'goblin', 0.4, 4, 2, 'stabs', 'pierce', 1, { hostile: true, thief: true }),
  cr('troll', 'troll', 'T', '#60a0a0', 'goblin', 4, 7, 13, 'smashes', 'blunt', 3, { smasher: true, hostile: true, where: 'cavern', danger: 3, freq: 0.4 }),
  cr('ogre', 'ogre', 'O', '#c0a060', 'goblin', 5, 7, 15, 'clubs', 'blunt', 3, { smasher: true, hostile: true }),
  // ---- cavern life
  cr('crundle', 'crundle', 'c', '#e06060', 'critter', 0.3, 5, 3, 'kicks', 'blunt', 1, { hostile: true, meat: 1, where: 'cavern', freq: 3, danger: 1 }),
  cr('giant_rat', 'giant rat', 'r', '#907060', 'critter', 0.4, 4, 3, 'bites', 'edge', 1, { meat: 1, where: 'cavern', freq: 2 }),
  cr('giant_bat', 'giant bat', 'b', '#806080', 'bird', 0.8, 3, 5, 'bites', 'edge', 3, { predator: true, flies: true, meat: 2, where: 'cavern', danger: 1 }),
  cr('bugbat', 'bugbat', 'b', '#a0c040', 'bird', 0.2, 3, 2, 'bites', 'edge', 1, { hostile: true, flies: true, where: 'cavern', danger: 1 }),
  cr('cave_floater', 'cave floater', 'f', '#c0e0e0', 'blob', 0.2, 8, 1, 'bumps', 'blunt', 0, { flies: true, where: 'cavern' }),
  cr('gorlak', 'gorlak', 'g', '#e0c080', 'blob', 0.6, 6, 2, 'bites', 'edge', 0, { where: 'cavern', meat: 2 }),
  cr('creeping_eye', 'creeping eye', 'e', '#e0e0ff', 'blob', 0.5, 8, 2, 'bumps', 'blunt', 0, { where: 'cavern', freq: 0.5 }),
  cr('elk_bird', 'elk bird', 'E', '#b0a080', 'fowl', 1.4, 5, 3, 'kicks', 'blunt', 1, { meat: 7, where: 'cavern', eggs: true }),
  cr('draltha', 'draltha', 'D', '#c0a0a0', 'ox', 3.5, 7, 8, 'tramples', 'blunt', 2, { meat: 16, where: 'cavern', freq: 0.7 }),
  cr('giant_earthworm', 'giant earthworm', 'w', '#e0a0a0', 'snake', 1.5, 9, 2, 'bites', 'edge', 0, { meat: 8, where: 'cavern' }),
  cr('plump_helmet_man', 'plump helmet man', 'p', '#c060e0', 'goblin', 0.5, 6, 3, 'punches', 'blunt', 1, { hostile: true, where: 'cavern', danger: 1, meat: 2 }),
  cr('troglodyte', 'troglodyte', 't', '#a09070', 'goblin', 0.8, 6, 5, 'bites', 'edge', 2, { hostile: true, where: 'cavern', danger: 1 }),
  cr('molemarian', 'molemarian', 'm', '#b08080', 'goblin', 0.9, 6, 6, 'claws', 'edge', 2, { hostile: true, where: 'cavern', danger: 2, freq: 0.7 }),
  cr('reacher', 'reacher', 'r', '#d0d0a0', 'goblin', 1.1, 5, 6, 'grabs', 'blunt', 3, { hostile: true, where: 'cavern', danger: 2, freq: 0.7 }),
  cr('helmet_snake', 'helmet snake', 's', '#60c080', 'snake', 0.5, 5, 6, 'bites', 'pierce', 3, { predator: true, where: 'cavern', danger: 1, meat: 2, venom: true }),
  cr('cave_toad', 'giant cave toad', 'T', '#70a050', 'blob', 1.8, 6, 7, 'bites', 'blunt', 2, { predator: true, where: 'cavern', danger: 2, meat: 6, freq: 0.7 }),
  cr('cave_croc', 'cave crocodile', 'C', '#60a060', 'croc', 2.5, 7, 11, 'bites', 'edge', 3, { predator: true, meat: 10, where: 'cavern', danger: 2 }),
  cr('cave_bear', 'blind cave bear', 'B', '#d0c0b0', 'bear', 2.4, 5, 10, 'mauls', 'edge', 4, { predator: true, meat: 9, where: 'cavern', danger: 2, freq: 0.6 }),
  cr('spider', 'giant cave spider', 'S', '#c050c0', 'spider', 3, 4, 13, 'bites', 'pierce', 6, { hostile: true, where: 'cavern', meat: 4, danger: 3, freq: 0.4, venom: true, ranged: { dmg: 0, range: 5, verb: 'shoots a web over', type: 'web' } }),
  cr('rutherer', 'rutherer', 'R', '#c08040', 'bear', 3, 5, 12, 'gores', 'pierce', 4, { hostile: true, where: 'cavern', danger: 3, freq: 0.4, meat: 9 }),
  cr('jabberer', 'jabberer', 'J', '#e0b040', 'fowl', 4, 4, 12, 'pecks', 'pierce', 4, { predator: true, where: 'cavern', danger: 3, freq: 0.4, meat: 14, eggs: true }),
  cr('crawler', 'voracious cave crawler', 'C', '#b06060', 'snake', 2.5, 5, 11, 'bites', 'edge', 4, { hostile: true, where: 'cavern', danger: 3, freq: 0.4 }),
  cr('cave_ogre', 'blind cave ogre', 'O', '#d0d0c0', 'goblin', 5, 6, 16, 'smashes', 'blunt', 4, { smasher: true, hostile: true, where: 'cavern', danger: 3, freq: 0.3 }),
  cr('cave_dragon', 'cave dragon', 'D', '#80a0c0', 'dragon', 8, 5, 18, 'bites', 'edge', 6, { smasher: true, hostile: true, where: 'cavern', danger: 4, freq: 0.1, armor: 2, meat: 30 }),
  cr('olm', 'giant olm', 'o', '#f0d0d0', 'fish', 0.8, 5, 5, 'bites', 'edge', 2, { predator: true, water: true, where: 'cavern', meat: 3 }),
  // ---- things that live in the heat
  cr('fire_imp', 'fire imp', 'i', '#ff8020', 'goblin', 0.4, 4, 4, 'claws', 'edge', 3, { hostile: true, where: 'magma', ranged: { dmg: 10, range: 6, verb: 'hurls a fireball at', type: 'burn' } }),
  cr('magma_crab', 'magma crab', 'c', '#ff5030', 'spider', 0.8, 6, 6, 'pinches', 'edge', 3, { hostile: true, where: 'magma', armor: 2, ranged: { dmg: 9, range: 5, verb: 'spits molten rock at', type: 'burn' } }),
  // ---- megabeasts
  cr('dragon', 'dragon', 'D', '#ff4020', 'dragon', 13, 5, 26, 'bites', 'edge', 9, { smasher: true, hostile: true, where: 'mega', armor: 4, meat: 60, ranged: { dmg: 22, range: 7, verb: 'breathes fire on', type: 'burn' } }),
  cr('hydra', 'hydra', 'H', '#40c060', 'dragon', 12, 6, 20, 'bites', 'edge', 8, { smasher: true, hostile: true, where: 'mega', armor: 2, meat: 50 }),
  cr('colossus', 'bronze colossus', 'C', '#d8a040', 'goblin', 14, 8, 28, 'crushes', 'blunt', 8, { smasher: true, hostile: true, where: 'mega', armor: 7 }),
  cr('roc', 'roc', 'R', '#e0c080', 'bird', 11, 3, 20, 'claws', 'edge', 7, { hostile: true, where: 'mega', flies: true, armor: 1, meat: 40 }),
  cr('giant', 'giant', 'G', '#e0b090', 'goblin', 9, 6, 20, 'stomps', 'blunt', 6, { smasher: true, hostile: true, where: 'mega', armor: 1 }),
  cr('cyclops', 'cyclops', 'C', '#c0a080', 'goblin', 8, 6, 18, 'clubs', 'blunt', 6, { smasher: true, hostile: true, where: 'mega', armor: 1 }),
  cr('ettin', 'ettin', 'E', '#b0a0a0', 'goblin', 8, 6, 17, 'clubs', 'blunt', 6, { smasher: true, hostile: true, where: 'mega', armor: 1 }),
  cr('minotaur', 'minotaur', 'M', '#a06040', 'were', 5, 5, 16, 'gores', 'pierce', 9, { smasher: true, hostile: true, where: 'mega', armor: 1 }),
  cr('beast', 'forgotten beast', 'Ω', '#ff40ff', 'blob', 10, 6, 20, 'rends', 'edge', 8, { smasher: true, hostile: true, armor: 3 }),
  cr('demon', 'demon', '&', '#ff3020', 'were', 8, 3, 24, 'tears at', 'edge', 10, { hostile: true, armor: 4, flies: true, ranged: { dmg: 14, range: 6, verb: 'hurls hellfire at', type: 'burn' } }),
  // ---- the night
  cr('werebeast', 'werebeast', 'W', '#c0a060', 'were', 1.8, 4, 9, 'bites', 'edge', 5, { hostile: true }),
  // a cursed dwarf under the moon: dangerous, but no match for the thing that bit it
  cr('weredwarf', 'were-dwarf', 'W', '#c0a060', 'were', 1, 5, 7, 'bites', 'edge', 3),
  cr('necromancer', 'necromancer', 'N', '#b060ff', 'dwarf', 1, 6, 4, 'strikes', 'blunt', 2, { hostile: true }),
  cr('zombie', 'zombie', 'Z', '#80a070', 'dwarf', 1.3, 10, 4, 'claws', 'blunt', 0, { hostile: true, undead: true }),
  cr('ghost', 'ghost', '☻', '#a0d0ff', 'ghost', 1, 7, 0, 'chills', 'blunt', 0, { flies: true }),
];
export const CREATURES: Record<string, CreatureDef> = {};
for (const c of CLIST) CREATURES[c.id] = c;
export const creaturesOf = (where: CreatureDef['where']) => CLIST.filter((c) => c.where === where);

export const PARTS = ['head', 'upper body', 'lower body', 'right arm', 'left arm', 'right leg', 'left leg'];
export const WERE_KINDS = ['wolf', 'bear', 'gecko', 'lizard', 'elk', 'warthog', 'tapir', 'skink', 'camel', 'jackal', 'mongoose', 'badger', 'hyena', 'panther', 'ram', 'buzzard'];
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
  machine?: boolean; // part of a power network
  power?: number; // machines: power produced (+) or needed to turn (-)
}
/** melee weapons that can be built into a weapon trap (picks are left for the miners) */
export const TRAP_WEAPONS = Object.values(ITEMS).filter((i) => i.weapon && !i.weapon.ranged && i.tool !== 'pick').map((i) => i.id);
const anyBuildMat: Ing = { type: ['boulder', 'block', 'log'], n: 1 };
const B = (d: BuildingDef) => d;
export const BUILDINGS: Record<string, BuildingDef> = {
  // constructions (become part of the map)
  wall: B({ id: 'wall', name: 'Wall', w: 1, h: 1, glyphs: '#', fg: '#aaa', needs: [anyBuildMat], work: 90, menu: 'structure', tile: T.Wall, desc: 'A solid wall. Keeps goblins and water out.' }),
  floor: B({ id: 'floor', name: 'Floor', w: 1, h: 1, glyphs: '+', fg: '#aaa', needs: [anyBuildMat], work: 50, menu: 'structure', tile: T.Floor, desc: 'A floor. Can bridge open space next to an existing floor.' }),
  stairs: B({ id: 'stairs', name: 'Stairs', w: 1, h: 1, glyphs: 'X', fg: '#aaa', needs: [anyBuildMat], work: 90, menu: 'structure', tile: T.Stair, desc: 'Up/down stairs. Connects to stairs directly above or below.' }),
  ramp: B({ id: 'ramp', name: 'Ramp', w: 1, h: 1, glyphs: '▲', fg: '#aaa', needs: [anyBuildMat], work: 70, menu: 'structure', tile: T.Ramp, desc: 'A ramp up to the level above (needs a wall next to it).' }),
  fortification: B({ id: 'fortification', name: 'Fortification', w: 1, h: 1, glyphs: '╬', fg: '#bbb', needs: [anyBuildMat], work: 90, menu: 'structure', blocks: true, desc: 'A wall with arrow slits. Nothing walks through it, but bolts fly through both ways: put marksdwarves behind a row of these. Drag to lay a line.' }),
  // furniture
  bed: B({ id: 'bed', name: 'Bed', w: 1, h: 1, glyphs: 'Θ', fg: '#c79a55', needs: [{ type: 'bed', n: 1 }], work: 30, menu: 'furniture', item: 'bed', desc: 'Dwarves sleep here. In a hospital zone it is a hospital bed.' }),
  table: B({ id: 'table', name: 'Table', w: 1, h: 1, glyphs: '╤', fg: '#ccc', needs: [{ type: 'table', n: 1 }], work: 30, menu: 'furniture', item: 'table', desc: 'Dwarves hate eating without a table.' }),
  chair: B({ id: 'chair', name: 'Chair / Throne', w: 1, h: 1, glyphs: '╥', fg: '#ccc', needs: [{ type: 'chair', n: 1 }], work: 30, menu: 'furniture', item: 'chair', desc: 'Place next to a table.' }),
  door: B({ id: 'door', name: 'Door', w: 1, h: 1, glyphs: '┼', fg: '#c79a55', needs: [{ type: 'door', n: 1 }], work: 30, menu: 'furniture', item: 'door', desc: 'Blocks fluids. Can be locked to block everything.' }),
  chest: B({ id: 'chest', name: 'Chest', w: 1, h: 1, glyphs: 'æ', fg: '#c79a55', needs: [{ type: 'chest', n: 1 }], work: 30, menu: 'furniture', item: 'chest', desc: 'Decorative storage. Makes a room nicer.' }),
  cabinet: B({ id: 'cabinet', name: 'Cabinet', w: 1, h: 1, glyphs: 'π', fg: '#c79a55', needs: [{ type: 'cabinet', n: 1 }], work: 30, menu: 'furniture', item: 'cabinet', desc: 'Decorative storage. Makes a room nicer.' }),
  coffin: B({ id: 'coffin', name: 'Coffin', w: 1, h: 1, glyphs: '0', fg: '#ccc', needs: [{ type: 'coffin', n: 1 }], work: 30, menu: 'furniture', item: 'coffin', desc: 'A final resting place. The unburied dead upset everyone.' }),
  slab: B({ id: 'slab', name: 'Memorial Slab', w: 1, h: 1, glyphs: '▬', fg: '#ccc', needs: [{ type: 'slab', n: 1 }], work: 30, menu: 'furniture', item: 'slab', desc: 'Lays to rest the ghost of a dwarf whose body can no longer be buried.' }),
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
  clothier: B({ id: 'clothier', name: "Clothier's Shop", w: 3, h: 3, glyphs: '§ ⌂ ☼ ⌂ §', fg: '#c0a0e0', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Sews clothes from cloth or leather. Clothes wear out, and nobody likes being naked.' }),
  jeweler: B({ id: 'jeweler', name: "Jeweler's Workshop", w: 3, h: 3, glyphs: '☼ ♦ ☼ ♦ ☼', fg: '#60e0e0', needs: [anyBuildMat], work: 150, menu: 'production', shop: true, desc: 'Cuts rough gems.' }),
  glassfurnace: B({ id: 'glassfurnace', name: 'Glass Furnace', w: 3, h: 3, glyphs: '░╔╗ ☼║░╚╝', fg: '#70d090', needs: [{ type: ['boulder', 'block'], n: 1 }], work: 150, menu: 'production', shop: true, desc: 'Melts sand into green glass: blocks, crafts, portals, tables, statues. Sand turns up when digging through sandy soil. Needs fuel.' }),
  kiln: B({ id: 'kiln', name: 'Kiln', w: 3, h: 3, glyphs: '▒╔╗ ☼║ö╚╝', fg: '#c07850', needs: [{ type: ['boulder', 'block'], n: 1 }], work: 150, menu: 'production', shop: true, desc: 'Fires clay into bricks, crafts, statues and large pots (which hold drink just as well as barrels do, and need no wood). Clay turns up when digging through clay soil. Needs fuel.' }),
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
  weapontrap: B({ id: 'weapontrap', name: 'Weapon Trap', w: 1, h: 1, glyphs: '^', fg: '#ff8060', needs: [{ type: 'mechanism', n: 1 }, { type: TRAP_WEAPONS, n: 1 }], work: 80, menu: 'machines', desc: 'Strikes every hostile that steps on it with the weapon built into it, again and again. A corridor of these is the classic answer to a siege. Needs a mechanism and any melee weapon.' }),
  cagetrap: B({ id: 'cagetrap', name: 'Cage Trap', w: 1, h: 1, glyphs: '^', fg: '#e0e060', needs: [{ type: 'mechanism', n: 1 }, { type: 'cage', n: 1 }], work: 80, menu: 'machines', desc: 'Captures the first hostile to step on it. Any hostile. Yes, even that one.' }),
  stonetrap: B({ id: 'stonetrap', name: 'Stone-fall Trap', w: 1, h: 1, glyphs: '^', fg: '#c0c0c0', needs: [{ type: 'mechanism', n: 1 }, { type: 'boulder', n: 1 }], work: 80, menu: 'machines', desc: 'Drops a boulder on the first hostile to step on it. Single use.' }),
  // ---- machinery: sources, shafts and things that need turning
  windmill: B({ id: 'windmill', name: 'Windmill', w: 3, h: 3, glyphs: '╲│╱─☼─╱│╲', fg: '#e0d8c0', needs: [{ type: 'log', n: 4 }], work: 200, menu: 'machines', machine: true, power: POWER.windmill, desc: `Makes ${POWER.windmill} power from the wind. Must stand outdoors under open sky. Anything touching it (axle, gear, pump, millstone) is driven by it.` }),
  waterwheel: B({ id: 'waterwheel', name: 'Water Wheel', w: 1, h: 1, glyphs: 'Φ', fg: '#80c0ff', needs: [{ type: 'log', n: 3 }], work: 160, menu: 'machines', machine: true, power: POWER.waterwheel, desc: `Makes ${POWER.waterwheel} power. Build it on the bank, right next to deep water (the river, or a channel fed from it).` }),
  axle: B({ id: 'axle', name: 'Axle', w: 1, h: 1, glyphs: '═', fg: '#c79a55', needs: [{ type: 'log', n: 1 }], work: 40, menu: 'machines', machine: true, power: -1, tile: undefined, desc: 'Carries power in a line from one machine to the next. Drag to lay a run. Can be walked over. Also connects to an axle or gear directly above or below.' }),
  gear: B({ id: 'gear', name: 'Gear Assembly', w: 1, h: 1, glyphs: '*', fg: '#c0c0d0', needs: [{ type: 'mechanism', n: 1 }], work: 60, menu: 'machines', machine: true, power: -2, desc: 'Joins machines in any direction, including straight up and down. Link a lever to it to disengage it: the cheapest on/off switch for a pump.' }),
  pump: B({ id: 'pump', name: 'Screw Pump', w: 1, h: 1, glyphs: '÷', fg: '#80c0ff', needs: [{ type: ['block', 'boulder', 'log'], n: 1 }, { type: 'mechanism', n: 1 }], work: 150, menu: 'machines', machine: true, power: -10, blocks: true, desc: 'Built over a hole (channel one). While powered it lifts water or magma from below and pours it out onto the floor beside it. Lifts magma to forges, floods rooms, drains pits.' }),
  millstone: B({ id: 'millstone', name: 'Millstone', w: 3, h: 3, glyphs: '░═░║☼║░═░', fg: '#d8d0c0', needs: [{ type: 'boulder', n: 1 }, { type: 'mechanism', n: 1 }], work: 150, menu: 'production', shop: true, machine: true, power: -10, desc: 'Grinds cave wheat into flour and sweet pods into sugar: four cookable portions from one plant. Only works while a windmill or water wheel is turning it.' }),
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
/** what can go into a cooked meal */
export const COOKABLE = ['plant', 'meat', 'fish', 'flour', 'egg', 'milk', 'cheese'];
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
wood('crossbow', 'Make wooden crossbow', 1, 260);
R.push({ id: 'c_bolt', name: 'Make wooden bolts', shop: ['carpenter', 'craftsdwarf'], labor: 'carpenter', work: 160, in: [{ type: 'log', n: 1 }], out: [{ type: 'bolt', n: 15 }] });
R.push({ id: 'bone_bolt', name: 'Make bone bolts', shop: ['craftsdwarf'], labor: 'craft', work: 160, in: [{ type: 'bone', n: 1 }], out: [{ type: 'bolt', n: 10, mat: 'bone' }] });
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
stone('slab', 'Engrave memorial slab', 1, 300);
stone('floodgate', 'Make floodgate');
R.push(
  { id: 'mech', name: 'Make mechanism', shop: ['mechanic'], labor: 'craft', work: 300, in: [{ type: 'boulder', n: 1 }], out: [{ type: 'mechanism', n: 1 }] },
  { id: 'craft_stone', name: 'Make rock crafts', shop: ['craftsdwarf'], labor: 'craft', work: 240, in: [{ type: 'boulder', n: 1 }], out: [{ type: 'craft', n: 3 }] },
  { id: 'craft_wood', name: 'Make wooden crafts', shop: ['craftsdwarf'], labor: 'craft', work: 240, in: [{ type: 'log', n: 1 }], out: [{ type: 'craft', n: 3 }] },
  { id: 'craft_bone', name: 'Make bone crafts', shop: ['craftsdwarf'], labor: 'craft', work: 240, in: [{ type: 'bone', n: 1 }], out: [{ type: 'craft', n: 3, mat: 'bone' }] },
  { id: 'totem', name: 'Make totem', shop: ['craftsdwarf'], labor: 'craft', work: 200, in: [{ type: 'skull', n: 1 }], out: [{ type: 'totem', n: 1, mat: 'bone' }] },
  { id: 'brew', name: 'Brew drink', shop: ['still'], labor: 'brew', work: 260, in: [{ type: 'plant', n: 1, tag: 'brewable' }, { type: 'barrel', n: 1, tag: 'emptybarrel' }], out: [], special: 'brew' },
  { id: 'meal', name: 'Cook easy meal', shop: ['kitchen'], labor: 'cook', work: 220, in: [{ type: COOKABLE, n: 2, tag: 'cookable' }], out: [], special: 'cook' },
  { id: 'feast', name: 'Cook lavish meal', shop: ['kitchen'], labor: 'cook', work: 360, in: [{ type: COOKABLE, n: 4, tag: 'cookable' }], out: [], special: 'cook' },
  { id: 'cheese', name: 'Make cheese', shop: ['kitchen'], labor: 'cook', work: 200, in: [{ type: 'milk', n: 1 }], out: [{ type: 'cheese', n: 2, mat: 'none' }] },
  { id: 'weave_wool', name: 'Weave wool cloth', shop: ['loom'], labor: 'craft', work: 240, in: [{ type: 'wool', n: 1 }], out: [{ type: 'cloth', n: 2, mat: 'wool' }] },
  { id: 'mill_wheat', name: 'Mill cave wheat into flour', shop: ['millstone'], labor: 'cook', work: 160, in: [{ type: 'plant', n: 1, sub: 'cave_wheat' }], out: [{ type: 'flour', n: 4, mat: 'none', sub: 'dwarven wheat flour' }, { type: 'seed', n: 1, mat: 'none', sub: 'cave_wheat' }] },
  { id: 'mill_sugar', name: 'Mill sweet pods into sugar', shop: ['millstone'], labor: 'cook', work: 160, in: [{ type: 'plant', n: 1, sub: 'sweet_pod' }], out: [{ type: 'flour', n: 4, mat: 'none', sub: 'dwarven sugar' }, { type: 'seed', n: 1, mat: 'none', sub: 'sweet_pod' }] },
  { id: 'butcher', name: 'Butcher an animal', shop: ['butcher'], labor: 'cook', work: 200, in: [{ type: 'corpse', n: 1, tag: 'butcherable' }], out: [], special: 'butcher' },
  { id: 'tan', name: 'Tan a hide', shop: ['tannery'], labor: 'craft', work: 200, in: [{ type: 'hide', n: 1 }], out: [{ type: 'leather', n: 1, mat: 'leather' }] },
  { id: 'l_mail', name: 'Make leather armor', shop: ['leatherworks'], labor: 'craft', work: 300, in: [{ type: 'leather', n: 1 }], out: [{ type: 'mail', n: 1, mat: 'leather' }] },
  { id: 'l_helm', name: 'Make leather cap', shop: ['leatherworks'], labor: 'craft', work: 240, in: [{ type: 'leather', n: 1 }], out: [{ type: 'helm', n: 1, mat: 'leather' }] },
  { id: 'l_boots', name: 'Make leather boots', shop: ['leatherworks'], labor: 'craft', work: 200, in: [{ type: 'leather', n: 1 }], out: [{ type: 'boots', n: 1, mat: 'leather' }] },
  { id: 'l_gloves', name: 'Make leather gloves', shop: ['leatherworks'], labor: 'craft', work: 200, in: [{ type: 'leather', n: 1 }], out: [{ type: 'gauntlets', n: 1, mat: 'leather' }] },
  { id: 'l_shield', name: 'Make leather shield', shop: ['leatherworks'], labor: 'craft', work: 240, in: [{ type: 'leather', n: 1 }], out: [{ type: 'shield', n: 1, mat: 'leather' }] },
  { id: 'l_clothes', name: 'Sew leather clothes', shop: ['leatherworks', 'clothier'], labor: 'craft', work: 240, in: [{ type: 'leather', n: 1 }], out: [{ type: 'clothes', n: 1, mat: 'leather' }] },
  { id: 'clothes', name: 'Sew cloth clothes', shop: ['clothier'], labor: 'craft', work: 220, in: [{ type: 'cloth', n: 1 }], out: [{ type: 'clothes', n: 1 }] },
  { id: 'l_greaves', name: 'Make leather leggings', shop: ['leatherworks'], labor: 'craft', work: 240, in: [{ type: 'leather', n: 1 }], out: [{ type: 'greaves', n: 1, mat: 'leather' }] },
  { id: 'weave', name: 'Weave cloth', shop: ['loom'], labor: 'craft', work: 240, in: [{ type: 'plant', n: 1, sub: 'pig_tail' }], out: [{ type: 'cloth', n: 2, mat: 'cloth' }] },
  { id: 'cutgem', name: 'Cut gem', shop: ['jeweler'], labor: 'craft', work: 260, in: [{ type: 'gem', n: 1 }], out: [{ type: 'cutgem', n: 1 }] },
  { id: 'charcoal', name: 'Make charcoal', shop: ['furnace'], labor: 'smith', work: 200, in: [{ type: 'log', n: 1 }], out: [{ type: 'fuel', n: 2, mat: 'charcoal' }] },
  { id: 'coke', name: 'Make coke from coal', shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 200, in: [{ type: 'ore', n: 1, mat: 'coal' }], out: [{ type: 'fuel', n: 4, mat: 'coke' }] },
  { id: 'steel', name: 'Make steel bars', shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 300, fuel: true, in: [{ type: 'bar', n: 1, mat: 'iron' }, { type: 'boulder', n: 1, tag: 'flux' }, { type: 'fuel', n: 1 }], out: [{ type: 'bar', n: 2, mat: 'steel' }] },
  { id: 'brass', name: 'Make brass bars', shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 260, fuel: true, in: [{ type: 'bar', n: 1, mat: 'copper' }, { type: 'bar', n: 1, mat: 'zinc' }], out: [{ type: 'bar', n: 2, mat: 'brass' }] },
  { id: 'electrum', name: 'Make electrum bars', shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 260, fuel: true, in: [{ type: 'bar', n: 1, mat: 'gold' }, { type: 'bar', n: 1, mat: 'silver' }], out: [{ type: 'bar', n: 2, mat: 'electrum' }] },
  { id: 'bismuth_bronze', name: 'Make bismuth bronze bars', shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 260, fuel: true, in: [{ type: 'bar', n: 1, mat: 'bronze' }, { type: 'bar', n: 1, mat: 'bismuth' }], out: [{ type: 'bar', n: 2, mat: 'bismuth_bronze' }] },
  { id: 'rose_gold', name: 'Make rose gold bars', shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 260, fuel: true, in: [{ type: 'bar', n: 1, mat: 'gold' }, { type: 'bar', n: 1, mat: 'copper' }], out: [{ type: 'bar', n: 2, mat: 'rose_gold' }] },
  { id: 'billon', name: 'Make billon bars', shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 260, fuel: true, in: [{ type: 'bar', n: 1, mat: 'silver' }, { type: 'bar', n: 1, mat: 'copper' }], out: [{ type: 'bar', n: 2, mat: 'billon' }] },
  { id: 'weave_reed', name: 'Weave rope reed cloth', shop: ['loom'], labor: 'craft', work: 240, in: [{ type: 'plant', n: 1, sub: 'rope_reed' }], out: [{ type: 'cloth', n: 2, mat: 'cloth' }, { type: 'seed', n: 1, mat: 'none', sub: 'rope_reed' }] },
  { id: 'glass_block', name: 'Make green glass blocks', shop: ['glassfurnace'], labor: 'craft', work: 240, fuel: true, in: [{ type: 'sand', n: 1 }], out: [{ type: 'block', n: 4, mat: 'green_glass' }] },
  { id: 'glass_craft', name: 'Make green glass crafts', shop: ['glassfurnace'], labor: 'craft', work: 260, fuel: true, in: [{ type: 'sand', n: 1 }], out: [{ type: 'craft', n: 3, mat: 'green_glass' }] },
  { id: 'glass_door', name: 'Make green glass portal', shop: ['glassfurnace'], labor: 'craft', work: 280, fuel: true, in: [{ type: 'sand', n: 1 }], out: [{ type: 'door', n: 1, mat: 'green_glass' }] },
  { id: 'glass_table', name: 'Make green glass table', shop: ['glassfurnace'], labor: 'craft', work: 280, fuel: true, in: [{ type: 'sand', n: 1 }], out: [{ type: 'table', n: 1, mat: 'green_glass' }] },
  { id: 'glass_statue', name: 'Make green glass statue', shop: ['glassfurnace'], labor: 'craft', work: 400, fuel: true, in: [{ type: 'sand', n: 1 }], out: [{ type: 'statue', n: 1, mat: 'green_glass' }] },
  { id: 'kiln_pot', name: 'Make large pot', shop: ['kiln'], labor: 'craft', work: 240, fuel: true, in: [{ type: 'clay', n: 1 }], out: [{ type: 'barrel', n: 1, mat: 'earthenware' }] },
  { id: 'kiln_craft', name: 'Make earthenware crafts', shop: ['kiln'], labor: 'craft', work: 240, fuel: true, in: [{ type: 'clay', n: 1 }], out: [{ type: 'craft', n: 3, mat: 'earthenware' }] },
  { id: 'kiln_block', name: 'Make bricks', shop: ['kiln'], labor: 'craft', work: 200, fuel: true, in: [{ type: 'clay', n: 1 }], out: [{ type: 'block', n: 4, mat: 'earthenware' }] },
  { id: 'kiln_statue', name: 'Make earthenware statue', shop: ['kiln'], labor: 'craft', work: 360, fuel: true, in: [{ type: 'clay', n: 1 }], out: [{ type: 'statue', n: 1, mat: 'earthenware' }] },
  { id: 'bronze', name: 'Make bronze bars', shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 260, fuel: true, in: [{ type: 'bar', n: 1, mat: 'copper' }, { type: 'bar', n: 1, mat: 'tin' }], out: [{ type: 'bar', n: 3, mat: 'bronze' }] },
);
for (const m of MATS.filter((m) => m.smelt)) {
  R.push({ id: 'smelt_' + m.id, name: `Smelt ${m.name} ore`, shop: ['smelter', 'magma_smelter'], labor: 'smith', work: 260, fuel: true, in: [{ type: 'ore', n: 1, mat: m.id }], out: [{ type: 'bar', n: 2, mat: m.smelt }], special: 'smelt' });
}
export const FORGE_METALS = ['copper', 'bronze', 'bismuth_bronze', 'iron', 'steel', 'silver', 'adamantine'];
const forgeItems: [string, string, number, number?][] = [
  ['pick', 'pick', 1], ['axe', 'battle axe', 1], ['sword', 'short sword', 1], ['spear', 'spear', 1], ['hammer', 'war hammer', 1],
  ['mace', 'mace', 1], ['dagger', 'dagger', 1], ['pike', 'pike', 2], ['crossbow', 'crossbow', 1], ['bolt', 'bolts', 1, 20],
  ['shield', 'shield', 1], ['helm', 'helm', 1], ['mail', 'mail shirt', 2], ['breastplate', 'breastplate', 3], ['greaves', 'greaves', 1],
  ['gauntlets', 'gauntlets', 1], ['boots', 'boots', 1],
];
for (const metal of FORGE_METALS) {
  for (const [id, name, bars, n] of forgeItems) {
    R.push({ id: `f_${metal}_${id}`, name: `Forge ${matOf(metal).name} ${name}`, shop: ['forge', 'magma_forge'], labor: 'smith', work: 320, fuel: true, in: [{ type: 'bar', n: bars, mat: metal }], out: [{ type: id, n: n || 1 }] });
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
export const GODS = ['Armok, god of blood', 'Zon the Anvil, god of metal', 'Ber the Deep, goddess of caverns', 'Okil of the Brew, god of ale', 'Likot Goldvein, goddess of wealth', 'Thob the Silent, god of death'];
export const DWARF_COLORS = ['#ffffff', '#ffe080', '#80e0ff', '#ff9070', '#b0ff80', '#e0a0ff', '#ffb0d0', '#c0c0ff'];
