// HTML for the side panel, modals and top bar. Pure functions of the game state:
// main.ts re-renders them a few times a second and handles the data-a="action" clicks.
import {
  BUILDINGS, CATS, CREATURES, CROPS, F, ITEMS, LABORS, LABOR_HELP, LABOR_NAME, MATS, PARTS, PLANTS, RECIPES, SKILLS, SKILL_LEVELS, T, TICKS_DAY, plantOf, recipesFor,
} from '../sim/defs';
import { BUY_MARKUP, tradeCan, tradeable } from '../sim/events';
import { Game } from '../sim/game';
import {
  DG_LABOR, DG_NAME, billStock, cropCan, explainTask, isHospitalBed, missingFor, recipeIngs, ripe, tryBill, tryBuild, tryBury, tryDeconstruct, tryDesig, tryHarvest, tryHaul,
  tryHunt, tryPlant, tryPull, trySlaughter,
} from '../sim/jobs';
import { SOBER_SICK, SOBER_SLOW, explainUnit, woundText } from '../sim/life';
import type { Building, Unit, Zone } from '../sim/types';
import { X, Y, Z } from '../sim/world';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const btn = (label: string, a: string, v: string | number = '', cls = '', title = '') => `<button data-a="${a}" data-v="${v}" class="${cls}" title="${esc(title)}">${label}</button>`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const bar = (label: string, frac: number, color: string, note = '') =>
  `<div class="bar"><span>${label}</span><i><b style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 20) * 5}%;background:${color}"></b></i><em>${note}</em></div>`;
const tone = (frac: number) => (frac > 0.5 ? '#6ac46a' : frac > 0.25 ? '#e0b040' : '#e05a4a');
const whys = (lines: string[]) => lines.map((l) => `<div class="why">${esc(l)}</div>`).join('');

// ------------------------------------------------------------------ unit
export function unitPanel(g: Game, u: Unit, nSel: number): string {
  const e = explainUnit(g, u);
  const d = CREATURES[u.kind];
  let h = `<div class="box"><h2><span>${esc(u.isDwarf ? u.name : cap(g.unitName(u)))}</span>${btn('×', 'deselect')}</h2>`;
  if (u.isDwarf) h += `<div class="sub">${g.profession(u)} · age ${u.age} · ${u.trait} · likes ${esc(u.likes)}</div>`;
  else h += `<div class="sub">${u.faction === 'fort' ? 'Tame' : u.faction === 'enemy' ? 'Hostile' : u.faction === 'merchant' ? 'Visitor' : d.predator ? 'Wild predator' : 'Wild animal'}</div>`;
  if (nSel > 1) h += `<div class="sub amber">${nSel} dwarves selected — right-click orders go to all of them</div>`;
  h += `<div class="status ${e.tone}">${esc(e.status)}</div>${whys(e.lines)}`;
  h += '<div class="row">';
  h += btn('Go to', 'center', u.id);
  if (u.isDwarf && u.faction === 'fort') {
    h += btn(u.drafted ? 'Undraft <kbd>R</kbd>' : 'Draft <kbd>R</kbd>', 'draft', '', u.drafted ? 'on' : '', 'Drafted dwarves stop working, fight nearby enemies and go where you right-click');
    h += btn('Militia', 'militia', u.id, u.militia ? 'on' : '', 'Militia dwarves drop their work and fight raiders on their own, without being drafted');
    if (u.job && u.job.type !== 'idle' && !u.downSince) h += btn('Cancel job', 'canceljob', u.id);
  } else if (u.faction === 'wild' && !d.water && u.kind !== 'ghost') h += btn(u.hunted ? 'Stop hunting' : 'Mark for hunting', 'hunt', u.id, u.hunted ? 'on' : '');
  else if (u.faction === 'fort') h += btn(u.slaughter ? 'Spare' : 'Mark for slaughter', 'slaughter', u.id, u.slaughter ? 'on' : '');
  h += '</div>';
  if (u.hunted) h += whys(['Hunt — ' + explainTask(g, 'hunt', (x) => tryHunt(g, x, u), 'u' + u.id)]);
  if (u.slaughter) h += whys(['Slaughter — ' + explainTask(g, 'cook', (x) => trySlaughter(g, x, u), 'u' + u.id)]);

  h += '<h3>Condition</h3>';
  const hp = u.hp / u.maxHp;
  h += bar('Health', hp, tone(hp), `${Math.round(hp * 100)}%`);
  if (u.blood < 99) h += bar('Blood', u.blood / 100, tone(u.blood / 100), `${Math.round(u.blood)}%`);
  if (u.isDwarf) {
    h += bar('Mood', u.mood / 100, tone(u.mood / 100), u.mood > 75 ? 'content' : u.mood > 45 ? 'fine' : u.mood > 25 ? 'unhappy' : 'miserable');
    h += bar('Food', 1 - u.hunger / 100, tone(1 - u.hunger / 100), u.hunger > 100 ? 'starving' : u.hunger > 55 ? 'hungry' : 'fed');
    h += bar('Thirst', 1 - u.thirst / 100, tone(1 - u.thirst / 100), u.thirst > 100 ? 'dehydrated' : u.thirst > 50 ? 'thirsty' : 'quenched');
    h += bar('Rest', 1 - u.tired / 100, tone(1 - u.tired / 100), u.tired > 80 ? 'tired' : 'rested');
    const sob = 1 - u.sober / SOBER_SICK;
    const wear = u.wear ?? 100;
    h += bar('Clothes', wear / 100, tone(wear / 100), wear <= 0 ? 'naked' : wear < 25 ? 'tattered' : wear < 60 ? 'worn' : 'fine');
    h += bar('Booze', sob, u.sober > SOBER_SLOW ? '#e05a4a' : '#d0a040', u.sober > SOBER_SLOW ? `${(u.sober / TICKS_DAY).toFixed(1)}d sober!` : 'tipsy');
  }
  if (u.wounds.length) h += `<h3>Wounds</h3><div class="list">${u.wounds.map((w) => `<div class="${w.treated ? '' : 'red'}">${esc(woundText(w))}</div>`).join('')}</div>`;
  void PARTS;

  if (u.isDwarf) {
    const th = u.thoughts.slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 8);
    if (th.length) h += `<h3>Thoughts</h3><div class="list">${th.map((t) => `<div class="${t.v < 0 ? 'neg' : 'pos'}">${t.v > 0 ? '+' : ''}${t.v} ${esc(t.text)}${(t.n || 1) > 1 ? ` ×${t.n}` : ''}</div>`).join('')}</div>`;
    h += `<h3>Labors <span style="text-transform:none;letter-spacing:0">(click to cycle priority; 1 is done first)</span></h3><div>`;
    for (const l of LABORS) {
      const p = u.labors[l];
      const sk = l === 'haul' ? '' : SKILL_LEVELS[g.skillLevel(u, l)];
      h += `<span class="lab ${p ? 'on' : ''}" data-a="labor" data-v="${u.id}:${l}" title="${esc(LABOR_HELP[l])}${sk ? ' — ' + sk : ''}">${LABOR_NAME[l]}${p ? ` <b>${p}</b>` : ''}</span>`;
    }
    h += '</div>';
    const sk = SKILLS.filter((s) => g.skillLevel(u, s) > 0).sort((a, b) => u.skills[b] - u.skills[a]);
    if (sk.length) h += `<h3>Skills</h3><div class="list"><div>${sk.map((s) => `${SKILL_LEVELS[g.skillLevel(u, s)]} ${s === 'fight' ? 'fighter' : LABOR_NAME[s as keyof typeof LABOR_NAME].toLowerCase()}`).join(' · ')}</div></div>`;
  }
  const gear = Object.entries(u.equip).map(([slot, id]) => {
    const it = g.items.get(id);
    return it ? `<div><span class="sub">${slot}:</span> ${esc(g.itemName(it))}</div>` : '';
  }).join('');
  const carry = g.items.get(u.carry);
  if (gear || carry) h += `<h3>Equipment</h3><div class="list">${gear}${carry ? `<div><span class="sub">carrying:</span> ${esc(g.itemName(carry))}</div>` : ''}</div>`;
  if (u.kills) h += `<div class="sub" style="margin-top:6px">Kills: ${u.kills}</div>`;
  return h + '</div>';
}

// ------------------------------------------------------------------ building
export function buildingPanel(g: Game, b: Building, linking: boolean): string {
  const d = BUILDINGS[b.type];
  let h = `<div class="box"><h2><span>${esc(cap(g.buildingName(b)))}</span>${btn('×', 'deselect')}</h2><div class="sub">${esc(d.desc)}</div>`;
  if (!b.built) {
    const missing = missingFor(g, b);
    h += `<div class="status warn">${b.suspended ? 'Suspended' : missing ? 'Waiting for materials' : `Under construction ${Math.round((b.progress / d.work) * 100)}%`}</div>`;
    if (!b.suspended) h += whys([explainTask(g, 'build', (u) => tryBuild(g, u, b), 'b' + b.id)]);
    h += `<div class="row">${btn(b.suspended ? 'Resume' : 'Suspend', 'suspend', b.id)}${btn('Cancel construction', 'cancelbuild', b.id, 'danger')}</div>`;
    return h + '</div>';
  }
  if (b.remove) h += `<div class="status warn">Marked for removal</div>${whys([explainTask(g, 'build', (u) => tryDeconstruct(g, u, b), 'b' + b.id)])}`;
  h += `<div class="row">${btn(b.remove ? 'Keep it' : 'Remove', 'remove', b.id, b.remove ? 'on' : 'danger')}`;
  if (b.type === 'door') h += btn(b.locked ? 'Unlock' : 'Lock', 'lock', b.id, b.locked ? 'on' : '', 'A locked door stops everyone, friend and foe');
  h += '</div>';
  if (b.type === 'door' && b.locked) h += whys(['Locked: nobody can pass. Dwarves on the wrong side will report "no path".']);
  if (b.type === 'bed') {
    const o = g.units.get(b.owner);
    h += whys([isHospitalBed(g, b) ? 'Hospital bed: the wounded are carried here.' : o ? `Belongs to ${o.name}.` : 'Unclaimed: the next sleepy dwarf will take it. (Put it inside a Hospital zone to make it a hospital bed.)']);
  }
  if (b.type === 'coffin') h += whys([b.corpse ? `Here lies ${b.corpse}.` : 'Empty.']);
  if (b.type === 'cagetrap') {
    const c = g.units.get(b.caged || 0);
    h += whys([c ? `Holding ${g.unitName(c)}. Removing the trap sets it loose.` : 'Armed.']);
  }
  if (b.type === 'bridge' || b.type === 'floodgate') h += whys([b.type === 'bridge' ? (b.open ? 'Raised: the gap is open.' : 'Lowered: can be walked on.') : b.open ? 'Open: fluids and dwarves can pass.' : 'Closed.', 'Operated by a linked lever.']);
  if (b.type === 'lever') {
    h += `<h3>Lever</h3>`;
    const links = (b.links || []).map((id) => g.buildings.get(id)).filter((x): x is Building => !!x);
    h += `<div class="list">${links.map((t) => `<div>→ ${esc(g.buildingName(t))} ${btn('unlink', 'unlink', `${b.id}:${t.id}`)}</div>`).join('') || '<div class="sub">Not linked to anything yet.</div>'}</div>`;
    h += `<div class="row">${btn(linking ? 'Click a bridge, floodgate or door…' : 'Link to…', 'link', b.id, linking ? 'on' : '')}${btn(b.pull ? 'Pull ordered' : 'Pull the lever', 'pull', b.id, b.pull ? 'on' : '')}</div>`;
    if (b.pull) h += whys([explainTask(g, 'haul', (u) => tryPull(g, u, b), 'b' + b.id)]);
  }
  if (d.shop) {
    h += `<h3>Work orders</h3>`;
    if (!b.bills.length) h += '<div class="sub">Nothing queued. Add an order below; any dwarf with the right labor will work on it.</div>';
    b.bills.forEach((bill, k) => {
      const r = RECIPES[bill.recipe];
      const needs = recipeIngs(b, r).map((i) => `${i.n > 1 ? i.n + '× ' : ''}${i.tag === 'emptybarrel' ? 'empty barrel' : i.mat ? MATS.find((m) => m.id === i.mat)!.name + ' ' + i.type : i.sub ? plantOf(i.sub).name : Array.isArray(i.type) ? i.type.join('/') : i.type}`).join(' + ');
      h += `<div class="bill"><div><b>${esc(r.name)}</b> <span class="sub">(${LABOR_NAME[r.labor]}; ${esc(needs)})</span></div><div class="row">`;
      h += `<select data-a="billmode" data-v="${b.id}:${k}">${(['count', 'forever', 'until'] as const).map((m) => `<option value="${m}" ${bill.mode === m ? 'selected' : ''}>${m === 'count' ? 'Do X times' : m === 'forever' ? 'Forever' : 'Until you have X'}</option>`).join('')}</select>`;
      if (bill.mode !== 'forever') h += `${btn('−', 'billn', `${b.id}:${k}:-1`)}<b>${bill.n}</b>${btn('+', 'billn', `${b.id}:${k}:1`)}${bill.mode === 'until' ? `<span class="sub">have ${billStock(g, r)}</span>` : ''}`;
      h += `${btn(bill.paused ? 'Resume' : 'Pause', 'billpause', `${b.id}:${k}`, bill.paused ? 'on' : '')}${btn('▲', 'billup', `${b.id}:${k}`)}${btn('✕', 'billdel', `${b.id}:${k}`, 'danger')}</div>`;
      if (!bill.paused) {
        const why = explainTask(g, r.labor, (u) => tryBill(g, u, b, k), 'b' + b.id);
        const fine = / is on it| will get to it|can do it, but is busy|Target reached|is using the workshop/.test(why);
        h += `<div class="${fine ? 'sub' : 'stuck'}">${fine ? '' : '⚠ '}${esc(why)}</div>`;
      }
      h += '</div>';
    });
    h += `<div class="row"><select data-a="addbill" data-v="${b.id}"><option value="">+ Add work order…</option>${recipesFor(b.type).map((r) => `<option value="${r.id}">${esc(r.name)}</option>`).join('')}</select></div>`;
  }
  return h + '</div>';
}

// ------------------------------------------------------------------ zone
export function zonePanel(g: Game, z: Zone): string {
  let h = `<div class="box"><h2><span>${esc(z.name)}</span>${btn('×', 'deselect')}</h2><div class="sub">${z.cells.length} tiles</div>`;
  if (z.kind === 'stockpile') {
    h += '<h3>Accepts</h3><div>';
    for (const c of CATS) h += `<span class="lab ${z.cats.includes(c) ? 'on' : ''}" data-a="cat" data-v="${z.id}:${c}">${c}</span>`;
    h += `</div><div class="row">${btn('All', 'catall', z.id)}${btn('None', 'catnone', z.id)}</div>`;
    const used = z.cells.filter((c) => g.itemsAt.has(c)).length;
    h += whys([`${used} / ${z.cells.length} tiles in use.${used >= z.cells.length ? ' Full: make it bigger or add another.' : ''}`]);
  } else if (z.kind === 'farm') {
    h += `<h3>Crop</h3><div class="row"><select data-a="crop" data-v="${z.id}">${CROPS.map((p) => `<option value="${p.id}" ${z.crop === p.id ? 'selected' : ''}>${p.name} (${g.count((i) => i.type === 'seed' && i.sub === p.id)} seeds)${p.under ? '' : ' — outdoor'}</option>`).join('')}</select></div>`;
    const p = plantOf(z.crop);
    h += `<div class="sub">${p.drink ? `Brews into ${p.drink}. ` : ''}${p.raw ? 'Edible raw. ' : ''}${p.cook ? 'Cookable. ' : ''}${p.cloth ? 'Weaves into cloth. ' : ''}Grows in ${Math.round((p.grow || 0) / TICKS_DAY)} days.</div>`;
    const planted = z.cells.filter((c) => g.crops.has(c));
    const ready = planted.filter((c) => ripe(g, c));
    h += whys([`${planted.length} / ${z.cells.length} planted, ${ready.length} ready to harvest.`]);
    const empty = z.cells.find((c) => !g.crops.has(c));
    if (empty !== undefined) {
      const can = cropCan(g, empty, z.crop);
      h += whys(['Planting — ' + (can.ok ? explainTask(g, 'farm', (u) => tryPlant(g, u, z, empty), 'f' + empty) : `cannot plant here: ${can.why}`)]);
    }
    if (ready.length) h += whys(['Harvest — ' + explainTask(g, 'farm', (u) => tryHarvest(g, u, ready[0]), 'f' + ready[0])]);
  } else if (z.kind === 'meeting') h += whys(['Idle dwarves and pets gather here. Tables, chairs and statues nearby make it a dining hall.']);
  else if (z.kind === 'hospital') h += whys([`Beds placed in this zone are hospital beds (${Array.from(g.buildings.values()).filter((b) => b.type === 'bed' && b.built && g.zoneOfKind(g.center(b), 'hospital') === z).length} here). Doctors carry the wounded to them and treat them. Stock cloth and splints for faster healing.`]);
  else if (z.kind === 'fishing') h += whys([z.cells.some((c) => g.w.safe(c) && g.w.waterNear(c) >= 0) ? 'Dwarves with the Fish labor will fish here.' : '⚠ No shore tiles: the zone must include walkable ground next to water.', 'Mind the carp.']);
  else if (z.kind === 'pasture') h += whys(['Tame animals wander here instead of the meeting hall.']);
  h += `<div class="row">${btn('Delete zone', 'delzone', z.id, 'danger')}</div>`;
  return h + '</div>';
}

// ------------------------------------------------------------------ tile
export function tileText(g: Game, cell: number): string {
  const w = g.w;
  if (!w.revealed(cell)) return 'Unexplored rock';
  const m = MATS[w.mat[cell]];
  const f = w.flag[cell];
  const t = w.tile[cell];
  const built = f & F.Built ? 'constructed ' : f & F.Engraved ? 'engraved ' : f & F.Smooth ? 'smooth ' : '';
  let s = '';
  if (t === T.Wall) s = `${built}${m.name} wall${m.kind === 'ore' ? ' (ore)' : m.kind === 'gem' ? ' (gem)' : ''}`;
  else if (t === T.Tree) s = `${PLANTS[w.plant[cell]].name} tree`;
  else if (t === T.Open) s = 'open space';
  else s = `${built}${m.name} ${t === T.Ramp ? 'ramp' : t === T.Stair ? 'stairs' : 'floor'}`;
  if (t === T.Floor && w.plant[cell] && PLANTS[w.plant[cell]].kind === 'shrub') s += `, ${PLANTS[w.plant[cell]].name}`;
  if (f & F.Mud && t !== T.Wall) s += ', muddy';
  if (w.water[cell]) s += `, water ${w.water[cell]}/7`;
  if (w.magma[cell]) s += `, MAGMA ${w.magma[cell]}/7`;
  return s;
}
export function cellPanel(g: Game, cell: number): string {
  const w = g.w;
  let h = `<div class="box"><h2><span>${esc(cap(tileText(g, cell)))}</span>${btn('×', 'deselect')}</h2><div class="sub">x ${X(cell)}, y ${Y(cell)}, level ${Z(cell) - g.embark.z} · ${w.revealed(cell) ? (w.outside(cell) ? 'outdoors' : 'underground') : ''}</div>`;
  const d = w.desig[cell];
  if (d) {
    h += `<div class="status warn">Designated: ${DG_NAME[d]}</div>`;
    h += whys([explainTask(g, DG_LABOR[d], (u) => tryDesig(g, u, cell), 'd' + cell)]);
    h += `<div class="row">${btn('Cancel designation', 'undesig', cell)}</div>`;
  }
  const crop = g.crops.get(cell);
  if (crop) {
    const p = plantOf(crop.plant);
    h += whys([ripe(g, cell) ? `${cap(p.name)}: ripe.` : `${cap(p.name)}: growing, ${Math.max(0, ((p.grow || 0) - (g.tick - crop.t)) / TICKS_DAY).toFixed(1)} days to go.`]);
  }
  const items = g.itemsIn(cell);
  if (items.length) {
    h += '<h3>Items here</h3><div class="list">';
    for (const it of items) {
      const who = it.res ? g.units.get(it.res) : undefined;
      let note = '';
      if (it.forbid) note = 'forbidden: dwarves will not touch it';
      else if (who) note = `reserved by ${who.name.split(' ')[0]}`;
      else if (g.stored(it)) note = 'in stockpile';
      else if (it.type === 'corpse' && it.dwarf) note = explainTask(g, 'haul', (u) => tryBury(g, u, it));
      else note = explainTask(g, 'haul', (u) => tryHaul(g, u, it));
      h += `<div>${esc(g.itemName(it))} <span class="sub">${g.itemValue(it)}☼</span> ${btn(it.forbid ? 'allow' : 'forbid', 'forbid', it.id, it.forbid ? 'on' : '')}<br><span class="sub">${esc(note)}</span></div>`;
    }
    h += '</div>';
  }
  void ITEMS;
  return h + '</div>';
}

// ------------------------------------------------------------------ modals
export function laborsModal(g: Game): string {
  const ds = g.dwarves();
  let h = `<h2><span>Labors</span>${btn('Close', 'closemodal')}</h2><div class="sub" style="margin-bottom:6px;white-space:normal;max-width:900px">Click a cell to cycle priority: blank = never, 1 = first … 4 = last. Brighter cells mean more skill. A dwarf looks for work in priority order, nearest job first. You can always override by selecting a dwarf and right-clicking the job.</div><table><tr><th>Dwarf</th><th>Doing</th>`;
  for (const l of LABORS) h += `<th title="${esc(LABOR_HELP[l])}">${LABOR_NAME[l]}</th>`;
  h += '</tr>';
  for (const u of ds) {
    const e = explainUnit(g, u);
    h += `<tr><td data-a="pick" data-v="${u.id}" style="cursor:pointer">${esc(u.name)}</td><td class="${e.tone === 'bad' ? 'red' : e.tone === 'warn' ? 'amber' : 'sub'}" title="${esc(e.lines.join(' | '))}">${esc(e.status.slice(0, 34))}</td>`;
    for (const l of LABORS) {
      const lvl = l === 'haul' ? 0 : g.skillLevel(u, l);
      h += `<td class="lc" data-a="labor" data-v="${u.id}:${l}" style="background:rgba(232,184,74,${(lvl / 15) * 0.6 + (u.labors[l] ? 0.12 : 0)})" title="${l === 'haul' ? '' : SKILL_LEVELS[lvl]}">${u.labors[l] || ''}</td>`;
    }
    h += '</tr>';
  }
  return h + '</table>';
}
export function stocksModal(g: Game): string {
  const by = new Map<string, Map<string, { n: number; v: number }>>();
  for (const it of g.items.values()) {
    if (!g.onGround(it)) continue;
    const cat = ITEMS[it.type].cat;
    let m = by.get(cat);
    if (!m) by.set(cat, (m = new Map()));
    const name = g.itemName(it, true) + (it.forbid ? ' (forbidden)' : '');
    const e = m.get(name) || { n: 0, v: 0 };
    e.n += it.n;
    e.v += g.itemValue(it);
    m.set(name, e);
  }
  let h = `<h2><span>Stocks — fortress wealth ${g.wealth}☼</span>${btn('Close', 'closemodal')}</h2><div style="display:flex;flex-wrap:wrap;gap:14px;max-width:1000px">`;
  for (const cat of CATS) {
    const m = by.get(cat);
    if (!m) continue;
    h += `<div><h3 class="amber" style="margin:0 0 3px">${cap(cat)}</h3><table>${Array.from(m.entries()).sort((a, b) => b[1].n - a[1].n).map(([n, e]) => `<tr><td>${esc(n)}</td><td>${e.n}</td><td class="sub">${e.v}☼</td></tr>`).join('')}</table></div>`;
  }
  return h + '</div>';
}
export function tradeModal(g: Game, sell: Set<number>, buy: Set<number>, msg: string): string {
  let h = `<h2><span>Trade${g.caravan ? ` — ${g.caravan.civ} caravan` : ''}</span>${btn('Close', 'closemodal')}</h2>`;
  const no = tradeCan(g);
  if (no) return h + `<div class="why" style="max-width:520px">${esc(no)}</div>`;
  const cv = g.caravan!;
  let offer = 0, ask = 0;
  const mine = tradeable(g);
  for (const it of mine) if (sell.has(it.id)) offer += g.itemValue(it);
  cv.goods.forEach((it, k) => {
    if (buy.has(k)) ask += g.itemValue(it) * BUY_MARKUP;
  });
  h += `<div class="sub" style="margin-bottom:6px">Click items to offer / request. The merchants leave in ${Math.max(0, (cv.leave - g.tick) / TICKS_DAY).toFixed(1)} days.</div><div class="trade"><div><div class="amber">Your goods — offering ${Math.round(offer)}☼</div><div class="col">`;
  for (const it of mine) h += `<div class="it ${sell.has(it.id) ? 'pick' : ''}" data-a="sell" data-v="${it.id}"><span>${esc(g.itemName(it))}</span><span>${g.itemValue(it)}☼</span></div>`;
  h += `</div></div><div><div class="amber">Their goods — asking ${Math.round(ask)}☼</div><div class="col">`;
  cv.goods.forEach((it, k) => {
    h += `<div class="it ${buy.has(k) ? 'pick' : ''}" data-a="buy" data-v="${k}"><span>${esc(g.itemName(it))}</span><span>${Math.round(g.itemValue(it) * BUY_MARKUP)}☼</span></div>`;
  });
  h += `</div></div></div><div class="row" style="margin-top:8px">${btn('Trade', 'dotrade', '', offer >= ask && (offer || ask) ? 'on' : '')}<span class="${offer >= ask ? 'pos' : 'neg'}">${offer >= ask ? 'They will accept.' : `Offer ${Math.round(ask - offer)}☼ more.`}</span> <span class="red">${esc(msg)}</span></div>`;
  return h;
}
export const HELP = `<h2><span>How to play</span><button data-a="closemodal">Close</button></h2><div class="help">
<p><b class="amber">The idea:</b> Dwarf Fortress underneath, RimWorld on top. You never control dwarves directly unless you want to — you mark work, and dwarves with the matching <i>labor</i> do it. But whenever something is not happening, the game tells you why.</p>
<h3>Why is nothing happening?</h3>
<p>• <b>Left-click a dwarf</b>: the panel shows what they are doing and, if idle or stuck, the exact reason ("needs a pick: none in the fortress", "no path to it").<br>
• <b>Left-click a designated tile, building, farm or item</b>: it says who is on it, or why nobody is.<br>
• <b>Alerts</b> (top-left): hover for the explanation and the fix, click to jump there.</p>
<h3>Giving orders (RimWorld style)</h3>
<p>• <b>Select a dwarf, then right-click</b> anything: a menu lists what they can do there. Choosing one overrides whatever they were doing. Options that are impossible are greyed out <i>with the reason</i>. A dwarf does not need the labor enabled to be ordered directly.<br>
• Raids pause the game. Dwarves marked <b>Militia</b> fight raiders on their own; everyone else runs.<br>
• <b>Drag</b> to select several dwarves; <b>R</b> drafts them. Drafted dwarves stop working, fight what comes near and go where you right-click.</p>
<h3>First steps</h3>
<p>1. <b>Orders → Chop</b> some trees, <b>Zones → Stockpile</b> near the wagon.<br>
2. <b>Orders → Stairs</b>: drag on the same tile on several levels (<kbd>Q</kbd>/<kbd>E</kbd> change level) to dig a stairwell, then <b>Mine</b> rooms off it.<br>
3. <b>Zones → Farm</b> on underground soil; pick plump helmets. <b>Build → Workshops → Still</b>, add a "Brew drink" order. <span class="amber">Dwarves need alcohol: without it they slow down, despair and eventually die.</span><br>
4. Brewing and eating use the same plants: farm enough for both. Carpenter → beds; Mason → tables, chairs, doors, coffins. Place them with <b>Build → Furniture</b>.<br>
5. Dig deeper for ore, caverns, magma… and whatever is at the bottom.</p>
<h3>Things you can exploit</h3>
<p>• A lowering <b>drawbridge</b> obliterates anything underneath it. Anything.<br>• <b>Cage traps</b> catch any hostile, regardless of size.<br>• Water + magma = obsidian. Floodgates + levers = plumbing (and drowning chambers).<br>• Muddy stone floors can be farmed. Magma forges need no fuel. Goblins path through the only open door.</p>
<h3>Keys</h3>
<p><kbd>WASD</kbd>/arrows pan · <kbd>Q</kbd> <kbd>E</kbd> (or Shift+wheel, or the gauge on the left) level down/up · wheel zoom · <kbd>Space</kbd> pause · <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> speed · <kbd>R</kbd> draft · <kbd>L</kbd> labors · <kbd>K</kbd> stocks · <kbd>T</kbd> trade · <kbd>M</kbd> music · <kbd>G</kbd> tiles / ASCII · <kbd>Esc</kbd> cancel tool / deselect · <kbd>F</kbd> jump to selected · <kbd>H</kbd> this help</p></div>`;
