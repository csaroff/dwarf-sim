import { describe, expect, test } from 'vitest';
import { MAT, PLANT, T, TICKS_DAY } from '../src/sim/defs';
import { beginMood, computeAlerts } from '../src/sim/events';
import { Game, MOON_DAYS } from '../src/sim/game';
import { issueMandate } from '../src/sim/civics';
import { megabeast, necroSiege, werebeast } from '../src/sim/night';
import { DG, canPlace, explainTask, placeBuilding, toggleLever, tryDesig } from '../src/sim/jobs';
import { TERRITORY, explainUnit, fallDamage, killUnit, lineOfSight } from '../src/sim/life';
import { optionsAt, order, setDraft } from '../src/sim/orders';
import { step } from '../src/sim/sim';
import { WH, dist } from '../src/sim/world';
import { built, cell, dwarf, flatGame, give, room, run } from './helpers';

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

  test('a stairwell that breaks into open air says to build stairs across the gap', () => {
    const g = flatGame();
    const miner = dwarf(g, 40, 40, ['mine', 'build']);
    give(g, miner, 'pick', 'pick');
    // a cavern two levels down: air at 18, its floor at 17
    room(g, 38, 38, 42, 42, 17);
    for (let y = 38; y <= 42; y++) for (let x = 38; x <= 42; x++) g.w.setTile(cell(x, y, 18), T.Open);
    for (const z of [20, 19, 17]) g.designate(cell(40, 40, z), DG.Stair);
    run(g, 2500, () => g.w.tile[cell(40, 40, 19)] === T.Stair);
    run(g, 100);
    expect(explainTask(g, 'mine', (u) => tryDesig(g, u, cell(40, 40, 17)), 'd' + cell(40, 40, 17))).toMatch(/open air above.*Build > Structure > Stairs/);

    // constructed stairs in the gap join the two halves
    g.spawnItem('boulder', MAT.granite, cell(41, 40), 1);
    expect(placeBuilding(g, 'stairs', 40, 40, 18)).toBeTruthy();
    run(g, 4000, () => g.w.tile[cell(40, 40, 17)] === T.Stair);
    expect(g.w.tile[cell(40, 40, 17)]).toBe(T.Stair);
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

describe('cave-ins', () => {
  test('a floor cut off on all four sides falls into the room below, onto whatever is there', () => {
    const g = flatGame();
    const miner = dwarf(g, 36, 41, ['mine']);
    give(g, miner, 'pick', 'pick');
    // a room one level down, with a goblin standing in the middle of it
    room(g, 39, 39, 43, 43, 19);
    const gob = g.addUnit('goblin', cell(41, 41, 19), 'enemy');
    gob.nextThink = 1e9;
    const plug = cell(41, 41, 20);

    // channel the four tiles around the piece of floor directly above the goblin
    for (const [x, y] of [[40, 41], [42, 41], [41, 40], [41, 42]]) g.designate(cell(x, y, 20), DG.Channel);
    // three sides cut: it still hangs on by the last one
    run(g, 3000, () => g.desigs.size === 1);
    expect(g.w.tile[plug]).toBe(T.Floor);

    run(g, 3000, () => g.w.tile[plug] === T.Open);
    expect(g.w.tile[plug]).toBe(T.Open);
    expect(g.log.some((l) => /has collapsed/.test(l.text))).toBe(true);
    // the game stops to show it, and the goblin was under it
    expect(g.attention?.text).toMatch(/collapsed/);
    expect(gob.dead || gob.hp < gob.maxHp).toBe(true);
  });

  test('ordinary mining never brings the roof down', () => {
    const g = flatGame();
    const miner = dwarf(g, 40, 40, ['mine']);
    give(g, miner, 'pick', 'pick');
    for (const z of [20, 19, 18]) g.designate(cell(40, 40, z), DG.Stair);
    for (let y = 38; y <= 44; y++) for (let x = 41; x <= 48; x++) g.designate(cell(x, y, 18), DG.Dig);
    for (let y = 38; y <= 44; y++) for (let x = 41; x <= 48; x++) g.designate(cell(x, y, 19), DG.Dig);
    run(g, 40000, () => g.desigs.size === 0);
    expect(g.desigs.size).toBe(0);
    expect(g.log.some((l) => /collapsed/.test(l.text))).toBe(false);
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

test('building over a dig order is refused with a reason instead of silently cancelling it', () => {
  const g = flatGame();
  g.designate(cell(41, 41), DG.Stair);
  const can = canPlace(g, 'still', 40, 40, 20);
  expect(can.ok).toBe(false);
  expect(!can.ok && can.why).toMatch(/"Carve stairs" order on this tile/);
  expect(g.w.desig[cell(41, 41)]).toBe(DG.Stair);

  // an order to pick a shrub is different: it just gives way
  const g2 = flatGame();
  g2.w.plant[cell(41, 41)] = PLANT.strawberry;
  g2.designate(cell(41, 41), DG.Gather);
  expect(placeBuilding(g2, 'still', 40, 40, 20)).toBeTruthy();
  expect(g2.w.desig[cell(41, 41)]).toBe(0);
});

describe('fighting and hunting', () => {
  test('nobody hunts bare-handed: the hunter says what is missing, then fetches a spear', () => {
    const g = flatGame();
    const hunter = dwarf(g, 40, 40, ['hunt']);
    const deer = g.addUnit('deer', cell(50, 40), 'wild');
    deer.hunted = true;
    run(g, 40);
    expect(explainUnit(g, hunter).lines.join(' ')).toMatch(/needs a weapon to hunt with.*none in the fortress/);

    g.spawnItem('spear', MAT.copper, cell(41, 41));
    run(g, 3000, () => deer.dead);
    expect(deer.dead).toBe(true);
    expect(hunter.equip.weapon).toBeTruthy();
    // the kill is left as a corpse for the butcher
    expect(g.count((i) => i.type === 'corpse' && i.sub === 'deer')).toBe(1);
  });

  test('raiders pause the game; militia fight on their own while civilians run', () => {
    const g = flatGame();
    const soldier = dwarf(g, 40, 40, []);
    soldier.militia = true;
    soldier.skills.fight = 900;
    give(g, soldier, 'axe', 'weapon', MAT.iron);
    const farmer = dwarf(g, 42, 42, []);
    const gob = g.addUnit('goblin', cell(52, 40), 'enemy');

    // a raid announcement asks for the player's attention (the UI pauses and jumps to it)
    g.say('An ambush!', 'death', g.cellOf(gob), true);
    expect(g.attention?.text).toBe('An ambush!');

    run(g, 30);
    expect(soldier.job?.type).toBe('attack');
    expect(explainUnit(g, soldier).status).toMatch(/Answering the alarm/);
    expect(farmer.job?.type === 'flee' || g.cellOf(farmer) !== cell(42, 42)).toBe(true);
    run(g, 1500, () => gob.dead);
    expect(gob.dead).toBe(true);
    expect(soldier.dead).toBe(false);
  });
});

test('an enemy that cannot reach anyone is reported as cut off, not as an attack', () => {
  const g = flatGame();
  dwarf(g, 40, 40, []);
  // a troll sealed in a chamber below, with no stairs or ramps leading out
  room(g, 60, 60, 62, 62, 17);
  const troll = g.addUnit('troll', cell(61, 61, 17), 'enemy');
  g.w.discover(cell(61, 61, 17));
  expect(alertText(g)).toMatch(/1 lurking, cut off.*nobody needs to be drafted/s);
  expect(alertText(g)).not.toMatch(/Draft dwarves/);

  // a stairwell down to it turns it into a real threat
  for (const z of [20, 19, 18, 17]) g.w.setTile(cell(60, 59, z), T.Stair);
  expect(alertText(g)).toMatch(/1 hostile.*Draft dwarves/s);
  void troll;
});

describe('strange moods', () => {
  test('a moody dwarf claims a workshop, gathers what the fortress has, and makes an artifact', () => {
    const g = flatGame();
    const u = dwarf(g, 40, 40, []);
    const shop = g.addBuilding('craftsdwarf', 44, 39, 20);
    shop.built = true;
    // the fortress owns only stone, wood and cloth: the mood must ask for things that can actually be found
    g.spawnItem('boulder', MAT.granite, cell(38, 38), 3);
    g.spawnItem('log', MAT.oak, cell(38, 40), 3);
    g.spawnItem('cloth', MAT.cloth, cell(38, 42), 3);

    beginMood(g, u);
    expect(u.state).toBe('mood');
    expect(u.moodNeeds!.every((n) => ['boulder', 'log', 'cloth'].includes(n.type))).toBe(true);
    // the panel says what is going on and what is still missing
    expect(explainUnit(g, u).lines.join(' ')).toMatch(/strange mood.*Needs:/s);

    // moody dwarves do not stop to eat or drink, so the mood itself must not starve them
    const thirst = u.thirst;
    run(g, TICKS_DAY * 4, () => u.state !== 'mood');
    expect(u.dead).toBe(false);
    expect(u.state).toBe('');
    expect(u.thirst).toBeLessThan(thirst + 60);
    expect(g.count((i) => i.type === 'artifact')).toBe(1);
    expect(g.ev.artifacts).toBe(1);
    expect(shop.worker).toBe(0);
  });

  test('a mood that cannot be satisfied says what is missing before the dwarf goes insane', () => {
    const g = flatGame();
    const u = dwarf(g, 40, 40, []);
    g.spawnItem('boulder', MAT.granite, cell(38, 38), 3);
    g.spawnItem('log', MAT.oak, cell(38, 40), 3);
    beginMood(g, u); // no workshop anywhere
    run(g, 100);
    expect(alertText(g)).toMatch(/strange mood.*needs a workshop/s);
    run(g, TICKS_DAY * 9, () => u.state !== 'mood');
    expect(['berserk', 'melancholy']).toContain(u.state);
  });
});

describe('ranged combat', () => {
  test('a marksdwarf shoots across a gap that nobody can cross, and runs out of bolts', () => {
    const g = flatGame();
    const archer = dwarf(g, 40, 40, []);
    archer.skills.shoot = 800;
    give(g, archer, 'crossbow', 'weapon', MAT.oak);
    // only four bolts: enough to hurt a troll, not to kill it
    g.equip(archer, g.spawnItem('bolt', MAT.iron, g.cellOf(archer), 4), 'ammo');
    // a moat right across the map: open space three tiles wide between the dwarf and the troll
    for (let y = 0; y < 96; y++) for (let x = 43; x <= 45; x++) g.w.setTile(cell(x, y), T.Open);
    const troll = g.addUnit('troll', cell(48, 40), 'enemy');
    troll.nextThink = 1e9; // it stands and glares instead of wandering out of range
    expect(g.w.canReach(g.cellOf(archer), g.cellOf(troll), true)).toBe(false);

    setDraft(g, archer, true);
    const hp = troll.hp;
    run(g, 600, () => !archer.equip.ammo);
    // bolts were spent, the troll was hurt, and the dwarf never had to move
    expect(archer.equip.ammo).toBeUndefined();
    expect(troll.hp).toBeLessThan(hp);
    expect(g.cellOf(archer)).toBe(cell(40, 40));
    expect(g.log.some((l) => /shoots the troll .* with an iron bolt/.test(l.text))).toBe(true);
    expect(g.log.some((l) => /is out of bolts/.test(l.text))).toBe(true);
  });

  test('walls block shots: no line of sight, no shooting', () => {
    const g = flatGame();
    const archer = dwarf(g, 40, 40, []);
    give(g, archer, 'crossbow', 'weapon', MAT.oak);
    g.equip(archer, g.spawnItem('bolt', MAT.iron, g.cellOf(archer), 12), 'ammo');
    // a wall right across the map: the troll can be neither reached nor seen
    for (let y = 0; y < 96; y++) g.w.setTile(cell(44, y), T.Wall, MAT.granite);
    const troll = g.addUnit('troll', cell(48, 40), 'enemy');
    expect(lineOfSight(g, g.cellOf(archer), g.cellOf(troll))).toBe(false);
    setDraft(g, archer, true);
    run(g, 200);
    expect(g.items.get(archer.equip.ammo)!.n).toBe(12);
  });

  test('goblin archers shoot too, and armor turns some of it', () => {
    const g = flatGame();
    const bare = dwarf(g, 40, 40, []);
    bare.nextThink = 1e9; // stands there and takes it
    const gob = g.addUnit('goblin', cell(47, 40), 'enemy');
    g.equip(gob, g.spawnItem('crossbow', MAT.oak, g.cellOf(gob)), 'weapon');
    g.equip(gob, g.spawnItem('bolt', MAT.copper, g.cellOf(gob), 30), 'ammo');
    for (let y = 0; y < 96; y++) for (let x = 43; x <= 45; x++) g.w.setTile(cell(x, y), T.Open);
    run(g, 400, () => bare.hp < bare.maxHp);
    expect(bare.hp).toBeLessThan(bare.maxHp);
    expect(g.log.some((l) => /The goblin shoots/.test(l.text) || /shot dead/.test(l.text))).toBe(true);
  });
});

describe('clothing', () => {
  test('clothes wear out; a dwarf in rags fetches a new outfit, and says why if there is none', () => {
    const g = flatGame();
    const u = dwarf(g, 40, 40, []);
    g.spawnItem('drink', MAT.oak, cell(41, 41), 5, { sub: 'dwarven ale' });
    u.wear = 10;
    run(g, 40);
    expect(explainUnit(g, u).lines.join(' ')).toMatch(/Clothes are in tatters: needs clothes.*none in the fortress/);

    g.spawnItem('clothes', MAT.cloth, cell(44, 40), 1);
    run(g, 400, () => u.wear === 100);
    expect(u.wear).toBe(100);
    expect(g.count((i) => i.type === 'clothes')).toBe(0);
    expect(u.thoughts.some((t) => /fresh clothes/.test(t.text))).toBe(true);
  });
});

describe('machinery', () => {
  test('a millstone only grinds while a windmill turns it, and says what is missing', () => {
    const g = flatGame();
    dwarf(g, 40, 40, ['cook']);
    g.spawnItem('plant', MAT.none, cell(41, 41), 2, { sub: 'cave_wheat' });
    const mill = built(g, 'millstone', 44, 39);
    mill.bills.push({ recipe: 'mill_wheat', mode: 'count', n: 1, paused: false });

    // nothing drives it: the work order says so
    run(g, 60);
    expect(mill.bills[0].why).toMatch(/not turning: not connected to a windmill or water wheel/);

    // a windmill five tiles away is not connected until axles join the two
    const wind = built(g, 'windmill', 52, 39);
    run(g, 40);
    expect(wind.powered).toBe(true);
    expect(mill.powered).toBe(false);
    for (let x = 47; x <= 51; x++) built(g, 'axle', x, 40);
    run(g, 40);
    expect(mill.powered).toBe(true);
    expect(mill.pwr).toMatch(/makes 20 power and uses 15/);

    // one plant becomes four portions of flour, and the seed comes back
    run(g, 1500, () => g.count((i) => i.type === 'flour') > 0);
    expect(g.count((i) => i.type === 'flour')).toBe(4);
    expect(g.count((i) => i.type === 'seed')).toBe(1);
  });

  test('too many machines on one windmill: nothing turns, and the reason gives the numbers', () => {
    const g = flatGame();
    const wind = built(g, 'windmill', 40, 40);
    const a = built(g, 'millstone', 43, 40);
    const b = built(g, 'millstone', 37, 40);
    run(g, 40);
    expect(a.powered).toBe(true); // 20 made, 20 used: just enough
    built(g, 'axle', 41, 43);
    run(g, 40);
    expect(wind.powered).toBe(false);
    expect(b.pwr).toMatch(/overloaded: the network needs 21 power but makes only 20/);
  });

  test('a screw pump lifts water out of a pit; a lever on a gear switches it off', () => {
    const g = flatGame();
    // a flooded chamber one level down, with a hole in its roof
    room(g, 39, 39, 41, 41, 19);
    const below: number[] = [];
    for (let y = 39; y <= 41; y++) for (let x = 39; x <= 41; x++) below.push(cell(x, y, 19));
    for (const c of below) g.w.water[c] = 7;
    g.w.setTile(cell(40, 40), T.Open);
    const total = () => below.reduce((n, c) => n + g.w.water[c], 0);

    const pump = built(g, 'pump', 40, 40);
    const gear = built(g, 'gear', 40, 41);
    built(g, 'windmill', 39, 42);
    const lever = built(g, 'lever', 45, 45);
    lever.links = [gear.id];

    const before = total();
    run(g, 120);
    expect(pump.powered).toBe(true);
    // water came up: there is less below, and it was poured out on the surface (where it spreads and dries)
    expect(total()).toBeLessThan(before);
    expect(g.w.water[cell(39, 40)] + g.w.water[cell(41, 40)] + g.w.water[cell(40, 39)]).toBeGreaterThan(0);

    // disengage the gear: the pump is cut off and stops
    toggleLever(g, lever);
    run(g, 40);
    expect(pump.powered).toBe(false);
    expect(pump.pwr).toMatch(/not connected to a windmill/);
    // nothing more is lifted (what was poured out up top may trickle back down the hole)
    const stopped = total();
    run(g, 200);
    expect(total()).toBeGreaterThanOrEqual(stopped);
  });
});

test('a cavern beast defends its territory but does not follow a trail of victims out of it', () => {
  const g = flatGame();
  const home = cell(60, 60);
  const beast = g.addUnit('beast', home, 'enemy');
  beast.home = home;
  // three dwarves standing in a line leading away from its lair, each within sight of the last
  const near = dwarf(g, 66, 60, []);
  const mid = dwarf(g, 75, 60, []);
  const far = dwarf(g, 84, 60, []);
  for (const d of [near, mid, far]) d.nextThink = 1e9;

  run(g, 4000);
  // the one who wandered into its territory is dead...
  expect(near.dead).toBe(true);
  // ...but it did not chain from victim to victim all the way up the line
  expect(far.dead).toBe(false);
  expect(dist(g.cellOf(beast), home)).toBeLessThanOrEqual(TERRITORY);
  void mid;
});

test('the militia leaves a beast alone in its lair instead of marching in to die', () => {
  const g = flatGame();
  const home = cell(70, 60);
  const beast = g.addUnit('beast', home, 'enemy');
  beast.home = home;
  // a pet has wandered into its territory, so the beast is busy with a target
  const stray = g.addUnit('dog', cell(74, 60), 'fort');
  stray.nextThink = 1e9;
  const soldier = dwarf(g, 48, 60, []);
  soldier.militia = true;
  give(g, soldier, 'axe', 'weapon', MAT.iron);

  run(g, 300);
  expect(soldier.dead).toBe(false);
  expect(soldier.job?.type).not.toBe('attack');
  expect(dist(g.cellOf(soldier), home)).toBeGreaterThan(TERRITORY);
});

test('a crowd of unarmed dwarves mobs a lone goblin instead of dying one by one', () => {
  const g = flatGame();
  const crowd = [0, 1, 2, 3, 4, 5].map((k) => dwarf(g, 40 + (k % 3), 40 + Math.floor(k / 3), []));
  const gob = g.addUnit('goblin', cell(47, 40), 'enemy');
  g.equip(gob, g.spawnItem('sword', MAT.copper, g.cellOf(gob)), 'weapon');

  run(g, 20);
  // six against one: they do not run
  expect(crowd.filter((d) => d.job?.type === 'attack').length).toBeGreaterThanOrEqual(4);
  expect(explainUnit(g, crowd.find((d) => d.job?.type === 'attack')!).status).toMatch(/Mobbing the goblin/);
  run(g, 2500, () => gob.dead || !g.units.has(gob.id));
  expect(gob.dead || !g.units.has(gob.id)).toBe(true);
  expect(crowd.filter((d) => !d.dead).length).toBeGreaterThanOrEqual(4);

  // one dwarf alone still runs
  const g2 = flatGame();
  const loner = dwarf(g2, 40, 40, []);
  g2.addUnit('goblin', cell(46, 40), 'enemy');
  run(g2, 40);
  expect(loner.job?.type).toBe('flee');
});

describe('taverns and temples', () => {
  test('a restless dwarf says there is no tavern; given one, goes for a drink with friends', () => {
    const g = flatGame();
    const u = dwarf(g, 40, 40, []);
    const friend = dwarf(g, 41, 40, []);
    u.fun = friend.fun = 120;
    run(g, 30);
    expect(explainUnit(g, u).lines.join(' ')).toMatch(/there is no tavern \(Zones > Tavern/);
    expect(alertText(g)).toMatch(/No tavern/);

    g.addZone('tavern', [cell(50, 50), cell(51, 50), cell(50, 51), cell(51, 51)]);
    g.spawnItem('drink', MAT.oak, cell(52, 50), 5, { sub: 'dwarven ale' });
    run(g, 800, () => u.fun! < 10 && friend.fun! < 10);
    expect(u.fun).toBeLessThan(10);
    expect(u.thoughts.some((t) => /merry evening drinking with friends|good company/.test(t.text))).toBe(true);
    expect(alertText(g)).not.toMatch(/No tavern/);
  });

  test('work comes first unless the need has been ignored for a long time', () => {
    const g = flatGame();
    const u = dwarf(g, 40, 40, ['haul']);
    u.faith = 60; // would like to pray, but it can wait
    g.addZone('temple', [cell(50, 50)]);
    g.addZone('stockpile', [cell(44, 44)]);
    g.spawnItem('log', MAT.oak, cell(42, 40), 1);
    run(g, 20);
    expect(u.job?.type).toBe('haul');
    run(g, 600, () => u.faith! < 10);
    expect(u.faith).toBeLessThan(10); // prayed once the hauling was done
  });
});

describe('the mayor', () => {
  test('a big enough fortress elects a mayor, who complains about quarters and issues mandates', () => {
    const g = flatGame();
    const crowd = Array.from({ length: 15 }, (_, k) => dwarf(g, 40 + (k % 5), 40 + Math.floor(k / 5), k === 0 ? ['craft'] : []));
    run(g, 60);
    const mayor = g.units.get(g.ev.mayor)!;
    expect(mayor).toBeTruthy();
    expect(g.profession(mayor)).toBe('Mayor');
    expect(explainUnit(g, mayor).lines.join(' ')).toMatch(/Mayor\. Unhappy with their quarters: has no bed of their own/);

    // a mandate shows as an alert with the count, the deadline and where to make the things
    issueMandate(g, 'craft');
    expect(alertText(g)).toMatch(/Mandate: 0\/6 crafts.*within 14\.0 days.*Craftsdwarf's Workshop/s);

    // two batches of rock crafts (three each) meet it
    g.spawnItem('boulder', MAT.granite, cell(46, 44), 2);
    const shop = built(g, 'craftsdwarf', 48, 44);
    shop.bills.push({ recipe: 'craft_stone', mode: 'count', n: 2, paused: false });
    run(g, 3000, () => !g.ev.mandate);
    expect(g.log.some((l) => /mandate has been met: 6 crafts/.test(l.text))).toBe(true);
    void crowd;
  });

  test('an ignored mandate enrages the mayor, and somebody else pays for it', () => {
    const g = flatGame();
    Array.from({ length: 15 }, (_, k) => dwarf(g, 40 + (k % 5), 40 + Math.floor(k / 5), []));
    run(g, 60);
    issueMandate(g, 'statue');
    g.ev.mandate!.until = g.tick + 20;
    run(g, 100);
    expect(g.ev.mandate).toBeNull();
    expect(g.log.some((l) => /mandate for 1 statues was not met/.test(l.text))).toBe(true);
    expect(g.log.some((l) => /has been given the blame/.test(l.text))).toBe(true);
    expect(g.units.get(g.ev.mayor)!.thoughts.some((t) => /mandate ignored/.test(t.text))).toBe(true);
  });
});

describe('vampires', () => {
  test('a vampire drains a sleeper unseen; the fortress is told what to look for; an accusation exposes it', () => {
    const g = flatGame();
    const vampire = dwarf(g, 44, 40, []);
    vampire.vampire = true;
    vampire.feedAt = 1;
    const sleeper = dwarf(g, 40, 40, []);
    sleeper.tired = 100;
    // two others, far away and looking elsewhere
    const accuser = dwarf(g, 70, 70, []);
    const innocent = dwarf(g, 72, 70, []);
    accuser.nextThink = innocent.nextThink = 1e9;

    run(g, 600, () => sleeper.dead);
    expect(sleeper.dead).toBe(true);
    expect(g.log.some((l) => /found dead, completely drained of blood/.test(l.text))).toBe(true);
    // nobody saw it: the game says what to look for, without naming anyone
    expect(vampire.exposed).toBeFalsy();
    expect(g.attention?.text).toMatch(/A vampire stalks the fortress/);
    expect(alertText(g)).toMatch(/A vampire among you.*never eats, drinks or sleeps.*Accuse/s);
    expect(explainUnit(g, vampire).status).not.toMatch(/vampire/i);

    // the tell: its needs never move
    run(g, 300);
    expect(vampire.hunger + vampire.thirst + vampire.tired).toBe(0);
    expect(innocent.hunger).toBeGreaterThan(0);

    // a wrong accusation costs something...
    order(g, accuser, optionsAt(g, accuser, g.cellOf(innocent)).find((o) => o.label.startsWith('Accuse'))!);
    expect(innocent.thoughts.some((t) => /falsely accused/.test(t.text))).toBe(true);
    // ...the right one exposes it, and then it can be attacked
    order(g, accuser, optionsAt(g, accuser, g.cellOf(vampire)).find((o) => o.label.startsWith('Accuse'))!);
    expect(vampire.exposed).toBe(true);
    expect(alertText(g)).toMatch(/Vampire: /);
    expect(optionsAt(g, accuser, g.cellOf(vampire)).some((o) => /Attack .* \(vampire\)/.test(o.label))).toBe(true);
  });

  test('a waking witness exposes it on the spot', () => {
    const g = flatGame();
    const vampire = dwarf(g, 44, 40, []);
    vampire.vampire = true;
    vampire.feedAt = 1;
    const sleeper = dwarf(g, 40, 40, []);
    sleeper.tired = 100;
    const witness = dwarf(g, 41, 43, []);
    witness.nextThink = 1e9;
    run(g, 600, () => sleeper.dead);
    expect(vampire.exposed).toBe(true);
    expect(g.log.some((l) => /is a vampire! .* saw it feeding/.test(l.text))).toBe(true);
  });
});

describe('fortress defences', () => {
  test('a weapon trap strikes every raider that crosses it, and keeps working', () => {
    const g = flatGame();
    const bait = dwarf(g, 55, 40, []);
    bait.nextThink = 1e9;
    // a corridor, so the only way to the dwarf is over the traps
    for (let x = 30; x < 60; x++) for (const y of [39, 41]) g.w.setTile(cell(x, y), T.Wall, MAT.granite);
    for (const x of [44, 45, 46]) {
      const trap = built(g, 'weapontrap', x, 40);
      const axe = g.spawnItem('axe', MAT.steel, cell(x, 40));
      axe.in = trap.id;
      trap.mats.push(axe.id);
    }
    const a = g.addUnit('goblin', cell(36, 40), 'enemy');
    const b = g.addUnit('goblin', cell(34, 40), 'enemy');
    run(g, 900, () => !g.units.has(a.id) && !g.units.has(b.id));
    expect(g.log.filter((l) => /A weapon trap hacks/.test(l.text)).length).toBeGreaterThanOrEqual(2);
    expect(bait.dead).toBe(false);
    // unlike a stone-fall trap, it is still there afterwards
    expect(g.buildingAt(cell(45, 40))?.type).toBe('weapontrap');
  });

  test('marksdwarves shoot through fortifications; raiders cannot walk through them', () => {
    const g = flatGame();
    const archer = dwarf(g, 40, 40, []);
    archer.skills.shoot = 900;
    give(g, archer, 'crossbow', 'weapon', MAT.oak);
    g.equip(archer, g.spawnItem('bolt', MAT.steel, g.cellOf(archer), 30), 'ammo');
    // a line of fortifications right across the map
    for (let y = 0; y < 96; y++) built(g, 'fortification', 43, y);
    const gob = g.addUnit('goblin', cell(48, 40), 'enemy');
    expect(g.w.canReach(g.cellOf(gob), g.cellOf(archer), true)).toBe(false);
    expect(lineOfSight(g, g.cellOf(archer), g.cellOf(gob))).toBe(true);

    setDraft(g, archer, true);
    run(g, 1200, () => gob.dead || !g.units.has(gob.id));
    expect(gob.dead || !g.units.has(gob.id)).toBe(true);
    expect(archer.hp).toBe(archer.maxHp);
  });
});

describe('livestock', () => {
  test('a hunter trains a dog for war when asked, and it then goes for raiders', () => {
    const g = flatGame();
    const trainer = dwarf(g, 40, 40, ['hunt']);
    const dog = g.addUnit('dog', cell(43, 40), 'fort');
    dog.name = 'Rex';
    dog.train = true;
    run(g, 1500, () => dog.kind === 'war_dog');
    expect(dog.kind).toBe('war_dog');
    expect(g.log.some((l) => /has trained Rex into a war dog/.test(l.text))).toBe(true);
    void trainer;
  });

  test('farmers milk and shear on their own; milk becomes cheese; hens lay', () => {
    const g = flatGame();
    const farmer = dwarf(g, 40, 40, ['farm', 'cook']);
    const yak = g.addUnit('yak', cell(43, 40), 'fort');
    yak.nextThink = 1e9;
    run(g, 800, () => g.count((i) => i.type === 'milk') > 0 && g.count((i) => i.type === 'wool') > 0);
    expect(g.count((i) => i.type === 'milk')).toBe(2);
    expect(g.count((i) => i.type === 'wool')).toBe(2);
    // not again until it has had time: the menu says when
    expect(optionsAt(g, farmer, g.cellOf(yak)).find((o) => o.label.startsWith('Milk'))!.why).toMatch(/milked recently \(ready in 4\.0 days\)/);

    const kitchen = built(g, 'kitchen', 46, 44);
    kitchen.bills.push({ recipe: 'cheese', mode: 'count', n: 1, paused: false });
    run(g, 1500, () => g.count((i) => i.type === 'cheese') > 0);
    expect(g.itemName(Array.from(g.items.values()).find((i) => i.type === 'cheese')!, true)).toBe('yak cheese');

    const hen = g.addUnit('chicken', cell(50, 50), 'fort');
    hen.nextThink = 1e9;
    run(g, TICKS_DAY * 4, () => g.count((i) => i.type === 'egg') > 0);
    expect(g.count((i) => i.type === 'egg')).toBeGreaterThan(0);
  });
});

describe('things that come in the night', () => {
  test('a werebeast bite curses a dwarf, who transforms at the next full moon and changes back healed', () => {
    const g = flatGame();
    const victim = dwarf(g, 40, 40, []);
    victim.nextThink = 1e9; // stands still for the bite
    g.spawnItem('drink', MAT.oak, cell(60, 60), 5, { sub: 'dwarven ale' });
    g.tick = (MOON_DAYS - 1) * TICKS_DAY; // the moon rises
    const beast = werebeast(g);
    g.moveUnit(beast, cell(41, 40));
    expect(g.attention?.text).toMatch(/moon is full/);

    // (kept on his feet for the story: it can take a few bites before one goes deep enough)
    run(g, 700, () => {
      victim.hp = victim.maxHp;
      return !!victim.cursed;
    });
    expect(victim.dead).toBe(false);
    expect(victim.cursed).toBe(beast.cursed);
    // one bite is enough for the story: the moon sets, and the beast leaves
    beast.leaveAt = g.tick;
    beast.target = 0;
    g.moveUnit(beast, cell(70, 70));
    run(g, 3000, () => !g.units.has(beast.id));
    expect(victim.state).toBe(''); // the moon of the bite does not turn the victim
    expect(g.units.has(beast.id)).toBe(false);

    // the panel and an alert count down to the change and say what to do about it
    victim.nextThink = 0;
    g.tick = (MOON_DAYS * 2 - 1) * TICKS_DAY - 900;
    expect(explainUnit(g, victim).lines.join(' ')).toMatch(/Cursed: bitten by a were.*lock the door/);
    expect(alertText(g)).toMatch(/turns in 0\.5d/);

    const bystander = dwarf(g, 44, 40, []);
    bystander.nextThink = 1e9; // frozen in fear: a dwarf who fights back can beat a were-dwarf to death
    run(g, 1200, () => victim.state === 'were');
    expect(victim.state).toBe('were');
    expect(victim.wounds.length).toBe(0);
    expect(optionsAt(g, victim, cell(45, 45))[0].why).toMatch(/is a were/);
    // it goes for whoever is nearest
    run(g, 600, () => bystander.hp < bystander.maxHp || bystander.dead);
    expect(bystander.hp < bystander.maxHp || bystander.dead).toBe(true);

    run(g, 1500, () => victim.state === '');
    expect(victim.state).toBe('');
    expect(victim.dead).toBe(false);
  });

  test('a necromancer raises the unburied dead; killing it drops every thrall', () => {
    const g = flatGame();
    const necro = necroSiege(g, 0);
    g.moveUnit(necro, cell(50, 50));
    g.spawnItem('corpse', MAT.flesh, cell(53, 50), 1, { sub: 'deer' });
    g.spawnItem('corpse', MAT.flesh, cell(50, 53), 1, { sub: 'Urist Deadbeard', dwarf: true });

    run(g, 600, () => g.count((i) => i.type === 'corpse') === 0);
    const thralls = Array.from(g.units.values()).filter((u) => u.kind === 'zombie');
    expect(thralls.length).toBe(2);
    expect(thralls.map((z) => g.unitName(z)).sort()).toEqual(['the corpse of Urist Deadbeard', 'the deer zombie']);

    killUnit(g, necro, 'been shot dead');
    expect(Array.from(g.units.values()).filter((u) => u.kind === 'zombie').length).toBe(0);
    expect(g.log.some((l) => /2 of its thralls crumple/.test(l.text))).toBe(true);
  });

  test('the unburied dead come back as ghosts until they get a coffin', () => {
    const g = flatGame();
    const u = dwarf(g, 40, 40, ['haul']);
    g.spawnItem('drink', MAT.oak, cell(41, 41), 5, { sub: 'dwarven ale' });
    g.spawnItem('meal', MAT.none, cell(41, 42), 5, { sub: 'stew' });
    const body = g.spawnItem('corpse', MAT.flesh, cell(45, 45), 1, { sub: 'Kadol Lostbrow', dwarf: true });

    run(g, TICKS_DAY * 7, () => !!body.ghost);
    const ghost = g.units.get(body.ghost!)!;
    expect(ghost.name).toBe('the ghost of Kadol Lostbrow');
    expect(alertText(g)).toMatch(/1 ghost.*Bury the body in a coffin/s);
    // it cannot be attacked, and says so
    expect(explainUnit(g, ghost).lines.join(' ')).toMatch(/cannot be fought/);

    const coffin = g.addBuilding('coffin', 48, 45, 20);
    coffin.built = true;
    run(g, 2000, () => !g.units.has(ghost.id));
    expect(g.units.has(ghost.id)).toBe(false);
    expect(coffin.corpse).toBe('Kadol Lostbrow');
    void u;
  });

  test('megabeasts announce themselves and breathe fire from range', () => {
    const g = flatGame();
    const d = megabeast(g, 'dragon');
    expect(g.attention?.text).toMatch(/dragon .* has come/);
    g.moveUnit(d, cell(50, 40));
    const u = dwarf(g, 44, 40, []);
    u.nextThink = 1e9;
    run(g, 300, () => u.dead || u.hp < u.maxHp);
    expect(g.log.some((l) => /breathes fire on/.test(l.text) || /burned to death/.test(l.text))).toBe(true);
  });
});

test('the fortress keeps a history, and masons engrave scenes from it', () => {
  const g = flatGame();
  const mason = dwarf(g, 40, 40, ['mason']);
  mason.skills.mason = 1500;
  g.chronicle('Urist Testbeard wrestled a carp and lost.');
  // a smoothed granite wall to carve
  const wall = cell(42, 40);
  g.w.setTile(wall, T.Wall, MAT.granite);
  g.w.flag[wall] |= 4;
  g.designate(wall, DG.Engrave);
  run(g, 1500, () => g.engravings.has(wall));

  const text = g.engravings.get(wall)!;
  expect(text).toMatch(new RegExp(`engraving by ${mason.name}`));
  // a legendary mason's work is graded, and it shows either the remembered event or a stock scene
  expect(text).toMatch(/well-crafted|finely-crafted|superior|exceptional|masterful/);
  expect(text).toMatch(/wrestled a carp and lost|an image of/);

  // history survives a save, and mining the wall out removes the carving
  const g2 = Game.deserialize(g.serialize());
  expect(g2.history[0].text).toBe('Urist Testbeard wrestled a carp and lost.');
  expect(g2.engravings.get(wall)).toBe(text);
  expect(g2.dateString(g2.history[0].tick, true)).toBe('1st Granite 250');
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
