import { test } from 'vitest';
import { TICKS_DAY } from '../src/sim/defs';
import { raid } from '../src/sim/events';
import { newGame, step } from '../src/sim/sim';
import { setDraft } from '../src/sim/orders';
import { alarm, found, queue, upkeep } from './fortress';

// Diagnostics, not assertions: DIAG=econ|raid npx vitest run tests/diag.test.ts
const mode = process.env.DIAG;
test.runIf(mode === 'econ')('economy over a year, no raids', () => {
  for (const seed of [42, 3]) {
    const g = newGame(seed);
    g.ev.nextRaid = 1e9;
    g.ev.nextThief = 1e9;
    found(g);
    for (let t = 0; t < TICKS_DAY * 48; t++) {
      step(g);
      if (t === 2500) queue(g);
      if (t % 3000 === 2999) upkeep(g);
      if (t % (TICKS_DAY * 6) === 0) {
        const s = g.stocks();
        const ds = g.dwarves();
        const jobs: Record<string, number> = {};
        for (const u of ds) jobs[u.job?.type || 'none'] = (jobs[u.job?.type || 'none'] || 0) + 1;
        console.log(`s${seed} d${t / TICKS_DAY} pop ${ds.length} drink ${s.drink} food ${s.food} plant ${s.plant || 0} seed ${s.seed || 0} barrel ${s.barrel || 0} crops ${g.crops.size} log ${s.log || 0} bed ${Array.from(g.buildings.values()).filter((b) => b.type === 'bed' && b.built).length} desig ${g.desigs.size} mood ${Math.round(ds.reduce((a, u) => a + u.mood, 0) / ds.length)} jobs ${JSON.stringify(jobs)}\n   ${g.alerts.map((a) => a.text + ' — ' + a.detail.slice(0, 150)).join('\n   ')}`);
      }
    }
    console.log('DEATHS ' + g.log.filter((l) => l.kind === 'death').map((l) => `d${Math.floor(l.tick / TICKS_DAY)} ${l.text}`).join('\n'));
  }
}, 600000);

test.runIf(mode === 'raid')('first raid: drafted at once vs. left to fend for themselves', () => {
  for (const seed of [42, 3, 1]) {
    for (const draft of [true, false]) {
      const g = newGame(seed);
      g.ev.nextRaid = 1e9;
      found(g);
      for (let t = 0; t < TICKS_DAY * 20; t++) {
        step(g);
        if (t === 2500) queue(g);
      }
      const before = g.dwarves().length;
      raid(g, 3);
      g.ev.nextRaid = 1e9;
      const mark = g.log.length;
      if (draft) for (const u of g.dwarves()) setDraft(g, u, true);
      const jobs: string[] = [];
      for (let t = 0; t < TICKS_DAY * 3; t++) {
        step(g);
        if (t % 300 === 0) {
          const c: Record<string, number> = {};
          for (const u of g.dwarves()) c[u.job?.type || 'none'] = (c[u.job?.type || 'none'] || 0) + 1;
          jobs.push(JSON.stringify(c));
        }
      }
      const foes = Array.from(g.units.values()).filter((u) => u.faction === 'enemy' && u.kind === 'goblin');
      const log = g.log.slice(mark).map((l) => l.text);
      console.log(`seed ${seed} draft=${draft}: dwarves ${before} -> ${g.dwarves().length}, goblins left ${foes.length} (hp ${foes.map((f) => Math.round(f.hp) + '/' + f.maxHp).join(' ')})\n  hits on goblins: ${log.filter((l) => /(punches|hacks|strikes|slashes|bashes|stabs) (Snodub|Ngokang|Utes|Osmstozu|Azstrog|Bax|Stozu|Zom|Dostngosp|Smunstu)/.test(l)).length}, hits on dwarves: ${log.filter((l) => /^(Snodub|Ngokang|Utes|Osmstozu|Azstrog|Bax|Stozu|Zom|Dostngosp|Smunstu) the goblin (hacks|strikes|slashes|bashes|stabs)/.test(l)).length}\n  jobs over time: ${jobs.slice(0, 8).join(' ')}\n  ` + log.filter((l) => !/(hacks|strikes|slashes|bashes|stabs|punches|blocks|glances)/.test(l)).slice(0, 14).join('\n  '));
    }
  }
}, 600000);
test.runIf(mode === 'full')('two years with everything on: stocks over time', () => {
  for (const seed of (process.env.SEEDS || '1,3').split(',').map(Number)) {
    const g = newGame(seed);
    found(g);
    let mark = 0;
    for (let t = 0; t < TICKS_DAY * 96; t++) {
      step(g);
      if (t === 2500) queue(g);
      if (t % 3000 === 2999) upkeep(g);
      if (t % 50 === 0) alarm(g);
      if (t % (TICKS_DAY * 6) === 0) {
        const s = g.stocks();
        const ds = g.dwarves();
        const jobs: Record<string, number> = {};
        for (const u of ds) jobs[u.job?.type || 'none'] = (jobs[u.job?.type || 'none'] || 0) + 1;
        const seeds: Record<string, number> = {}, plants: Record<string, number> = {};
        for (const it of g.items.values()) {
          if (it.type === 'seed') seeds[it.sub!] = (seeds[it.sub!] || 0) + it.n;
          if (it.type === 'plant') plants[it.sub!] = (plants[it.sub!] || 0) + it.n;
        }
        const farm = g.zonesOf('farm').map((z) => `${z.crop} ${z.cells.filter((c) => g.crops.has(c)).length}/${z.cells.length}`).join(', ');
        const still = Array.from(g.buildings.values()).find((b) => b.type === 'still');
        console.log(`s${seed} d${t / TICKS_DAY} pop ${ds.length} drink ${s.drink} food ${s.food} meal ${s.meal || 0} barrel ${s.barrel || 0} farm [${farm}] mood ${Math.round(ds.reduce((a, u) => a + u.mood, 0) / (ds.length || 1))} drafted ${ds.filter((u) => u.drafted).length} down ${ds.filter((u) => u.downSince).length}\n   seeds ${JSON.stringify(seeds)} plants ${JSON.stringify(plants)}\n   jobs ${JSON.stringify(jobs)} still: ${still ? (still.built ? still.bills.map((b) => `${b.recipe} ${b.mode} ${b.n} why=${b.why}`).join(';') : 'unbuilt') : 'none'}\n   alerts: ${g.alerts.map((a) => a.text).join(' / ')}\n   ${g.log.slice(mark).filter((l) => l.kind === 'death' || l.kind === 'event').map((l) => l.text.slice(0, 110)).slice(0, 8).join('\n   ')}`);
        mark = g.log.length;
      }
    }
  }
}, 900000);
test.runIf(mode === 'story')('the notable events of one fortress, day by day', async () => {
  const from = Number(process.env.FROM || 0);
  for (const seed of (process.env.SEEDS || '42').split(',').map(Number)) {
    const g = newGame(seed);
    found(g);
    const out: string[] = [];
    let last: unknown = null;
    for (let t = 0; t < TICKS_DAY * 96; t++) {
      step(g);
      if (t % 20000 === 0) await new Promise((r) => setTimeout(r, 0));
      if (t === 2500) queue(g);
      if (t % 3000 === 2999) upkeep(g);
      if (t % 50 === 0) alarm(g);
      if (t === TICKS_DAY * 20) raid(g, 2);
      // the log is capped, so read new lines from the end rather than by index
      const fresh: typeof g.log = [];
      for (let k = g.log.length - 1; k >= 0 && g.log[k] !== last; k--) fresh.unshift(g.log[k]);
      last = g.log[g.log.length - 1];
      for (const l of fresh) if (l.tick >= from * TICKS_DAY && (l.kind === 'death' || /transformed|tantrum|returned to dwarven|bitten|ghost|rises|collapsed|flees|thralls/.test(l.text))) out.push(`d${(l.tick / TICKS_DAY).toFixed(1)} pop${g.dwarves().length} ${l.text.slice(0, 140)}`);
      if (t % (TICKS_DAY * 3) === 0 && t >= from * TICKS_DAY) {
        const ds = g.dwarves();
        const jobs: Record<string, number> = {};
        for (const u of ds) jobs[u.job?.type || 'none'] = (jobs[u.job?.type || 'none'] || 0) + 1;
        const foes = Array.from(g.units.values()).filter((u) => u.faction === 'enemy');
        out.push(`  == d${t / TICKS_DAY} pop ${ds.length} drafted ${ds.filter((u) => u.drafted).length} down ${ds.filter((u) => u.downSince).length} mood ${Math.round(ds.reduce((a, u) => a + u.mood, 0) / (ds.length || 1))} jobs ${JSON.stringify(jobs)} foes ${foes.map((f) => f.kind).join(',')} | alerts: ${g.alerts.map((a) => a.text).join(' / ')}`);
      }
    }
    console.log(out.join('\n'));
  }
}, 900000);
test('diagnostics are opt-in', () => {});
