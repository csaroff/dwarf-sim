// One tick of the whole simulation.
import { Game } from './game';
import { embark, tickEvents } from './events';
import { killUnit, tickUnit } from './life';

export function step(g: Game) {
  g.tick++;
  if (g.tick % 2 === 0) {
    g.w.tickFluids(g.rng, g.tick % 8 === 0, (cell) => {
      // water met magma: whatever stood there is now part of the rock
      for (const u of g.unitsIn(cell)) killUnit(g, u, 'been encased in cooling obsidian');
      for (const it of g.itemsIn(cell)) g.removeItem(it);
      const b = g.buildingAt(cell);
      if (b) g.removeBuilding(b, false);
    });
  }
  for (const u of Array.from(g.units.values())) tickUnit(g, u);
  tickEvents(g);
}

export function newGame(seed: number): Game {
  const g = new Game(seed);
  embark(g);
  return g;
}
