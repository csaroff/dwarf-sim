import { describe, expect, test } from 'vitest';
import { MAT, T, TICKS_DAY } from '../src/sim/defs';
import { computeAlerts } from '../src/sim/events';
import { Game } from '../src/sim/game';
import { DG, explainTask, placeBuilding, tryDesig } from '../src/sim/jobs';
import { explainUnit, fallDamage } from '../src/sim/life';
import { optionsAt, order, setDraft } from '../src/sim/orders';
import { step } from '../src/sim/sim';
import { WH } from '../src/sim/world';
import { cell, dwarf, flatGame, give, room, run } from './helpers';

const alertText = (g: Game) => computeAlerts(g).map((a) => `${a.text}: ${a.detail}`).join('\n');

describe('"this dwarf broke his leg. Why is he just chillin there?"', () => {
  test('the game says why he is down, why nobody is helping, and what fixes it', () => {
    const g = flatGame();
    // Urist is a miner; Doc has no labors at all yet. That is the classic silent DF failure.
    const urist = dwarf(g, 40, 40, ['mine']);
    const doc = dwarf(g, 44, 40, []);

    // Urist breaks a leg badly enough that he cannot walk.
    urist.wounds.push({ part: 5, sev: 2, bleed: 0, treated: false, heal: TICKS_DAY * 8, desc: 'broken' });
    run(g, 30);

    // 1. Selecting Urist explains the state in plain words...
    let e = explainUnit(g, urist);
    expect(e.status).toMatch(/cannot walk: broken right leg/i);
    // ...and why nobody is coming: the labor is not enabled on anyone.
    expect(e.lines.join(' ')).toMatch(/Nobody has the Doctor labor enabled/);
    // 2. The same thing surfaces as an alert without having to click him.
    expect(alertText(g)).toMatch(/is down.*Nobody has the Doctor labor/s);

    // The player enables Doctor on Doc. Now the blocker is different: there is no bed.
    doc.labors.doctor = 1;
    run(g, 30);
    e = explainUnit(g, urist);
    expect(e.lines.join(' ')).toMatch(/no free bed to carry them to: build a bed/);

    // 3. Right-clicking Urist with Doc selected lists the order, greyed out with the same reason.
    const opt = optionsAt(g, doc, g.cellOf(urist)).find((o) => o.label.startsWith('Rescue'))!;
    expect(opt.job).toBeUndefined();
    expect(opt.why).toMatch(/no free bed/);

    // The player builds a bed (materials on site so it completes quickly).
    doc.labors.build = 1;
    g.spawnItem('bed', MAT.oak, cell(46, 40));
    const bed = placeBuilding(g, 'bed', 48, 40, 20)!;
    run(g, 600, () => bed.built);
    expect(bed.built).toBe(true);

    // With a bed available Doc carries Urist to it and treats the leg, unprompted.
    run(g, 1500, () => urist.inBed === bed.id && urist.wounds.every((w) => w.treated));
    expect(urist.inBed).toBe(bed.id);
    expect(urist.wounds[0].treated).toBe(true);
    expect(explainUnit(g, urist).status).toMatch(/Resting/);

    // A treated break lets him hobble again; eventually it heals completely.
    run(g, TICKS_DAY * 9, () => urist.wounds.length === 0);
    expect(urist.wounds.length).toBe(0);
    expect(urist.downSince).toBe(0);
  });

  test('a fall down a channelled hole is what breaks legs', () => {
    const g = flatGame();
    const u = dwarf(g, 40, 40, []);
    fallDamage(g, u, 2);
    expect(u.wounds.length).toBe(1);
    expect(g.log.some((l) => /falls 2 levels/.test(l.text))).toBe(true);
  });
});

describe('right-click override (the RimWorld part)', () => {
  test('an order interrupts current work, and impossible orders explain themselves', () => {
    const g = flatGame();
    const miner = dwarf(g, 40, 40, ['mine']);
    const wall = cell(42, 40, 19);
    // a little pit so there is a rock face to mine: channel is not needed, carve a room by hand
    room(g, 38, 38, 41, 42, 19);
    g.w.setTile(cell(40, 40, 19), T.Stair);
    g.w.setTile(cell(40, 40, 20), T.Stair);
    g.designate(wall, DG.Dig);

    // No pick anywhere: the menu entry is disabled and says so.
    let opt = optionsAt(g, miner, wall).find((o) => o.label.startsWith('Prioritize: mine'))!;
    expect(opt.why).toMatch(/needs a pick: none in the fortress/);
    // ... and the designation itself can be asked "why is nobody doing this?"
    expect(explainTask(g, 'mine', (u) => tryDesig(g, u, wall), 'd' + wall)).toMatch(/needs a pick/);

    // A pick appears. Miner is sent off on an errand far away first.
    g.spawnItem('pick', MAT.copper, cell(39, 40));
    order(g, miner, optionsAt(g, miner, cell(60, 60)).find((o) => o.label === 'Go here')!);
    run(g, 20);
    expect(miner.job!.type).toBe('move');

    // The player right-clicks the wall: the errand is dropped, he fetches the pick, then digs.
    opt = optionsAt(g, miner, wall).find((o) => o.label.startsWith('Prioritize: mine'))!;
    expect(opt.why).toBeUndefined();
    order(g, miner, opt);
    expect(miner.job!.forced).toBe(true);
    run(g, 800, () => g.w.tile[wall] === T.Floor);
    expect(g.w.tile[wall]).toBe(T.Floor);
    expect(miner.equip.pick).toBeTruthy();
  });

  test('a dwarf without the labor can still be ordered to do the job directly', () => {
    const g = flatGame();
    const peasant = dwarf(g, 40, 40, []); // no labors: would never chop on his own
    give(g, peasant, 'axe', 'axe');
    const tree = cell(43, 40);
    g.w.setTile(tree, T.Tree, MAT.oak);
    g.w.plant[tree] = 3;
    g.designate(tree, DG.Chop);
    run(g, 100);
    expect(g.w.tile[tree]).toBe(T.Tree);
    expect(explainUnit(g, peasant).lines.join(' ')).toMatch(/No labors enabled/);

    order(g, peasant, optionsAt(g, peasant, tree).find((o) => /chop/.test(o.label))!);
    run(g, 600, () => g.w.tile[tree] !== T.Tree);
    expect(g.w.tile[tree]).toBe(T.Floor);
  });

  test('drafted dwarves stop working and go where they are told', () => {
    const g = flatGame();
    const u = dwarf(g, 40, 40, ['haul']);
    setDraft(g, u, true);
    order(g, u, optionsAt(g, u, cell(45, 45)).find((o) => o.label === 'Move here')!);
    run(g, 200, () => g.cellOf(u) === cell(45, 45));
    expect(g.cellOf(u)).toBe(cell(45, 45));
    // stays put instead of wandering back to work
    run(g, 200);
    expect(g.cellOf(u)).toBe(cell(45, 45));
  });
});

describe('dwarves need alcohol', () => {
  test('a dry fortress slows down, complains, and the alert says how to fix it', () => {
    const g = flatGame();
    const u = dwarf(g, 40, 40, []);
    g.spawnItem('meal', MAT.none, cell(41, 40), 20, { sub: 'stew' });
    // water to keep him alive: a puddle next door
    g.w.water[cell(40, 44)] = 3;

    run(g, TICKS_DAY * 6);
    expect(u.dead).toBe(false);
    // he had to drink water, and hates it
    expect(u.thoughts.some((t) => /water like an elf/.test(t.text))).toBe(true);
    expect(explainUnit(g, u).lines.join(' ')).toMatch(/days without alcohol/);
    expect(alertText(g)).toMatch(/No alcohol!.*Build a Still/s);

    // one barrel fixes everything
    g.spawnItem('drink', MAT.oak, cell(41, 41), 5, { sub: 'dwarven ale' });
    run(g, TICKS_DAY, () => u.sober < 100);
    expect(u.sober).toBeLessThan(TICKS_DAY);
  });

  test('plump helmets + a barrel + a still = booze', () => {
    const g = flatGame();
    const brewer = dwarf(g, 40, 40, ['brew', 'build']);
    g.spawnItem('log', MAT.oak, cell(41, 40), 1);
    g.spawnItem('plant', MAT.none, cell(41, 41), 2, { sub: 'plump_helmet' });
    const still = placeBuilding(g, 'still', 44, 39, 20)!;
    run(g, 1200, () => still.built);
    still.bills.push({ recipe: 'brew', mode: 'forever', n: 0, paused: false });

    // no barrel: the work order records why it is stuck
    run(g, 60);
    expect(still.bills[0].why).toMatch(/needs empty barrel: none in the fortress/);

    g.spawnItem('barrel', MAT.oak, cell(41, 42), 1);
    run(g, 1500, () => (g.stocks().drink || 0) > 0);
    expect(g.count((i) => i.type === 'drink')).toBe(5);
    // brewing gives the seeds back, so the farm can keep going
    expect(g.count((i) => i.type === 'seed')).toBe(1);
    void brewer;
  });
});

describe('z-levels and mining', () => {
  test('stairs connect levels; unreachable designations say why', () => {
    const g = flatGame();
    const miner = dwarf(g, 40, 40, ['mine']);
    give(g, miner, 'pick', 'pick');
    // a wall two levels down with no way to get there
    const deep = cell(41, 40, 18);
    g.designate(deep, DG.Dig);
    run(g, 60);
    expect(explainUnit(g, miner).lines.join(' ')).toMatch(/nowhere to stand next to it yet/);

    // stairs down make it reachable
    g.designate(cell(40, 40, 20), DG.Stair);
    g.designate(cell(40, 40, 19), DG.Stair);
    g.designate(cell(40, 40, 18), DG.Stair);
    run(g, 2000, () => g.w.tile[deep] === T.Floor);
    expect(g.w.tile[deep]).toBe(T.Floor);
    // granite was revealed as it was dug
    expect(g.w.revealed(deep + 1)).toBe(true);
  });

  test('channelling makes a hole with a ramp below', () => {
    const g = flatGame();
    const miner = dwarf(g, 40, 40, ['mine']);
    give(g, miner, 'pick', 'pick');
    const c = cell(42, 40);
    g.designate(c, DG.Channel);
    run(g, 600, () => g.w.tile[c] === T.Open);
    expect(g.w.tile[c]).toBe(T.Open);
    expect(g.w.tile[c - WH]).toBe(T.Ramp);
  });
});

describe('unrealistic but exploitable mechanics', () => {
  test('the dwarven atom smasher: a lowering drawbridge obliterates what is under it', () => {
    const g = flatGame();
    const puller = dwarf(g, 40, 40, ['haul']);
    // far enough from the lever that the goblin does not scare the lever-puller away
    const bridge = g.addBuilding('bridge', 60, 60, 20, 2, 1);
    const lever = g.addBuilding('lever', 42, 40, 20);
    bridge.built = lever.built = true;
    lever.links = [bridge.id];
    g.applyBlock(bridge);

    // first pull raises it
    lever.pull = true;
    run(g, 400, () => bridge.open === true);
    expect(bridge.open).toBe(true);

    // junk and a goblin stand where the bridge will land
    g.spawnItem('boulder', MAT.granite, cell(60, 60), 1);
    const gob = g.addUnit('goblin', cell(61, 60), 'enemy');
    gob.nextThink = 1e9; // keep him standing still for the demonstration
    lever.pull = true;
    run(g, 400, () => bridge.open === false);
    expect(g.itemsIn(cell(60, 60)).length).toBe(0);
    expect(g.units.has(gob.id)).toBe(false);
    expect(g.itemsIn(cell(61, 60)).length).toBe(0); // not even a corpse
    void puller;
  });

  test('water on magma makes obsidian', () => {
    const g = flatGame();
    room(g, 40, 40, 44, 40, 19);
    g.w.magma[cell(40, 40, 19)] = 7;
    g.w.water[cell(44, 40, 19)] = 7;
    g.w.wake(cell(40, 40, 19));
    g.w.wake(cell(44, 40, 19));
    for (let k = 0; k < 400; k++) step(g);
    let obsidian = 0;
    for (let x = 40; x <= 44; x++) if (g.w.tile[cell(x, 40, 19)] === T.Wall && g.w.mat[cell(x, 40, 19)] === MAT.obsidian) obsidian++;
    expect(obsidian).toBeGreaterThan(0);
  });

  test('cage traps catch anything hostile that walks over them', () => {
    const g = flatGame();
    const bait = dwarf(g, 50, 40, []);
    // a corridor: walls either side so the only way to the dwarf is over the trap
    for (let x = 30; x < 60; x++) for (const y of [39, 41]) g.w.setTile(cell(x, y), T.Wall, MAT.granite);
    const trap = g.addBuilding('cagetrap', 45, 40, 20);
    trap.built = true;
    const troll = g.addUnit('troll', cell(40, 40), 'enemy');
    run(g, 600, () => troll.state === 'caged');
    expect(troll.state).toBe('caged');
    expect(bait.dead).toBe(false);
  });
});

test('save and load round-trips a running fortress', () => {
  const g = flatGame();
  const u = dwarf(g, 40, 40, ['haul']);
  g.spawnItem('log', MAT.oak, cell(45, 45), 3);
  g.addZone('stockpile', [cell(50, 50), cell(51, 50)]);
  run(g, 50);
  const g2 = Game.deserialize(g.serialize());
  expect(g2.units.get(u.id)!.name).toBe(u.name);
  // both copies continue identically (the sim is deterministic)
  run(g, 300);
  run(g2, 300);
  expect(g2.serialize()).toBe(g.serialize());
  expect(g2.stored(Array.from(g2.items.values()).find((i) => i.type === 'log')!)).toBe(true);
});
