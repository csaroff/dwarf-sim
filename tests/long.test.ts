import { expect, test } from 'vitest';
import { TICKS_DAY } from '../src/sim/defs';
import { raid } from '../src/sim/events';
import { Game } from '../src/sim/game';
import { newGame, step } from '../src/sim/sim';
import { alarm, found, queue, upkeep } from './fortress';

// Slow crash-hunt across several worlds and two game years, with every event enabled (raids, caravans,
// moods, cavern creatures). Run with LONG=1 npx vitest run tests/long.test.ts
const seeds = process.env.LONG ? [1, 2, 3, 42, 777] : [];

for (const seed of seeds) {
  test(`seed ${seed}: two years without a crash`, async () => {
    const g = newGame(seed);
    found(g);
    const deaths: typeof g.log = [];
    let last: unknown = null;
    for (let t = 0; t < TICKS_DAY * 96; t++) {
      step(g);
      if (t % 20000 === 0) await new Promise((r) => setTimeout(r, 0));
      if (t % 500 === 0) {
        // the log is capped, so collect dwarf deaths as they are announced
        const fresh: typeof g.log = [];
        for (let k = g.log.length - 1; k >= 0 && g.log[k] !== last; k--) fresh.unshift(g.log[k]);
        last = g.log[g.log.length - 1];
        for (const l of fresh) if (l.kind === 'death' && /, \w[\w ]*, has /.test(l.text)) deaths.push(l);
      }
      if (t === 2500) queue(g);
      if (t % 3000 === 2999) upkeep(g);
      if (t % 50 === 0) alarm(g);
      if (t === TICKS_DAY * 20) raid(g, 2);
      if (t === TICKS_DAY * 30) {
        const copy = Game.deserialize(g.serialize());
        expect(copy.units.size).toBe(g.units.size);
      }
    }
    const s = g.stocks();
    // how the dead died, and when: the balance picture for this world
    const causes: Record<string, number> = {};
    for (const l of deaths) {
      const c = l.text.replace(/^.* has /, '').replace(/ by .*$/, (m) => ' by ' + m.replace(/^ by (the )?/, '').replace(/^[A-Z]\S* the /, '').replace(/\.$/, '')).replace(/\.$/, '');
      causes[c] = (causes[c] || 0) + 1;
    }
    const lost = g.log.find((l) => /crumbled/.test(l.text));
    console.log(`seed ${seed}: pop ${g.dwarves().length} deaths ${g.ev.deaths} raids ${g.ev.raids} migrants ${g.ev.migrants} cavern ${g.ev.cavern} artifacts ${g.ev.artifacts} drink ${s.drink} food ${s.food} wealth ${g.wealth}${lost ? ` LOST on day ${Math.floor(lost.tick / TICKS_DAY)}` : ''}\n  causes: ${JSON.stringify(causes)}\n  death days: ${deaths.map((l) => Math.floor(l.tick / TICKS_DAY)).join(',')}`);
    expect(g.tick).toBe(TICKS_DAY * 96);
  }, 600000);
}
test('long soak is opt-in', () => expect(true).toBe(true));
