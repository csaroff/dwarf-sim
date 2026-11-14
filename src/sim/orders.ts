// The RimWorld layer: select a dwarf, right-click something, get a list of things that dwarf can be
// ordered to do there. Options that are impossible are still listed, with the reason why.
import { BUILDINGS, CREATURES, ITEMS, RECIPES } from './defs';
import { Game } from './game';
import {
  DG_NAME, Try, assign, canWalk, endJob, isJob, tryBill, tryBuild, tryBury, tryDeconstruct, tryDesig, tryEquip, tryFeed, tryFish, tryHarvest, tryHaul, tryHunt, tryPlant,
  tryPull, tryRescue, trySlaughter, tryTend, tryTend2, tryTrain,
} from './jobs';
import { downReason } from './life';
import { accuse } from './night';
import type { Job, Option, Unit } from './types';
import { X, Y, Z } from './world';

const mkJob = (type: string, label: string, cell: number, extra: Partial<Job> = {}): Job => ({ type, label, step: 0, x: X(cell), y: Y(cell), z: Z(cell), t: 0, started: 0, ...extra });

/** Why this dwarf cannot take any orders right now ('' if they can). */
export function cannotOrder(g: Game, u: Unit): string {
  const n = u.name.split(' ')[0];
  if (u.dead) return `${n} is dead`;
  if (!u.isDwarf || u.faction !== 'fort') return 'Not one of your dwarves';
  if (u.carriedBy) return `${n} is being carried to bed`;
  if (u.downSince) return `${n} cannot do anything: ${downReason(u) || 'incapacitated'}`;
  if (u.state === 'tantrum') return `${n} is throwing a tantrum and will not listen`;
  if (u.state === 'berserk') return `${n} has gone berserk`;
  if (u.state === 'were') return `${n} is a were${u.cursed} until the moon sets`;
  if (u.state === 'melancholy') return `${n} is lost in melancholy and will not work`;
  if (u.state === 'mood') return `${n} is possessed by a strange mood and will not listen`;
  if (!canWalk(u)) return `${n} cannot move`;
  return '';
}

/** Everything the dwarf could be told to do at this cell. */
export function optionsAt(g: Game, u: Unit, cell: number): Option[] {
  const out: Option[] = [];
  const no = cannotOrder(g, u);
  const add = (label: string, t: Try) => out.push(!no && isJob(t) ? { label, job: t } : { label, why: no || (t as string) });
  const here = g.cellOf(u);

  // ---- creatures
  for (const o of g.unitsIn(cell)) {
    if (o === u) continue;
    const name = o.isDwarf ? o.name.split(' ')[0] : g.unitName(o);
    if (o.isDwarf && o.faction === 'fort' && o.state !== 'berserk') {
      if (o.downSince && !o.inBed) add(`Rescue ${name} (carry to bed)`, tryRescue(g, u, o));
      if (o.wounds.length) add(`Treat ${name}'s wounds`, tryTend(g, u, o));
      if (o.downSince || o.inBed) add(`Bring ${name} food or drink`, tryFeed(g, u, o));
      if (o.exposed) add(`Attack ${name} (vampire)`, g.w.canReach(here, cell, true) ? mkJob('attack', `Attacking ${name}`, cell, { u: o.id }) : 'no path to it');
      else if (g.ev.drained) out.push(no ? { label: `Accuse ${name} of being the vampire`, why: no } : { label: `Accuse ${name} of being the vampire`, act: 'accuse', arg: o.id });
      continue;
    }
    const reach: Try = g.w.canReach(here, cell, true) ? mkJob('attack', `Attacking ${name}`, cell, { u: o.id }) : 'no path to it';
    if (g.hostile(u, o)) add(`Attack ${name}`, CREATURES[o.kind].water ? 'it is in the water where no dwarf can follow' : reach);
    else if (o.faction === 'wild') add(`Hunt ${name}`, tryHunt(g, u, o));
    else if (o.faction === 'fort') {
      if (o.kind === 'dog') add(`Train ${name} for war`, tryTrain(g, u, o));
      if (CREATURES[o.kind].milk) add(`Milk ${name}`, tryTend2(g, u, o, 'milk'));
      if (CREATURES[o.kind].wool) add(`Shear ${name}`, tryTend2(g, u, o, 'shear'));
      add(`Slaughter ${name}`, trySlaughter(g, u, o));
    }
  }
  // ---- designation
  const d = g.w.desig[cell];
  if (d) add(`Prioritize: ${DG_NAME[d].toLowerCase()} here`, tryDesig(g, u, cell));
  // ---- building
  const b = g.buildingAt(cell);
  if (b) {
    const bn = BUILDINGS[b.type].name;
    if (!b.built) add(`Prioritize building ${bn}`, b.suspended ? 'Construction is suspended' : tryBuild(g, u, b));
    else {
      if (b.remove) add(`Prioritize removing ${bn}`, tryDeconstruct(g, u, b));
      if (b.type === 'lever') add('Pull the lever', tryPull(g, u, b));
      if (b.type === 'bed') add('Sleep here', g.w.canReach(here, cell, false) ? mkJob('sleep', 'Sleeping', cell, { b: b.id }) : 'no path to the bed');
      b.bills.forEach((bill, k) => add(`Prioritize: ${RECIPES[bill.recipe].name}`, bill.paused ? 'This work order is paused' : tryBill(g, u, b, k)));
      if (BUILDINGS[b.type].shop && !b.bills.length) out.push({ label: `Work at ${bn}`, why: 'No work orders: click the workshop and add one first' });
    }
  }
  // ---- zones
  const farm = g.zoneOfKind(cell, 'farm');
  if (farm) {
    if (g.crops.has(cell)) add('Harvest here', tryHarvest(g, u, cell));
    else add(`Plant ${farm.crop.replace('_', ' ')} here`, tryPlant(g, u, farm, cell));
  }
  const fishing = g.zoneOfKind(cell, 'fishing');
  if (fishing) add('Fish here', tryFish(g, u, fishing));
  // ---- items (at most a handful)
  for (const it of g.itemsIn(cell).slice(0, 4)) {
    const name = g.itemName(it, true);
    if (g.slotFor(it)) add(`Equip ${name}`, tryEquip(g, u, it));
    if (it.type === 'corpse' && it.dwarf) add(`Bury ${it.sub}`, tryBury(g, u, it));
    else if (!g.stored(it)) add(`Haul ${name} to a stockpile`, tryHaul(g, u, it));
    if (g.edible(it)) add(`Eat ${name}`, !g.itemFree(it, u) ? 'It is reserved or forbidden' : g.w.canReach(here, cell, true) ? mkJob('eat', `Eating ${name}`, cell, { item: it.id }) : 'no path to it');
    if (it.type === 'drink') add(`Drink ${it.sub}`, !g.itemFree(it, u) ? 'It is reserved or forbidden' : g.w.canReach(here, cell, true) ? mkJob('drink', `Drinking ${it.sub}`, cell, { item: it.id }) : 'no path to it');
    void ITEMS;
  }
  // ---- movement
  if (g.w.passable(cell)) {
    const ok = g.w.canReach(here, cell, false);
    add(u.drafted ? 'Move here' : 'Go here', ok ? mkJob('move', 'Moving', cell) : g.w.dangerous(cell) ? 'too dangerous: deep water or magma' : 'no path there');
  } else if (!out.length) out.push({ label: 'Go here', why: 'Nobody can stand there' });
  return out;
}

/** Carry out a context-menu choice. */
export function order(g: Game, u: Unit, opt: Option) {
  if (cannotOrder(g, u)) return;
  if (opt.act === 'accuse') {
    const target = g.units.get(opt.arg || 0);
    if (target) accuse(g, u, target);
    return;
  }
  if (!opt.job) return;
  if (opt.job.type === 'move' && u.drafted) u.moveOrder = opt.job.x + opt.job.y * 96 + opt.job.z * 96 * 96;
  assign(g, u, opt.job, true);
}

export function setDraft(g: Game, u: Unit, on: boolean) {
  if (!u.isDwarf || u.dead || u.drafted === on) return;
  if (on && cannotOrder(g, u)) return;
  u.drafted = on;
  u.moveOrder = -1;
  if (u.job && u.job.type !== 'rest') endJob(g, u, on ? 'drafted' : '');
}
