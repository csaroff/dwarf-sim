import { expect, test } from 'vitest';
import { BUILDINGS, H, T, W } from '../src/sim/defs';
import { DG, placeBuilding } from '../src/sim/jobs';
import { newGame, step } from '../src/sim/sim';
import { idx } from '../src/sim/world';

// A scripted "player" founds a basic fortress on a real generated map and lets it run for a season.
// This is the smoke test for the whole simulation: nothing may throw, and the basics must function.
test('a simple fortress survives its first season on a generated map', () => {
  const g = newGame(42);
  const { x, y, z } = g.embark;
  expect(g.dwarves().length).toBe(7);

  // stockpile next to the wagon, and trees to fell
  const cells: number[] = [];
  for (let dy = 3; dy < 9; dy++) for (let dx = -4; dx < 5; dx++) {
    const c = idx(x + dx, y + dy, g.w.surface[x + dx + (y + dy) * W]);
    if (g.w.tile[c] === T.Floor) cells.push(c);
  }
  g.addZone('stockpile', cells);
  let trees = 0;
  for (let yy = 0; yy < H && trees < 12; yy++) for (let xx = 0; xx < W && trees < 12; xx++) {
    const c = idx(xx, yy, g.w.surface[xx + yy * W]);
    if (g.w.tile[c] === T.Tree && Math.abs(xx - x) < 15 && Math.abs(yy - y) < 15) {
      g.designate(c, DG.Chop);
      trees++;
    }
  }
  // a staircase down, and a room two levels below
  for (let k = 0; k < 4; k++) g.designate(idx(x - 3, y - 3, z - k), DG.Stair);
  for (let dy = 0; dy < 5; dy++) for (let dx = 1; dx < 7; dx++) g.designate(idx(x - 3 + dx, y - 3 + dy, z - 3), DG.Dig);
  // a farm in the soil one level down, reached by the same staircase, and wild plants to gather
  const farm: number[] = [];
  for (let dy = 0; dy < 3; dy++) for (let dx = 1; dx < 5; dx++) {
    g.designate(idx(x - 3 - dx, y - 3 + dy, z - 1), DG.Dig);
    farm.push(idx(x - 3 - dx, y - 3 + dy, z - 1));
  }
  g.addZone('farm', farm, { crop: 'plump_helmet' });
  for (let yy = y - 12; yy < y + 12; yy++) for (let xx = x - 12; xx < x + 12; xx++) {
    const c = idx(xx, yy, g.w.surface[xx + yy * W]);
    if (g.w.plant[c] >= 10) g.designate(c, DG.Gather);
  }
  // workshops on the surface
  const still = placeBuilding(g, 'still', x + 3, y - 4, g.w.surface[x + 3 + (y - 4) * W]);
  const carp = placeBuilding(g, 'carpenter', x - 8, y - 1, g.w.surface[x - 8 + (y - 1) * W]);

  for (let t = 0; t < 1800 * 12; t++) {
    step(g);
    if (t === 1500) {
      if (still?.built) still.bills.push({ recipe: 'brew', mode: 'forever', n: 0, paused: false });
      if (carp?.built) carp.bills.push({ recipe: 'c_bed', mode: 'count', n: 3, paused: false });
    }
  }
  const s = g.stocks();
  const info = { planted: g.crops.size, pop: g.dwarves().length, drink: s.drink, food: s.food, logs: s.log, beds: s.bed, still: still?.built, carp: carp?.built, desigs: g.desigs.size, alerts: g.alerts.map((a) => a.text + ': ' + a.detail), log: g.log.slice(-25).map((l) => l.text) };
  console.log(JSON.stringify(info, null, 1));
  expect(g.dwarves().length).toBeGreaterThanOrEqual(6);
  expect(still?.built || carp?.built).toBeTruthy();
  // the room got dug
  expect(g.w.tile[idx(x, y - 1, z - 3)]).toBe(T.Floor);
  void BUILDINGS;
}, 120000);
