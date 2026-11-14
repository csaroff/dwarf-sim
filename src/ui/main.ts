// The game shell: input, tools, selection, the context menu and the frame loop.
import { BUILDINGS, D, H, LABORS, Labor, RECIPES, CATS, W, Cat } from '../sim/defs';
import { trade } from '../sim/events';
import { Game } from '../sim/game';
import { DG, DG_NAME, canPlace, endJob, placeBuilding, validDesig } from '../sim/jobs';
import { explainUnit } from '../sim/life';
import { cannotOrder, optionsAt, order, setDraft } from '../sim/orders';
import { newGame, step } from '../sim/sim';
import type { Option, Unit, Zone } from '../sim/types';
import { WH, X, Y, Z, idx } from '../sim/world';
import { CAVERN1_Z, CAVERN2_Z, MAGMA_Z } from '../sim/worldgen';
import { HELP, buildingPanel, cellPanel, esc, laborsModal, stocksModal, tileText, tradeModal, unitPanel, zonePanel } from './panels';
import { Overlay, Renderer } from './render';
import { loadSave, writeSave } from './save';

const $ = (id: string) => document.getElementById(id)!;
const canvas = $('map') as HTMLCanvasElement;
const R = new Renderer(canvas);
const music = $('music') as HTMLAudioElement;
music.volume = 0.45;

let g: Game;
let speed = 1; // 0 paused, 1, 2, 3
const TPF = [0, 0.5, 2, 8]; // sim ticks per frame
let tickDebt = 0;
const ov: Overlay = { hover: -1, selUnits: new Set(), selBuilding: 0, selCell: -1, selZone: 0, rect: null };
let modal: '' | 'labors' | 'stocks' | 'trade' | 'help' = '';
let linking = 0; // lever id being linked
const sell = new Set<number>(), buy = new Set<number>();
let tradeMsg = '';

// ------------------------------------------------------------------ tools
interface Tool {
  id: string;
  label: string;
  desc: string;
  desig?: number;
  zone?: Zone['kind'];
  build?: string;
  erase?: 'desig' | 'zone';
}
const TOOLS: Record<string, Tool[]> = {
  Orders: [
    { id: 'dig', label: 'Mine', desig: DG.Dig, desc: 'Dig out walls, leaving a floor. Drag a rectangle. Unexplored rock can be marked too.' },
    { id: 'stair', label: 'Stairs', desig: DG.Stair, desc: 'Carve up/down stairs. Stairs connect to stairs directly above and below: mark the same tile on each level (Q / E change level).' },
    { id: 'channel', label: 'Channel', desig: DG.Channel, desc: 'Dig a hole in the floor, leaving a ramp on the level below. Good for moats, wells and pits. Careful: a piece of floor or rock cut off from everything around it caves in, along with whoever is on it.' },
    { id: 'ramp', label: 'Ramp', desig: DG.Ramp, desc: 'Carve a wall into a ramp up to the level above.' },
    { id: 'chop', label: 'Chop trees', desig: DG.Chop, desc: 'Fell trees for logs (needs an axe).' },
    { id: 'gather', label: 'Gather plants', desig: DG.Gather, desc: 'Pick wild shrubs: berries to eat and brew.' },
    { id: 'smooth', label: 'Smooth', desig: DG.Smooth, desc: 'Smooth natural stone walls and floors. Nicer rooms make happier dwarves.' },
    { id: 'engrave', label: 'Engrave', desig: DG.Engrave, desc: 'Engrave smoothed stone. Dwarves admire engravings.' },
    { id: 'unbuild', label: 'Remove construction', desig: DG.Remove, desc: 'Tear down constructed walls, floors, stairs and ramps.' },
    { id: 'cancel', label: 'Cancel orders', erase: 'desig', desc: 'Erase designations in the rectangle.' },
  ],
  Zones: [
    { id: 'z_stockpile', label: 'Stockpile', zone: 'stockpile', desc: 'Haulers bring loose items here. Click a stockpile afterwards to choose what it accepts.' },
    { id: 'z_farm', label: 'Farm plot', zone: 'farm', desc: 'Needs soil or mud. Plump helmets and other cave crops grow underground; berries outdoors.' },
    { id: 'z_meeting', label: 'Meeting hall', zone: 'meeting', desc: 'Where idle dwarves gather.' },
    { id: 'z_hospital', label: 'Hospital', zone: 'hospital', desc: 'Beds inside become hospital beds: the wounded are carried here and treated.' },
    { id: 'z_fishing', label: 'Fishing', zone: 'fishing', desc: 'Mark shore tiles next to water.' },
    { id: 'z_pasture', label: 'Pasture', zone: 'pasture', desc: 'Where tame animals graze.' },
    { id: 'z_remove', label: 'Remove zone', erase: 'zone', desc: 'Remove zone tiles in the rectangle.' },
  ],
};
const MENUS: [string, string][] = [['Structure', 'structure'], ['Furniture', 'furniture'], ['Workshops', 'production'], ['Machines', 'machines']];
for (const [name, menu] of MENUS) TOOLS[name] = Object.values(BUILDINGS).filter((b) => b.menu === menu).map((b) => ({ id: 'b_' + b.id, label: b.name, build: b.id, desc: `${b.desc} Needs: ${b.needs.map((n) => `${n.n}× ${Array.isArray(n.type) ? (n.type.length > 4 ? 'melee weapon' : n.type.join('/')) : n.type}`).join(' + ')}.` }));
/** one-tile buildings that are laid by dragging a line or rectangle */
const LINES = ['axle', 'fortification', 'weapontrap', 'cagetrap', 'stonetrap'];
let cat = '';
let tool: Tool | null = null;
let drag: { x: number; y: number; cell: number; pan: boolean; cx: number; cy: number } | null = null;

// ------------------------------------------------------------------ selection helpers
const selected = (): Unit[] => Array.from(ov.selUnits).map((i) => g.units.get(i)).filter((u): u is Unit => !!u && !u.dead);
const primary = () => selected()[0];
function deselect() {
  ov.selUnits.clear();
  ov.selBuilding = 0;
  ov.selCell = -1;
  ov.selZone = 0;
  linking = 0;
}
function selectUnit(u: Unit, add = false) {
  if (!add) deselect();
  ov.selBuilding = 0;
  ov.selCell = -1;
  ov.selZone = 0;
  ov.selUnits.add(u.id);
}
function jump(x: number, y: number, z: number) {
  R.center(x, y, z);
}
const orderable = () => selected().filter((u) => u.isDwarf && u.faction === 'fort');

/** Looking down through open air you see the ground below: clicks and orders apply to what is visible. */
function seen(cell: number): number {
  if (cell < 0) return cell;
  let c = cell;
  for (let k = 0; k < 4 && c >= WH && g.w.tile[c] === 0 && !g.w.water[c] && !g.w.magma[c] && !g.bAt.has(c) && g.w.revealed(c); k++) c -= WH;
  return g.w.tile[c] === 0 ? cell : c;
}

// ------------------------------------------------------------------ rectangles
function rectOf(a: number, b: number) {
  return { x0: Math.min(X(a), X(b)), y0: Math.min(Y(a), Y(b)), x1: Math.max(X(a), X(b)), y1: Math.max(Y(a), Y(b)) };
}
function rectCells(a: number, b: number): number[] {
  const r = rectOf(a, b), out: number[] = [];
  for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) out.push(idx(x, y, R.cam.z));
  return out;
}
/** where a building of the current tool would go for the hover cell (and drag start) */
function footprint(t: Tool, a: number, b: number) {
  const d = BUILDINGS[t.build!];
  if (d.tile !== undefined || t.build === 'bridge' || LINES.includes(t.build!)) return rectOf(a, b);
  const x0 = X(b) - (d.w >> 1), y0 = Y(b) - (d.h >> 1);
  return { x0, y0, x1: x0 + d.w - 1, y1: y0 + d.h - 1 };
}

function applyTool(t: Tool, a: number, b: number) {
  const cells = rectCells(a, b);
  if (t.desig) {
    let n = 0, why = '';
    const surface = t.desig === DG.Chop || t.desig === DG.Gather;
    for (const c0 of cells) {
      const c = surface ? seen(c0) : c0;
      const v = validDesig(g, c, t.desig);
      if (v.ok && !g.bAt.has(c)) {
        g.designate(c, t.desig);
        n++;
      } else if (!v.ok) why = v.why;
    }
    if (!n && why) flash(why);
  } else if (t.erase === 'desig') {
    for (const c of cells) for (const k of [c, seen(c)]) if (g.w.desig[k]) g.designate(k, 0);
  } else if (t.erase === 'zone') {
    g.removeZoneCells(cells);
    g.w.version++;
  } else if (t.zone) {
    const ok = cells.filter((c) => g.w.revealed(c) && (g.w.isWalkTile(c) || (t.zone === 'stockpile' && false)));
    if (!ok.length) return flash('Zones go on revealed floor tiles');
    const z = g.addZone(t.zone, ok);
    g.w.version++;
    if (g.zones.has(z.id)) {
      deselect();
      ov.selZone = z.id;
    }
  } else if (t.build) {
    const d = BUILDINGS[t.build];
    const r = footprint(t, a, b);
    if (d.tile !== undefined || LINES.includes(t.build)) {
      let n = 0, why = '';
      for (const c of cells) {
        const can = canPlace(g, t.build, X(c), Y(c), Z(c));
        if (can.ok) {
          placeBuilding(g, t.build, X(c), Y(c), Z(c));
          n++;
        } else why = can.why;
      }
      if (!n && why) flash(why);
      return;
    }
    const bw = r.x1 - r.x0 + 1, bh = r.y1 - r.y0 + 1;
    if (t.build === 'bridge' && (bw > 10 || bh > 10)) return flash('Bridges can be at most 10 × 10');
    const can = canPlace(g, t.build, r.x0, r.y0, R.cam.z, bw, bh);
    if (!can.ok) return flash(can.why);
    const bd = placeBuilding(g, t.build, r.x0, r.y0, R.cam.z, bw, bh);
    if (bd && d.shop) {
      // workshops are one-offs: select it so the player can queue work right away
      tool = null;
      deselect();
      ov.selBuilding = bd.id;
    }
  }
}
let flashMsg = '', flashUntil = 0;
function flash(msg: string) {
  flashMsg = msg;
  flashUntil = performance.now() + 3500;
}

// ------------------------------------------------------------------ context menu
const ctx = $('ctx');
let ctxOpts: Option[] = [];
let ctxCell = -1;
function openMenu(px: number, py: number, cell: number) {
  const us = orderable();
  let h = '';
  if (!us.length) {
    h = `<div class="hd">No dwarf selected</div><div class="o no">Orders<small>Left-click a dwarf (or a name in the roster at the top) first, then right-click here to tell them what to do.</small></div>`;
    ctxOpts = [];
  } else {
    const u = us[0];
    ctxOpts = optionsAt(g, u, cell);
    ctxCell = cell;
    h = `<div class="hd">${esc(u.name)}${us.length > 1 ? ` +${us.length - 1}` : ''} — ${esc(tileText(g, cell))}</div>`;
    if (!ctxOpts.length) h += `<div class="o no">Nothing to do here</div>`;
    ctxOpts.forEach((o, k) => {
      h += o.why ? `<div class="o no">${esc(o.label)}<small>✗ ${esc(o.why)}</small></div>` : `<div class="o" data-k="${k}">${esc(o.label)}</div>`;
    });
  }
  ctx.innerHTML = h;
  ctx.style.display = 'block';
  ctx.style.left = Math.min(px, window.innerWidth - ctx.offsetWidth - 6) + 'px';
  ctx.style.top = Math.min(py, window.innerHeight - ctx.offsetHeight - 6) + 'px';
}
const closeMenu = () => (ctx.style.display = 'none');
ctx.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  const el = (e.target as HTMLElement).closest('[data-k]') as HTMLElement | null;
  if (!el) return;
  const opt = ctxOpts[+el.dataset.k!];
  const us = orderable();
  // several dwarves: each gets the same order if they can do it; movers spread out around the spot
  const spots = [ctxCell, ...g.w.workSpots(ctxCell, false)];
  us.forEach((u, k) => {
    if (k === 0) return order(g, u, opt);
    const at = opt.job?.type === 'move' ? spots[k % spots.length] : ctxCell;
    const same = optionsAt(g, u, at).find((o) => o.label === opt.label);
    if (same) order(g, u, same);
  });
  closeMenu();
  ui();
});

// ------------------------------------------------------------------ mouse
const mouse = { x: 0, y: 0 };
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  closeMenu();
  const cell = R.cellAt(e.offsetX, e.offsetY);
  if (e.button === 1) {
    drag = { x: e.offsetX, y: e.offsetY, cell, pan: true, cx: R.cam.x, cy: R.cam.y };
    return;
  }
  if (e.button === 2) {
    if (tool || linking) {
      tool = null;
      linking = 0;
      ov.rect = null;
    } else if (cell >= 0) openMenu(e.clientX, e.clientY, seen(cell));
    ui();
    return;
  }
  if (cell < 0) return;
  drag = { x: e.offsetX, y: e.offsetY, cell, pan: false, cx: 0, cy: 0 };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  mouse.x = e.offsetX;
  mouse.y = e.offsetY;
  ov.hover = R.cellAt(e.offsetX, e.offsetY);
  if (drag?.pan) {
    R.cam.x = drag.cx - Math.round((e.offsetX - drag.x) / R.cam.tile);
    R.cam.y = drag.cy - Math.round((e.offsetY - drag.y) / R.cam.tile);
  }
});
canvas.addEventListener('pointerup', (e) => {
  const d = drag;
  drag = null;
  ov.rect = null;
  if (!d || d.pan || e.button !== 0) return;
  const cell = R.cellAt(e.offsetX, e.offsetY);
  if (cell < 0) return;
  if (tool) {
    applyTool(tool, d.cell, cell);
    return ui();
  }
  if (linking) {
    const lever = g.buildings.get(linking), t = g.buildingAt(cell);
    if (lever && t && ['bridge', 'floodgate', 'door', 'gear'].includes(t.type)) {
      lever.links = [...(lever.links || []).filter((i) => i !== t.id), t.id];
      linking = 0;
    } else flash('Levers link to bridges, floodgates, doors and gear assemblies');
    return ui();
  }
  if (cell !== d.cell) {
    // drag: select the dwarves inside
    const r = rectOf(d.cell, cell);
    const inside = g.dwarves().filter((u) => u.z === R.cam.z && u.x >= r.x0 && u.x <= r.x1 && u.y >= r.y0 && u.y <= r.y1);
    if (inside.length) {
      if (!e.shiftKey) deselect();
      inside.forEach((u) => selectUnit(u, true));
    }
    return ui();
  }
  click(seen(cell), e.shiftKey);
  ui();
});
function click(cell: number, add: boolean) {
  if (!g.w.revealed(cell)) {
    deselect();
    ov.selCell = cell;
    return;
  }
  // creatures first (clicking again cycles through a stack), then buildings, then the tile itself
  const us = g.unitsIn(cell);
  if (us.length) {
    const cur = us.findIndex((u) => ov.selUnits.has(u.id));
    const next = us[(cur + 1) % us.length];
    if (cur >= 0 && us.length === 1 && !add) {
      // second click on the same creature: look at the tile under it instead
      deselect();
      ov.selCell = cell;
      return;
    }
    return selectUnit(next, add && next.isDwarf);
  }
  deselect();
  const b = g.buildingAt(cell);
  if (b) {
    ov.selBuilding = b.id;
    return;
  }
  ov.selCell = cell;
  const zs = g.zoneAt.get(cell);
  if (zs && zs.length) ov.selZone = zs[0];
}
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey || e.ctrlKey) R.cam.z += e.deltaY > 0 ? -1 : 1;
  else R.zoom(e.deltaY > 0 ? -2 : 2, e.offsetX, e.offsetY);
  R.clamp();
}, { passive: false });

// ------------------------------------------------------------------ keyboard
const keys = new Set<string>();
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('keydown', (e) => {
  if (!g || (e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === ' ') {
    speed = speed ? 0 : 1;
    e.preventDefault();
  } else if (k === '1' || k === '2' || k === '3') speed = +k;
  else if (k === 'q' || k === '<' || k === ',') R.cam.z--;
  else if (k === 'e' || k === '>' || k === '.') R.cam.z++;
  else if (k === 'escape') {
    if (ctx.style.display === 'block') closeMenu();
    else if (modal) modal = '';
    else if (tool || linking) {
      tool = null;
      linking = 0;
    } else if (cat) cat = '';
    else deselect();
  } else if (k === 'r') act('draft', '');
  else if (k === 'l') modal = modal === 'labors' ? '' : 'labors';
  else if (k === 'k') modal = modal === 'stocks' ? '' : 'stocks';
  else if (k === 't') modal = modal === 'trade' ? '' : 'trade';
  else if (k === 'h' || k === '?') modal = modal === 'help' ? '' : 'help';
  else if (k === 'm') act('music', '');
  else if (k === 'g') act('ascii', '');
  else if (k === 'f') {
    const u = primary();
    if (u) jump(u.x, u.y, u.z);
  } else if (k === 'tab') {
    // next dwarf
    e.preventDefault();
    const ds = g.dwarves();
    if (ds.length) {
      const cur = ds.findIndex((u) => ov.selUnits.has(u.id));
      const u = ds[(cur + 1) % ds.length];
      selectUnit(u);
      jump(u.x, u.y, u.z);
    }
  } else return;
  R.clamp();
  ui();
});

// ------------------------------------------------------------------ actions (data-a="…")
function act(a: string, v: string, el?: HTMLElement) {
  const [p0, p1, p2] = v.split(':');
  const b = g.buildings.get(+p0);
  const u = g.units.get(+p0);
  switch (a) {
    case 'deselect': deselect(); break;
    case 'closemodal': modal = ''; break;
    case 'modal': modal = modal === v ? '' : (v as typeof modal); break;
    case 'speed': speed = +v; break;
    case 'music':
      if (music.paused) music.play().catch(() => flash('Music file missing: copy the theme to public/music/theme.mp3'));
      else music.pause();
      break;
    case 'save': save(); break;
    case 'menu': void save(true).then(showTitle); break; // the title screen offers "Continue", so the save must land first
    case 'z': R.cam.z += +v; R.clamp(); break;
    case 'zset': R.cam.z = +v; R.clamp(); break;
    case 'ascii': R.setAscii(!R.ascii); break;
    case 'cat': cat = cat === v ? '' : v; tool = null; break;
    case 'tool': tool = tool?.id === v ? null : TOOLS[cat].find((t) => t.id === v) || null; linking = 0; break;
    case 'alert': {
      const al = g.alerts[+v];
      if (!al) break;
      const au = g.units.get(al.unit || 0);
      if (au) {
        selectUnit(au);
        jump(au.x, au.y, au.z);
      } else if (al.x !== undefined) jump(al.x, al.y!, al.z!);
      break;
    }
    case 'log': {
      const e = g.log[+v];
      if (e && e.x !== undefined) jump(e.x, e.y!, e.z!);
      break;
    }
    case 'pick': case 'center':
      if (u) {
        if (a === 'pick') {
          selectUnit(u, !!el && false);
          modal = '';
        }
        jump(u.x, u.y, u.z);
      }
      break;
    case 'draft': {
      const us = orderable();
      const on = !us.every((x) => x.drafted);
      for (const x of us) {
        const no = on ? cannotOrder(g, x) : '';
        if (no) flash(no);
        else setDraft(g, x, on);
      }
      break;
    }
    case 'canceljob': if (u) endJob(g, u, 'cancelled by your order'); break;
    case 'militia': if (u) u.militia = !u.militia; break;
    case 'hunt': if (u) u.hunted = !u.hunted; break;
    case 'slaughter': if (u) u.slaughter = !u.slaughter; break;
    case 'train': if (u) u.train = !u.train; break;
    case 'labor': if (u) u.labors[p1 as Labor] = (u.labors[p1 as Labor] + 1) % 5; break;
    case 'suspend': if (b) b.suspended = !b.suspended; break;
    case 'cancelbuild': if (b) { g.removeBuilding(b); deselect(); } break;
    case 'remove': if (b) b.remove = !b.remove; break;
    case 'lock': if (b) { b.locked = !b.locked; g.applyBlock(b); } break;
    case 'link': linking = linking ? 0 : +p0; tool = null; break;
    case 'unlink': if (b) b.links = (b.links || []).filter((i) => i !== +p1); break;
    case 'pull': if (b) b.pull = !b.pull; break;
    case 'addbill': {
      const r = (el as HTMLSelectElement).value;
      // brewing defaults to a stock target: brewing forever would turn every edible plant into drink
      if (b && RECIPES[r]) b.bills.push({ recipe: r, mode: r === 'brew' ? 'until' : 'count', n: r === 'brew' ? 40 + g.dwarves().length * 2 : 1, paused: false });
      break;
    }
    case 'billmode': if (b) { const bill = b.bills[+p1]; bill.mode = (el as HTMLSelectElement).value as 'count' | 'forever' | 'until'; if (bill.mode === 'until') bill.n = Math.max(bill.n, 10); if (bill.mode === 'count') bill.n = Math.max(1, bill.n); } break;
    case 'billn': if (b) b.bills[+p1].n = Math.max(1, b.bills[+p1].n + +p2 * (keys.has('shift') ? 10 : 1)); break;
    case 'billpause': if (b) b.bills[+p1].paused = !b.bills[+p1].paused; break;
    case 'billdel': if (b) b.bills.splice(+p1, 1); break;
    case 'billup': if (b && +p1 > 0) b.bills.splice(+p1 - 1, 0, b.bills.splice(+p1, 1)[0]); break;
    case 'cat_': break;
    case 'zcat': {
      const z = g.zones.get(+p0);
      if (z) z.cats = z.cats.includes(p1 as Cat) ? z.cats.filter((c) => c !== p1) : [...z.cats, p1 as Cat];
      break;
    }
    case 'catall': case 'catnone': {
      const z = g.zones.get(+p0);
      if (z) z.cats = a === 'catall' ? CATS.slice() : [];
      break;
    }
    case 'crop': {
      const z = g.zones.get(+p0);
      if (z) z.crop = (el as HTMLSelectElement).value;
      break;
    }
    case 'delzone': {
      const z = g.zones.get(+p0);
      if (z) g.removeZoneCells(z.cells.slice(), z.kind);
      g.w.version++;
      deselect();
      break;
    }
    case 'undesig': g.designate(+p0, 0); break;
    case 'forbid': {
      const it = g.items.get(+p0);
      if (it) it.forbid = !it.forbid;
      break;
    }
    case 'sell': sell.has(+p0) ? sell.delete(+p0) : sell.add(+p0); tradeMsg = ''; break;
    case 'buy': buy.has(+p0) ? buy.delete(+p0) : buy.add(+p0); tradeMsg = ''; break;
    case 'dotrade': {
      const s = new Map<number, number>(), bm = new Map<number, number>();
      for (const id of sell) { const it = g.items.get(id); if (it) s.set(id, it.n); }
      for (const k of buy) { const it = g.caravan?.goods[k]; if (it) bm.set(k, it.n); }
      tradeMsg = trade(g, s, bm);
      if (!tradeMsg) { sell.clear(); buy.clear(); }
      break;
    }
  }
  ui();
}
// buttons fire on pointerdown (the panels are re-rendered often, which would swallow slower clicks)
document.addEventListener('pointerdown', (e) => {
  const el = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
  if (!el || el.tagName === 'SELECT' || !g) return;
  if (el.id === 'modal') return;
  e.preventDefault();
  act(el.dataset.a!, el.dataset.v || '', el);
});
document.addEventListener('change', (e) => {
  const el = e.target as HTMLElement;
  if (el.tagName === 'SELECT' && el.dataset.a && g) {
    act(el.dataset.a, el.dataset.v || '', el);
    (el as HTMLSelectElement).blur();
  }
});
$('modal').addEventListener('pointerdown', (e) => {
  if (e.target === $('modal')) {
    modal = '';
    ui();
  }
});

// ------------------------------------------------------------------ UI refresh
let srange: { g: Game; r: [number, number] } | null = null;
/** lowest and highest ground level on the map (for telling sky / surface / underground apart) */
function surfaceRange(): [number, number] {
  if (srange?.g === g) return srange.r;
  let lo = D, hi = 0;
  for (const z of g.w.surface) {
    if (z < lo) lo = z;
    if (z > hi) hi = z;
  }
  srange = { g, r: [lo, hi] };
  return srange.r;
}
const last: Record<string, string> = {};
function set(id: string, html: string) {
  if (last[id] === html) return;
  // do not yank an open dropdown out from under the player
  const f = document.activeElement;
  if (f && f.tagName === 'SELECT' && $(id).contains(f)) return;
  last[id] = html;
  $(id).innerHTML = html;
}
function ui() {
  if (!g) return;
  const s = g.stocks();
  const ds = g.dwarves();
  const pop = ds.length;
  const stat = (label: string, n: number, low: number) => `<span class="stat ${n === 0 ? 'bad' : n < low ? 'warn' : ''}">${label} <b>${n}</b></span>`;
  const b = (label: string, a: string, v: string | number, on = false, title = '') => `<button data-a="${a}" data-v="${v}" class="${on ? 'on' : ''}" title="${title}">${label}</button>`;
  const lvl = R.cam.z - g.embark.z;
  const [smin, smax] = surfaceRange();
  const where = (z: number) => (z > smax ? 'sky' : z >= smin ? 'surf' : g.ev.magmaSeen && z <= MAGMA_Z ? 'mag' : (g.ev.cavern >= 1 && (z === CAVERN1_Z || z === CAVERN1_Z + 1)) || (g.ev.cavern >= 2 && (z === CAVERN2_Z || z === CAVERN2_Z + 1)) ? 'cav' : 'under');
  const WHERE: Record<string, string> = { sky: 'sky', surf: 'surface', under: 'underground', cav: 'cavern', mag: 'magma sea' };
  set('top', `<span class="name">☼ ${esc(g.fortName)}</span><span class="date">${g.dateString()}</span><span class="wide" title="Werebeasts change when the moon is full" style="color:${g.fullMoon() ? '#fff' : '#8a8272'}">${g.fullMoon() ? '● full moon' : `☾ ${g.daysToMoon().toFixed(0)}d`}</span>
    ${stat('☺', pop, 1)}${stat('Drink', s.drink || 0, pop * 2)}${stat('Food', s.food || 0, pop * 2)}<span class="stat wide">Wealth <b>${g.wealth}☼</b></span>
    <span class="sp"></span>
    ${b('▼', 'z', -1, false, 'Level down (Q)')}<span title="0 is the level the wagon arrived on. Shift+wheel also changes level; the gauge on the left jumps to any level">Level <b>${lvl > 0 ? '+' : ''}${lvl}</b> <span class="sub">${WHERE[where(R.cam.z)]}</span></span>${b('▲', 'z', 1, false, 'Level up (E)')}
    ${b('❚❚', 'speed', 0, speed === 0, 'Pause (Space)')}${b('▶', 'speed', 1, speed === 1)}${b('▶▶', 'speed', 2, speed === 2)}${b('▶▶▶', 'speed', 3, speed === 3)}
    ${b('Labors', 'modal', 'labors', modal === 'labors', 'L')}${b('Stocks', 'modal', 'stocks', modal === 'stocks', 'K')}${b('Trade', 'modal', 'trade', modal === 'trade' || g.caravan?.state === 'trading', 'T')}
    ${b(R.ascii ? 'ASCII' : 'Tiles', 'ascii', '', false, 'Switch between drawn tiles and classic ASCII (G)')}${b('♫', 'music', '', !music.paused, 'Music (M)')}${b('Save', 'save', '')}${b('?', 'modal', 'help', false, 'Help (H)')}${b('Menu', 'menu', '')}`);

  set('roster', ds.map((u) => {
    const e = explainUnit(g, u);
    return `<span class="d ${ov.selUnits.has(u.id) ? 'sel' : ''} ${u.drafted ? 'draft' : ''} ${e.tone === 'ok' ? '' : e.tone}" data-a="pick" data-v="${u.id}" title="${esc(u.name + ' — ' + e.status + (e.lines[0] ? ': ' + e.lines[0] : ''))}" style="border-bottom-color:${u.mood > 45 ? '#4a8a4a' : u.mood > 25 ? '#c09030' : '#c04030'}">${esc(u.name.split(' ')[0])}</span>`;
  }).join(''));

  // depth gauge: every level top to bottom, who is where, click to jump
  const here = new Map<number, number>(), foes = new Set<number>();
  for (const u of ds) here.set(u.z, (here.get(u.z) || 0) + 1);
  for (const u of g.units.values()) if (u.faction === 'enemy' && !u.dead && u.state !== 'caged' && g.w.revealed(g.cellOf(u))) foes.add(u.z);
  let gauge = '';
  for (let z = D - 1; z >= 0; z--) {
    const n = here.get(z) || 0, rel = z - g.embark.z;
    gauge += `<div class="zr ${where(z)} ${z === R.cam.z ? 'cur' : ''}" data-a="zset" data-v="${z}" title="Level ${rel} (${WHERE[where(z)]})${n ? `: ${n} dwar${n > 1 ? 'ves' : 'f'}` : ''}${foes.has(z) ? ' — hostiles!' : ''}"><span>${rel}</span>${foes.has(z) ? '<i class="foe">!</i>' : n ? `<i>${n}</i>` : ''}</div>`;
  }
  set('depth', gauge);

  set('alerts', g.alerts.slice(0, 12).map((a, k) => `<div class="alert ${a.sev}" data-a="alert" data-v="${k}">${a.sev === 'bad' ? '‼' : '⚠'} ${esc(a.text)}<div class="detail">${esc(a.detail)}</div></div>`).join(''));

  // side panel
  let h = '';
  const us = selected();
  const sb = g.buildings.get(ov.selBuilding);
  if (us.length) h = unitPanel(g, us[0], us.length);
  else if (sb) h = buildingPanel(g, sb, linking === sb.id);
  else {
    const z = g.zones.get(ov.selZone);
    if (z) h += zonePanel(g, z).replace(/data-a="cat"/g, 'data-a="zcat"');
    if (ov.selCell >= 0 && (!z || g.itemsAt.has(ov.selCell) || g.w.desig[ov.selCell] || g.crops.has(ov.selCell))) h += cellPanel(g, ov.selCell);
  }
  set('panel', h);

  set('log', g.log.slice(-9).map((l, k) => `<div class="k-${l.kind}" data-a="log" data-v="${g.log.length - Math.min(9, g.log.length) + k}">${esc(l.text)}</div>`).join(''));

  // toolbar
  const cats = Object.keys(TOOLS);
  set('toolbar', `<div class="desc">${tool ? `<b class="amber">${esc(tool.label)}</b> — ${esc(tool.desc)} <span class="sub">(right-click or Esc to stop)</span>` : linking ? 'Click the bridge, floodgate, door or gear assembly this lever should operate.' : ''}</div>
    <div class="tools">${cat ? TOOLS[cat].map((t) => b(t.label, 'tool', t.id, tool?.id === t.id, esc(t.desc))).join('') : ''}</div>
    <div class="cats">${cats.map((c) => b(c, 'cat', c, cat === c)).join('')}</div>`);

  const m = $('modal');
  m.style.display = modal ? 'flex' : 'none';
  if (modal) set('modalwin', modal === 'labors' ? laborsModal(g) : modal === 'stocks' ? stocksModal(g) : modal === 'trade' ? tradeModal(g, sell, buy, tradeMsg) : HELP);
  hint();
}
function hint() {
  let h = '';
  let c = ov.hover;
  if (performance.now() < flashUntil) h = `<span class="red">${esc(flashMsg)}</span>`;
  else if (c >= 0) {
    const top = c;
    c = tool && !(tool.desig === DG.Chop || tool.desig === DG.Gather) ? c : seen(c);
    const parts = [tileText(g, c) + (c !== top ? ` (${(top - c) / WH} below)` : '')];
    if (g.w.revealed(c)) {
      for (const u of g.unitsIn(c)) parts.unshift(u.isDwarf ? u.name : g.unitName(u));
      const bd = g.buildingAt(c);
      if (bd) parts.unshift(g.buildingName(bd) + (bd.built ? '' : ' (planned)'));
      const its = g.itemsIn(c);
      if (its.length) parts.push(its.slice(0, 3).map((i) => g.itemName(i)).join(', ') + (its.length > 3 ? '…' : ''));
      if (g.w.desig[c]) parts.push('▸ ' + DG_NAME[g.w.desig[c]]);
    }
    h = `<b>${esc(parts.join(' · '))}</b>`;
    if (tool?.build && !drag) {
      const r = footprint(tool, c, c);
      const can = canPlace(g, tool.build, r.x0, r.y0, R.cam.z, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1);
      if (!can.ok) h += `<br><span class="red">✗ ${esc(can.why)}</span>`;
    } else if (tool?.desig && !drag) {
      const v = validDesig(g, c, tool.desig);
      if (!v.ok) h += `<br><span class="red">✗ ${esc(v.why)}</span>`;
    } else if (!tool && orderable().length) h += '<br>Right-click: orders';
  }
  set('hint', h || 'Left-click: inspect · Right-click: orders for the selected dwarf · H: help');
}

// ------------------------------------------------------------------ frame loop
let frame = 0;
function loop() {
  requestAnimationFrame(loop);
  if (!g) return;
  frame++;
  if ($('title').style.display === 'none' && !modal) {
    for (tickDebt += TPF[speed]; tickDebt >= 1 && !g.attention; tickDebt--) step(g);
  }
  if (g.attention) {
    // a raid or worse: stop the clock and show where
    const e = g.attention;
    g.attention = null;
    speed = 0;
    tickDebt = 0;
    if (e.x !== undefined) jump(e.x, e.y!, e.z!);
    flash('Paused: ' + e.text);
    ui();
  }
  if (frame % 2 === 0) {
    const pan = keys.has('shift') ? 3 : 1;
    if (keys.has('a') || keys.has('arrowleft')) R.cam.x -= pan;
    if (keys.has('d') || keys.has('arrowright')) R.cam.x += pan;
    if (keys.has('w') || keys.has('arrowup')) R.cam.y -= pan;
    if (keys.has('s') || keys.has('arrowdown')) R.cam.y += pan;
    ov.hover = R.cellAt(mouse.x, mouse.y);
  }
  // drag / placement preview
  ov.rect = null;
  if (ov.hover >= 0) {
    if (tool?.build) {
      const r = footprint(tool, drag ? drag.cell : ov.hover, ov.hover);
      const single = BUILDINGS[tool.build].tile === undefined && !LINES.includes(tool.build);
      ov.rect = { ...r, ok: single ? canPlace(g, tool.build, r.x0, r.y0, R.cam.z, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1).ok : true };
    } else if (drag && !drag.pan && (tool || ov.hover !== drag.cell)) ov.rect = { ...rectOf(drag.cell, ov.hover), ok: true };
  }
  for (const id of ov.selUnits) if (!g.units.has(id)) ov.selUnits.delete(id);
  R.draw(g, ov);
  if (frame % 12 === 0) ui();
  else if (frame % 3 === 0) hint();
  if (frame % (60 * 180) === 0 && speed) save(true);
}

// ------------------------------------------------------------------ save / title
async function save(quiet = false) {
  if (!g || g.ev.lost) return;
  try {
    await writeSave(g.serialize());
    if (!quiet) flash('Game saved');
  } catch (e) {
    flash('Could not save: ' + (e as Error).message);
  }
}
function start(game: Game) {
  g = game;
  (window as unknown as { game: Game }).game = g;
  deselect();
  $('title').style.display = 'none';
  R.resize();
  const u = g.dwarves()[0];
  if (u) jump(u.x, u.y, u.z);
  else jump(g.embark.x, g.embark.y, g.embark.z);
  music.play().catch(() => {});
  speed = 1;
  ui();
}
async function showTitle() {
  const t = $('title');
  t.style.display = 'flex';
  let saved: string | null = null;
  try {
    saved = await loadSave();
  } catch {
    saved = null;
  }
  t.innerHTML = `<pre>
 ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
 █                                                 █
 █    S T R I K E   T H E   E A R T H !            █
 █                                                 █
 █        ☺ ☺ ☺ ☺ ☺ ☺ ☺      ▲▲▲  ♣ ♠ ♣            █
 █    ░░▒▒▓▓████ £ ☼ ████▓▓▒▒░░  ≈≈≈≈≈             █
 █                                                 █
 ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀</pre>
  <div class="tag">A dwarven fortress simulation with controls you can actually reason about.<br>Every idle dwarf, stalled job and stuck work order tells you <i>why</i>.</div>
  <div>World seed <input id="seed" value="${Math.floor(Math.random() * 99999)}" /></div>
  <button id="new">Embark</button>
  ${saved ? '<button id="cont">Continue saved fortress</button>' : ''}
  <div class="tag">Select a dwarf and right-click to give orders · <kbd>H</kbd> in game for help</div>`;
  $('new').onclick = () => {
    const seed = parseInt(($('seed') as HTMLInputElement).value, 10) || 1;
    start(newGame(seed));
    modal = 'help';
    ui();
  };
  if (saved) $('cont').onclick = () => start(Game.deserialize(saved!));
}

$('modal').innerHTML = '<div class="win" id="modalwin"></div>';
window.addEventListener('resize', () => R.resize());
window.addEventListener('beforeunload', () => void save(true));
R.resize();
showTitle();
loop();
void D; void H; void W; void LABORS;
