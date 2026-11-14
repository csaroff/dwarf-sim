// Fortress politics, kept simple: a mayor is elected once the fortress is big enough, wants decent
// quarters, and now and then mandates that something be made. Nobody has to be appointed to anything.
import { TICKS_DAY } from './defs';
import { Game } from './game';
import { roomQuality } from './jobs';
import type { Alert, Unit } from './types';

const first = (u: Unit) => u.name.split(' ')[0];
export const MAYOR_POP = 15;
/** what a mayor may demand: item type, what to call it, how many, and where it is made */
const MANDATES: [string, string, number, string][] = [
  ['craft', 'crafts', 6, "a Craftsdwarf's Workshop"],
  ['table', 'tables', 2, "a Mason's or Carpenter's Workshop"],
  ['chair', 'chairs or thrones', 2, "a Mason's or Carpenter's Workshop"],
  ['statue', 'statues', 1, "a Mason's Workshop"],
  ['door', 'doors', 2, "a Mason's or Carpenter's Workshop"],
  ['cabinet', 'cabinets', 2, "a Mason's or Carpenter's Workshop"],
  ['chest', 'chests or coffers', 2, "a Mason's or Carpenter's Workshop"],
  ['barrel', 'barrels', 3, "a Carpenter's Workshop (or large pots at a Kiln)"],
  ['meal', 'prepared meals', 10, 'a Kitchen'],
  ['bolt', 'bolts', 15, "a Carpenter's or Craftsdwarf's Workshop, or a Forge"],
];

export const mayorOf = (g: Game): Unit | undefined => {
  const u = g.units.get(g.ev.mayor || 0);
  return u && !u.dead ? u : undefined;
};
/** does the mayor's bedroom pass muster? '' if so, else what is wrong with it */
export function quartersProblem(g: Game, mayor: Unit): string {
  const bed = g.buildings.get(mayor.bed);
  if (!bed) return 'has no bed of their own yet';
  if (roomQuality(g, g.center(bed)) < 1) return 'the bedroom is too plain: smooth the walls, or put a chest, cabinet, door or statue within two tiles of the bed';
  return '';
}
export function issueMandate(g: Game, type?: string) {
  const mayor = mayorOf(g);
  if (!mayor) return;
  const [t, name, n, where] = type ? MANDATES.find((m) => m[0] === type)! : g.rng.pick(MANDATES);
  g.ev.mandate = { type: t, name, where, n, made: 0, until: g.tick + TICKS_DAY * 14 };
  g.say(`${mayor.name}, Mayor, has mandated the making of ${n} ${name}. (Due in 14 days; make them at ${where}.)`, 'event', g.cellOf(mayor));
}

export function tickCivics(g: Game) {
  const e = g.ev;
  const t = g.tick;
  const ds = g.dwarves();
  let mayor = mayorOf(g);
  if (!mayor) {
    if (e.mayor) {
      e.mayor = 0;
      e.mandate = null;
      g.say('The mayor is dead. The fortress will hold an election.', 'info');
    }
    if (ds.length < MAYOR_POP) return;
    // the best-liked dwarf wins: the happiest of those who are of sound mind
    const able = ds.filter((u) => !u.state && !u.downSince && !u.cursed);
    if (!able.length) return;
    mayor = able.reduce((a, b) => (b.mood > a.mood ? b : a));
    e.mayor = mayor.id;
    e.nextMandate = t + TICKS_DAY * 8;
    g.think(mayor, 'was elected mayor', 8, 12);
    g.say(`${mayor.name} has been elected mayor of ${g.fortName.split(',')[0]}. A mayor expects decent quarters, and will issue mandates.`, 'event', g.cellOf(mayor));
    return;
  }
  if (t % 600 === 0 && t - mayor.arrived > TICKS_DAY * 3) {
    if (quartersProblem(g, mayor)) g.think(mayor, 'has quarters unworthy of a mayor', -4, 2);
    else g.think(mayor, 'has quarters fit for a mayor', 3, 2);
  }
  const m = e.mandate;
  if (!m) {
    if (!e.nextMandate) e.nextMandate = t + TICKS_DAY * 8;
    if (t >= e.nextMandate) issueMandate(g);
    return;
  }
  if (m.made >= m.n) {
    g.say(`The mayor's mandate has been met: ${m.n} ${m.name}. ${first(mayor)} is pleased.`, 'good', g.cellOf(mayor));
    g.think(mayor, 'had a mandate fulfilled', 8, 8);
    for (const u of ds) if (u !== mayor) g.think(u, 'took pride in meeting the mayor\'s mandate', 1, 4);
  } else if (t > m.until) {
    g.say(`The mandate for ${m.n} ${m.name} was not met (${m.made} made). ${mayor.name} is furious.`, 'bad', g.cellOf(mayor));
    g.think(mayor, 'had a mandate ignored', -10, 8);
    // someone has to answer for it
    const others = ds.filter((u) => u !== mayor && !u.state && !u.downSince);
    if (others.length) {
      const scapegoat = g.rng.pick(others);
      g.think(scapegoat, 'was punished for the failed mandate', -6, 6);
      g.say(`${scapegoat.name} has been given the blame, and a beating.`, 'bad', g.cellOf(scapegoat));
      scapegoat.hp = Math.max(scapegoat.maxHp * 0.5, scapegoat.hp - 8);
    }
  } else return;
  e.mandate = null;
  e.nextMandate = t + TICKS_DAY * (18 + g.rng.int(14));
}

export function civicAlerts(g: Game, out: Alert[]) {
  const mayor = mayorOf(g);
  const m = g.ev.mandate;
  if (!mayor || !m) return;
  const left = (m.until - g.tick) / TICKS_DAY;
  out.push({
    id: 'mandate', sev: left < 3 ? 'bad' : 'warn', text: `Mandate: ${m.made}/${m.n} ${m.name}`, unit: mayor.id,
    detail: `Mayor ${mayor.name} demands ${m.n} ${m.name}, newly made, within ${left.toFixed(1)} days (${m.made} made so far). Queue them at ${m.where}. If it is not met the mayor will be furious and somebody will be punished for it.`,
  });
}
