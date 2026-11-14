// Canvas renderer. Two looks: drawn tiles (default) and classic one-glyph-per-tile ASCII (G toggles).
// Tile art is drawn procedurally on an 8×8 grid per tile, so there are no image assets.
import { BUILDINGS, CREATURES, D, F, H, ITEMS, MATS, PLANTS, T, W, plantOf } from '../sim/defs';
import { Game } from '../sim/game';
import { DG, ripe } from '../sim/jobs';
import { hash2 } from '../sim/rng';
import type { Building, Item, Unit } from '../sim/types';
import { WH, idx } from '../sim/world';

const FONT = '"DejaVu Sans Mono", Menlo, Consolas, "Apple Symbols", "Segoe UI Symbol", monospace';
type Ctx = CanvasRenderingContext2D;

const shadeCache = new Map<string, string>();
/** darken (f < 1) or lighten (f > 1) a hex colour */
export function shade(hex: string, f: number): string {
  const key = hex + f;
  let v = shadeCache.get(key);
  if (v) return v;
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const c = [0, 2, 4].map((k) => Math.max(0, Math.min(255, Math.round(parseInt(h.slice(k, k + 2), 16) * f))));
  v = `rgb(${c[0]},${c[1]},${c[2]})`;
  shadeCache.set(key, v);
  return v;
}
/** shade with the factor snapped to a few steps, so per-tile variation does not flood the cache */
const tint = (hex: string, f: number) => shade(hex, Math.round(f * 25) / 25);

const ZONE_TINT: Record<string, string> = {
  stockpile: 'rgba(214,190,90,0.16)', farm: 'rgba(150,110,60,0.22)', meeting: 'rgba(90,140,230,0.16)', hospital: 'rgba(240,120,160,0.18)',
  fishing: 'rgba(80,200,220,0.20)', pasture: 'rgba(110,200,90,0.14)', burrow: 'rgba(200,200,200,0.1)',
};
const DESIG_TINT = ['', 'rgba(255,190,40,0.30)', 'rgba(255,120,40,0.32)', 'rgba(255,230,90,0.30)', 'rgba(255,230,90,0.30)', 'rgba(255,150,40,0.38)', 'rgba(120,255,120,0.30)', 'rgba(140,200,255,0.30)', 'rgba(200,140,255,0.30)', 'rgba(255,80,80,0.35)'];
const DESIG_CH = ['', '', '▼', 'X', '▲', '', '', '', '', 'x'];
const WATER_BG = ['', '#0c2440', '#0d2a4c', '#0e3058', '#0f3664', '#103c70', '#11427c', '#124888'];

// 8×8 sprites. People: H hat/hair, S skin, E eye, B beard, C clothes, L boots.
// Animals: B body, D darker body, L legs, E eye, N nose, H horn, W white, Y yellow, R red.
const SPRITES: Record<string, string[]> = {
  dwarf: ['..HHHH..', '.HHHHHH.', '.SESSES.', '.BSSSSB.', '.BBBBBB.', 'CCBBBBCC', '.CCCCCC.', '.LL..LL.'],
  goblin: ['S......S', 'SSHHHHSS', '.SESSES.', '.SSSSSS.', '..SSSS..', 'CCCCCCCC', '.CCCCCC.', '.LL..LL.'],
  were: ['B......B', 'BB....BB', '.BBBBBB.', '.BEBBEB.', '.BBWWBB.', 'BBBBBBBB', 'B.BBBB.B', '..L..L..'],
  dog: ['........', '......B.', 'D....BBB', 'DBBBBBEN', '.BBBBBB.', '.BBBBBB.', '.L.L.L.L', '.L....L.'],
  cat: ['........', 'D....B.B', 'D....BBB', 'D....EBE', '.BBBBBBB', '.BBBBBB.', '.L.LL.L.', '........'],
  ox: ['........', '.....H.H', '.DDDBBBB', 'BBBBBBEB', 'BBBBBBBN', 'BBBBBBB.', '.LL..LL.', '.LL..LL.'],
  deer: ['.....H.H', '.....HHH', '......BB', '.BBBBBEB', 'WBBBBBB.', '.BBBBB..', '.L.L.L..', '.L.L.L..'],
  boar: ['........', '........', '..DDDD..', '.BBBBBB.', 'BBBBBBEB', 'BBBBBBBH', '.L.L.L..', '........'],
  bear: ['........', '.....B.B', '.BBBBBBB', 'BBBBBBEB', 'BBBBBBBN', 'BBBBBBB.', 'BB.BB.B.', 'LL.LL.L.'],
  elephant: ['.BBBBBB.', 'BBBBBBBB', 'BBBBBEBB', 'BBBBBBBB', 'BBBBBBHB', 'BBBBBB.B', 'LL.LL..B', 'LL.LL...'],
  fish: ['........', '........', 'D..BBB..', 'DBBBBBB.', 'DBBBBEBB', 'DBBBBBB.', 'D..BBB..', '........'],
  spider: ['L.L..L.L', 'L.L..L.L', '.LBBBBL.', 'LLBEEBLL', '..BBBB..', 'LLBBBBLL', 'L.L..L.L', 'L......L'],
  critter: ['........', '........', '........', '...BB.B.', 'D.BBBBBB', 'DBBBBBEN', '.BBBBBB.', '.L..L...'],
  bird: ['........', 'BB....BB', 'DBB..BBD', '.DBBBBD.', '..BBEB..', '...BBY..', '...BB...', '........'],
  fowl: ['........', '...RR...', '...BEY..', '...BB...', '.DBBBB..', 'DBBBBB..', '.BBBB...', '..Y.Y...'],
  croc: ['........', '........', '........', '......E.', 'D.BBBBBB', 'DBBBBBBW', '.BBBBBB.', '.L..L...'],
  dragon: ['.H....H.', 'DD.BBBB.', 'DDD.BEBB', 'DBBBBBBW', '.BBBBBB.', 'DBBBBBB.', 'DD.L.L..', 'D..L.L..'],
  blob: ['........', '..BBBB..', '.BBBBBB.', 'BBEBBEBB', 'BBBBBBBB', 'BBDDDDBB', '.BBBBBB.', 'B.B..B.B'],
  wagon: ['........', 'WWWWWWW.', 'WWWWWWW.', 'BBBBBBBB', 'BBBBBBBB', '.BBBBBB.', 'LL....LL', 'LL....LL'],
  horse: ['......D.', '.....BBB', '.....BEN', 'DBBBBBB.', 'DBBBBBB.', '.BBBBBB.', '.L.L..L.', '.L.L..L.'],
  snake: ['........', '........', '.BE.....', '.BB.....', '..BB..BB', '..BBBBBB', '...BBBB.', '........'],
  ghost: ['..BBBB..', '.BBBBBB.', '.BEBBEB.', '.BBBBBB.', '.BBBBBB.', '.BBBBBB.', '.B.BB.B.', '........'],
};
const BEARDS = ['#b0642a', '#7a4a22', '#d8d0c0', '#3a2a20', '#c89040'];
const hex6 = (c: string) => (c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c);
/** which sprite and colours a creature is drawn with: every creature has one */
function spriteOf(u: Unit): { map: string[]; pal: Record<string, string> } {
  const d = CREATURES[u.kind];
  const fg = hex6(u.fg);
  const dfg = hex6(d.fg);
  if (u.state === 'were') return { map: SPRITES.were, pal: { B: '#8a6a3a', L: '#4a3a20', E: '#ff3020', W: '#f0f0f0' } };
  if (d.shape === 'dwarf') {
    if (u.kind === 'zombie') return { map: SPRITES.dwarf, pal: { H: '#4a5a40', S: '#80a070', E: '#e0e040', B: '#5a6a50', C: '#3a3a30', L: '#2a2a20' } };
    if (u.kind === 'necromancer') return { map: SPRITES.dwarf, pal: { H: '#3a1a5a', S: '#c8c0d8', E: '#b060ff', B: '#3a1a5a', C: '#2a1040', L: '#1a0a28' } };
    if (u.kind === 'merchant') return { map: SPRITES.dwarf, pal: { H: '#e0c040', S: '#e8b890', E: '#201810', B: '#7a4a22', C: '#7a5a9a', L: '#3a2c20' } };
    // what a dwarf wears shows: armor is metal-coloured, no clothes at all is skin
    const clothes = u.wear ? shade(fg, 0.5) : '#e8b890';
    return { map: SPRITES.dwarf, pal: { H: u.equip.head ? '#b8bcc8' : fg, S: '#e8b890', E: '#201810', B: BEARDS[u.id % 5], C: u.equip.body ? '#9a9ea8' : clothes, L: u.equip.feet ? '#8a8e98' : '#3a2c20' } };
  }
  if (d.shape === 'goblin') {
    const skin = dfg;
    return { map: SPRITES.goblin, pal: { H: shade(skin, 0.35), S: skin, E: u.kind === 'kobold' ? '#201810' : '#ff3020', C: shade(skin, 0.45), L: shade(skin, 0.3) } };
  }
  return { map: SPRITES[d.shape] || SPRITES.critter, pal: { B: dfg, D: shade(dfg, 0.62), L: shade(dfg, 0.45), E: d.shape === 'ghost' ? '#203050' : '#101010', N: '#201810', H: '#f0e8d0', W: '#f0f0f0', Y: '#f0c030', R: '#e03030' } };
}

export interface Overlay {
  hover: number;
  selUnits: Set<number>;
  selBuilding: number;
  selCell: number;
  selZone: number;
  rect: { x0: number; y0: number; x1: number; y1: number; ok: boolean } | null;
}

interface Look {
  bg: string;
  fg: string;
  ch: string;
}
const L: Look = { bg: '#000', fg: '#000', ch: '' };

export class Renderer {
  ctx: Ctx;
  terrain = document.createElement('canvas');
  tctx: Ctx;
  key = '';
  cam = { x: 0, y: 0, z: 0, tile: 18 };
  cw = 0;
  ch = 0;
  ascii = localStorage.getItem('ascii') === '1';

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.tctx = this.terrain.getContext('2d')!;
  }
  setAscii(on: boolean) {
    this.ascii = on;
    localStorage.setItem('ascii', on ? '1' : '0');
    this.key = '';
  }
  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.cw = this.canvas.clientWidth;
    this.ch = this.canvas.clientHeight;
    for (const c of [this.canvas, this.terrain]) {
      c.width = Math.round(this.cw * dpr);
      c.height = Math.round(this.ch * dpr);
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.key = '';
  }
  get cols() {
    return Math.ceil(this.cw / this.cam.tile) + 1;
  }
  get rows() {
    return Math.ceil(this.ch / this.cam.tile) + 1;
  }
  clamp() {
    const c = this.cam;
    c.x = Math.max(-10, Math.min(W - this.cols + 12, c.x));
    c.y = Math.max(-6, Math.min(H - this.rows + 12, c.y));
    c.z = Math.max(0, Math.min(D - 1, c.z));
  }
  center(x: number, y: number, z: number) {
    this.cam.x = Math.round(x - this.cw / this.cam.tile / 2);
    this.cam.y = Math.round(y - this.ch / this.cam.tile / 2);
    this.cam.z = z;
    this.clamp();
  }
  /** map cell under a pixel, or -1 */
  cellAt(px: number, py: number): number {
    const x = Math.floor(px / this.cam.tile + this.cam.x), y = Math.floor(py / this.cam.tile + this.cam.y);
    if (x < 0 || y < 0 || x >= W || y >= H) return -1;
    return idx(x, y, this.cam.z);
  }
  zoom(delta: number, px: number, py: number) {
    const c = this.cam;
    const wx = px / c.tile + c.x, wy = py / c.tile + c.y;
    c.tile = Math.max(10, Math.min(36, c.tile + delta));
    c.x = Math.round(wx - px / c.tile);
    c.y = Math.round(wy - py / c.tile);
    this.clamp();
  }

  // ------------------------------------------------------------ drawing helpers
  private glyph(c: Ctx, ch: string, fg: string, px: number, py: number) {
    if (!ch || ch === ' ') return;
    c.fillStyle = fg;
    c.fillText(ch, px + this.cam.tile / 2, py + this.cam.tile / 2 + 1);
  }
  /** a glyph at a fraction of the tile size, centred at (fx, fy) in tile units 0..1 */
  private mini(c: Ctx, ch: string, fg: string, px: number, py: number, size: number, fx: number, fy: number) {
    const s = this.cam.tile;
    const font = c.font;
    c.font = `bold ${Math.round(s * size)}px ${FONT}`;
    c.fillStyle = fg;
    c.fillText(ch, px + s * fx, py + s * fy);
    c.font = font;
  }
  /** a rectangle in 8×8 art units */
  private box(c: Ctx, px: number, py: number, ax: number, ay: number, aw: number, ah: number, col: string) {
    const u = this.cam.tile / 8;
    c.fillStyle = col;
    c.fillRect(px + Math.round(ax * u), py + Math.round(ay * u), Math.max(1, Math.round(aw * u)), Math.max(1, Math.round(ah * u)));
  }
  private disc(c: Ctx, px: number, py: number, ax: number, ay: number, r: number, col: string, ry = r) {
    const u = this.cam.tile / 8;
    c.fillStyle = col;
    c.beginPath();
    c.ellipse(px + ax * u, py + ay * u, r * u, ry * u, 0, 0, Math.PI * 2);
    c.fill();
  }
  private poly(c: Ctx, px: number, py: number, pts: number[], col: string) {
    const u = this.cam.tile / 8;
    c.fillStyle = col;
    c.beginPath();
    for (let k = 0; k < pts.length; k += 2) c[k ? 'lineTo' : 'moveTo'](px + pts[k] * u, py + pts[k + 1] * u);
    c.fill();
  }

  // ------------------------------------------------------------ ASCII look
  private look(g: Game, i: number): Look {
    const w = g.w;
    const t = w.tile[i];
    const m = MATS[w.mat[i]];
    const f = w.flag[i];
    const x = i % W, y = Math.floor(i / W) % H;
    if (t !== T.Wall && w.magma[i] > 0) {
      L.bg = w.magma[i] >= 4 ? '#a02400' : '#701c08';
      L.fg = (x + y + Math.floor(performance.now() / 600)) % 3 ? '#ff9020' : '#ffd040';
      L.ch = '≈';
      return L;
    }
    if (t !== T.Wall && w.water[i] > 0) {
      L.bg = WATER_BG[w.water[i]];
      L.fg = '#5aa0e8';
      L.ch = w.water[i] >= 7 ? ((x * 3 + y * 5) % 4 ? '≈' : '~') : String(w.water[i]);
      return L;
    }
    const floorBg = f & F.Mud && m.kind !== 'soil' ? '#2a2016' : shade(m.bg, m.kind === 'soil' ? 0.5 : 0.42);
    switch (t) {
      case T.Wall:
        if (f & F.Built) {
          L.bg = shade(m.fg, 0.35);
          L.fg = m.fg;
          L.ch = '#';
        } else if (f & F.Engraved) {
          L.bg = shade(m.fg, 0.5);
          L.fg = shade(m.fg, 1.1);
          L.ch = '▒';
        } else if (f & F.Smooth) {
          L.bg = shade(m.fg, 0.5);
          L.fg = shade(m.fg, 0.7);
          L.ch = '·';
        } else {
          L.bg = m.bg;
          L.fg = m.fg;
          L.ch = m.glyph;
        }
        return L;
      case T.Tree: {
        const p = PLANTS[w.plant[i]];
        L.bg = p.under ? '#1c2422' : '#16240f';
        L.fg = p.fg;
        L.ch = p.glyph || '♣';
        return L;
      }
      case T.Stair:
        L.bg = floorBg;
        L.fg = f & F.Built ? m.fg : '#e8e8e8';
        L.ch = 'X';
        return L;
      case T.Ramp:
        L.bg = floorBg;
        L.fg = w.plant[i] ? shade(PLANTS[w.plant[i]].fg, 0.9) : shade(m.fg, 0.9);
        L.ch = '▲';
        return L;
      default: {
        L.bg = floorBg;
        const crop = g.crops.get(i);
        const p = PLANTS[w.plant[i]];
        if (crop) {
          const cp = plantOf(crop.plant);
          L.fg = ripe(g, i) ? cp.fg : shade(cp.fg, 0.45);
          L.ch = ripe(g, i) ? cp.glyph : '·';
        } else if (p.kind === 'shrub') {
          L.fg = p.fg;
          L.ch = p.glyph;
        } else if (w.plant[i]) {
          L.fg = shade(p.fg, 0.55 + ((x * 7 + y * 13) % 5) * 0.07);
          L.ch = ",.'`,"[(x * 3 + y * 7) % 5];
        } else if (f & F.Engraved) {
          L.fg = shade(m.fg, 0.8);
          L.ch = '▒';
        } else {
          L.fg = shade(m.fg, f & (F.Built | F.Smooth) ? 0.75 : 0.5);
          L.ch = f & (F.Built | F.Smooth) ? '+' : '.';
        }
        return L;
      }
    }
  }

  // ------------------------------------------------------------ tile art
  private art(g: Game, c: Ctx, i: number, px: number, py: number) {
    const w = g.w;
    const s = this.cam.tile;
    const t = w.tile[i];
    const m = MATS[w.mat[i]];
    const f = w.flag[i];
    const x = i % W, y = Math.floor(i / W) % H, z = Math.floor(i / WH);
    const r = (k: number) => hash2(x, y, k + z * 31); // stable per-tile randomness
    const P = (k: number) => Math.floor(r(k) * 6); // a position that leaves room for a 2-wide mark
    const box = (ax: number, ay: number, aw: number, ah: number, col: string) => this.box(c, px, py, ax, ay, aw, ah, col);
    const phase = Math.floor(performance.now() / 500);

    // ---- fluids
    if (t !== T.Wall && w.magma[i] > 0) {
      c.fillStyle = w.magma[i] >= 4 ? '#b02a00' : '#7a2008';
      c.fillRect(px, py, s, s);
      for (let k = 0; k < 3; k++) box(Math.floor(hash2(x * 3 + k, y, phase + k * 7) * 6), Math.floor(hash2(x, y * 3 + k, phase + k * 11) * 7), 2, 1, k ? '#ff8a1c' : '#ffd24a');
      return;
    }
    if (t !== T.Wall && w.water[i] > 0) {
      const lvl = w.water[i];
      c.fillStyle = WATER_BG[lvl];
      c.fillRect(px, py, s, s);
      for (let k = 0; k < 2; k++) box((P(k) + phase + k * 3) % 7, 1 + k * 4 + Math.floor(r(k + 5) * 2), 2, 0.6, lvl >= 4 ? '#3f78c4' : '#2f5c9c');
      if (lvl < 7) this.mini(c, String(lvl), 'rgba(140,190,255,0.55)', px, py, 0.6, 0.5, 0.56);
      return;
    }

    // ---- walls
    if (t === T.Wall) {
      if (f & F.Built) {
        c.fillStyle = shade(m.fg, 0.42);
        c.fillRect(px, py, s, s);
        const mortar = shade(m.fg, 0.24);
        for (let row = 0; row < 3; row++) {
          box(0, row * 2.67, 8, 0.4, mortar);
          box(row % 2 ? 2 : 0, row * 2.67, 0.4, 2.67, mortar);
          box(row % 2 ? 6 : 4, row * 2.67, 0.4, 2.67, mortar);
        }
      } else if (f & F.Smooth) {
        c.fillStyle = shade(m.fg, 0.45);
        c.fillRect(px, py, s, s);
        box(0, 0, 8, 0.4, shade(m.fg, 0.62));
        box(0, 0, 0.4, 8, shade(m.fg, 0.62));
        box(0, 7.6, 8, 0.4, shade(m.fg, 0.28));
        box(7.6, 0, 0.4, 8, shade(m.fg, 0.28));
        if (f & F.Engraved) {
          const e = shade(m.fg, 0.8);
          this.poly(c, px, py, [4, 1.5, 6.5, 4, 4, 6.5, 1.5, 4], e);
          this.poly(c, px, py, [4, 2.5, 5.5, 4, 4, 5.5, 2.5, 4], shade(m.fg, 0.45));
        }
      } else {
        c.fillStyle = tint(m.bg, 0.9 + r(1) * 0.2);
        c.fillRect(px, py, s, s);
        if (m.kind === 'soil') {
          for (let k = 0; k < 3; k++) box(P(k + 2), 1 + k * 2.4, 3, 0.5, shade(m.bg, k % 2 ? 1.3 : 0.7));
        } else {
          for (let k = 0; k < 3; k++) box(P(k + 2), P(k + 6) + 1, k ? 2 : 1, 1, shade(m.bg, k % 2 ? 1.3 : 0.72));
          if (m.kind === 'ore') {
            for (let k = 0; k < 3; k++) {
              const ax = P(k + 10), ay = P(k + 14);
              box(ax, ay, 2, 2, shade(m.fg, 0.8));
              box(ax, ay, 1, 1, shade(m.fg, 1.25));
            }
          } else if (m.kind === 'gem') {
            for (let k = 0; k < 2; k++) {
              const ax = 1.5 + P(k + 10) * 0.8, ay = 1.5 + P(k + 14) * 0.8;
              this.poly(c, px, py, [ax, ay - 1.3, ax + 1.3, ay, ax, ay + 1.3, ax - 1.3, ay], m.fg);
              box(ax - 0.3, ay - 0.6, 0.6, 0.6, '#ffffff');
            }
          }
        }
      }
      // a wall next to open ground shows its face: that is what gives tunnels their depth
      const open = (dx: number, dy: number) => {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return false;
        const n = i + dx + dy * W;
        return (w.flag[n] & F.Revealed) !== 0 && w.tile[n] !== T.Wall;
      };
      const e = Math.max(1, Math.round(s / 12));
      if (open(0, 1)) {
        c.fillStyle = 'rgba(0,0,0,0.38)';
        c.fillRect(px, py + Math.round(s * 0.68), s, s - Math.round(s * 0.68));
        c.fillStyle = 'rgba(255,255,255,0.14)';
        c.fillRect(px, py + Math.round(s * 0.68), s, e);
      }
      if (open(0, -1)) {
        c.fillStyle = 'rgba(255,255,255,0.2)';
        c.fillRect(px, py, s, e);
      }
      if (open(-1, 0)) {
        c.fillStyle = 'rgba(255,255,255,0.12)';
        c.fillRect(px, py, e, s);
      }
      if (open(1, 0)) {
        c.fillStyle = 'rgba(0,0,0,0.32)';
        c.fillRect(px + s - e, py, e, s);
      }
      return;
    }

    // ---- the ground under floors, ramps, stairs and trees
    const p = PLANTS[w.plant[i]];
    const crop = t === T.Floor ? g.crops.get(i) : undefined;
    const paved = (f & (F.Built | F.Smooth)) !== 0;
    const green = t === T.Tree ? (p.under ? PLANTS[2] : PLANTS[1]) : !crop && w.plant[i] ? (p.kind === 'grass' ? p : PLANTS[1]) : null;
    if (green) {
      c.fillStyle = tint(green.fg, 0.36 + r(1) * 0.08);
      c.fillRect(px, py, s, s);
      for (let k = 0; k < 2; k++) box(P(k + 2) + 1, P(k + 4) + 1, 0.6, 1.6, shade(green.fg, 0.6));
    } else if (paved) {
      c.fillStyle = shade(m.fg, 0.3);
      c.fillRect(px, py, s, s);
      box(0, 0, 8, 0.4, 'rgba(0,0,0,0.3)');
      box(0, 0, 0.4, 8, 'rgba(0,0,0,0.3)');
      if (f & F.Engraved) {
        this.poly(c, px, py, [4, 1.5, 6.5, 4, 4, 6.5, 1.5, 4], shade(m.fg, 0.55));
        this.poly(c, px, py, [4, 2.5, 5.5, 4, 4, 5.5, 2.5, 4], shade(m.fg, 0.3));
      }
    } else if (m.kind === 'soil' || crop) {
      c.fillStyle = tint(m.kind === 'soil' ? m.bg : '#3a2a1a', 0.72 + r(1) * 0.12);
      c.fillRect(px, py, s, s);
      for (let k = 0; k < 2; k++) box(P(k + 2) + 1, P(k + 4) + 1, 1, 0.6, shade(m.kind === 'soil' ? m.bg : '#3a2a1a', k ? 1.1 : 0.5));
    } else {
      c.fillStyle = f & F.Mud ? '#33261a' : tint(m.bg, 0.52 + r(1) * 0.08);
      c.fillRect(px, py, s, s);
      box(P(2) + 1, P(3) + 1, 1, 1, shade(m.bg, 0.85));
      box(P(4), P(5) + 1, 2, 0.5, shade(m.bg, 0.32));
    }

    switch (t) {
      case T.Tree:
        const bark = shade(hex6(m.fg), 0.55);
        if (p.id === 'pine') {
          box(3.5, 6, 1, 2, bark);
          this.poly(c, px, py, [4, 2.2, 7.6, 7, 0.4, 7], shade(p.fg, 0.6));
          this.poly(c, px, py, [4, 0.3, 6.8, 4.6, 1.2, 4.6], shade(p.fg, 0.85));
        } else if (p.under) {
          box(3.2, 3, 1.6, 5, shade(hex6(m.fg), 0.8));
          this.disc(c, px, py, 4, 3, 3.6, shade(p.fg, 0.7), 2.3);
          this.disc(c, px, py, 3.6, 2.5, 2.6, p.fg, 1.4);
        } else {
          box(3.5, 5.5, 1, 2.5, bark);
          this.disc(c, px, py, 4, 3.8, 3.5, shade(p.fg, 0.6));
          this.disc(c, px, py, 3.3, 3, 2.1, shade(p.fg, 0.9));
        }
        break;
      case T.Ramp: {
        const col = green ? green.fg : m.fg;
        this.poly(c, px, py, [4, 1, 7.2, 7, 0.8, 7], shade(col, green ? 0.62 : 0.6));
        this.poly(c, px, py, [4, 1, 7.2, 7, 4, 7], 'rgba(0,0,0,0.28)');
        break;
      }
      case T.Stair: {
        const col = f & F.Built ? m.fg : '#c8c8c8';
        for (let k = 0; k < 4; k++) box(1, k * 2, 6, 1.7, shade(col, 0.95 - k * 0.2));
        break;
      }
      default:
        if (crop) {
          const cp = plantOf(crop.plant);
          for (let k = 0; k < 3; k++) box(0, 1.2 + k * 2.6, 8, 0.5, 'rgba(0,0,0,0.3)');
          if (ripe(g, i)) {
            box(3.6, 4, 0.8, 3, '#d8d0b8');
            this.disc(c, px, py, 4, 3.6, 2.4, cp.fg, 1.6);
          } else box(3.6, 5, 0.8, 1.8, shade(cp.fg, 0.7));
        } else if (p.kind === 'shrub') {
          this.disc(c, px, py, 4, 4.4, 2.8, '#2c6a2c', 2.3);
          box(2.6, 3.4, 1, 1, p.fg);
          box(4.6, 4, 1, 1, p.fg);
          box(3.4, 5, 1, 1, p.fg);
        }
    }
  }

  private cell(g: Game, c: Ctx, i: number, px: number, py: number, depth: number) {
    const w = g.w;
    const s = this.cam.tile;
    if (!(w.flag[i] & F.Revealed)) {
      c.fillStyle = '#000';
      c.fillRect(px, py, s, s);
      return;
    }
    if (w.tile[i] === T.Open && !w.water[i] && !w.magma[i]) {
      if (depth < 4 && i >= WH) {
        this.cell(g, c, i - WH, px, py, depth + 1);
        c.fillStyle = 'rgba(8,12,30,0.42)';
      } else c.fillStyle = '#060a16';
      c.fillRect(px, py, s, s);
      return;
    }
    if (!this.ascii) return this.art(g, c, i, px, py);
    const l = this.look(g, i);
    c.fillStyle = l.bg;
    c.fillRect(px, py, s, s);
    this.glyph(c, l.ch, l.fg, px, py);
  }

  /** drawn furniture for one-tile buildings; false = no art for this type, use the glyph */
  private furniture(c: Ctx, b: Building, px: number, py: number, fg: string): boolean {
    const box = (ax: number, ay: number, aw: number, ah: number, col: string) => this.box(c, px, py, ax, ay, aw, ah, col);
    const gold = '#e8c860';
    switch (b.type) {
      case 'bed':
        box(0.5, 1.5, 7, 5, shade(fg, 0.5));
        box(1, 2, 6, 4, '#8a3434');
        box(1, 2, 2, 4, '#e8e0d0');
        return true;
      case 'table':
        box(1, 1, 6, 6, shade(fg, 0.5));
        box(1.5, 1.5, 5, 5, shade(fg, 0.8));
        return true;
      case 'chair':
        box(2, 1, 4, 1.5, shade(fg, 0.5));
        box(2, 2.5, 4, 4, shade(fg, 0.8));
        return true;
      case 'door':
        box(1.5, 0, 5, 8, shade(b.locked ? '#c04030' : fg, 0.6));
        box(3.8, 0, 0.4, 8, 'rgba(0,0,0,0.4)');
        box(5.2, 3.6, 0.9, 0.9, gold);
        return true;
      case 'chest':
        box(1, 2.5, 6, 4.5, shade(fg, 0.6));
        box(1, 2.5, 6, 1.2, shade(fg, 0.85));
        box(3.6, 3.4, 0.9, 1.2, gold);
        return true;
      case 'cabinet':
        box(1.5, 0.5, 5, 7, shade(fg, 0.6));
        box(3.8, 0.5, 0.4, 7, 'rgba(0,0,0,0.45)');
        box(3, 3.5, 0.6, 1, gold);
        box(4.5, 3.5, 0.6, 1, gold);
        return true;
      case 'coffin':
        box(2, 0.5, 4, 7, shade(fg, b.corpse ? 0.4 : 0.6));
        box(2.5, 1, 3, 6, shade(fg, 0.3));
        box(3.7, 1.6, 0.6, 3.2, shade(fg, 0.8));
        box(3, 2.5, 2, 0.6, shade(fg, 0.8));
        return true;
      case 'statue':
        box(2, 6, 4, 1.6, shade(fg, 0.5));
        box(3, 2.6, 2, 3.4, shade(fg, 0.8));
        this.disc(c, px, py, 4, 1.8, 1.2, fg);
        return true;
      case 'well':
        box(1, 1, 6, 6, shade(fg, 0.6));
        box(2, 2, 4, 4, '#11427c');
        return true;
      case 'lever':
        box(2.5, 5.6, 3, 1.4, '#6a6a70');
        this.poly(c, px, py, b.open ? [3.7, 5.8, 4.3, 5.8, 6, 1.8, 5.4, 1.6] : [3.7, 5.8, 4.3, 5.8, 2.6, 1.6, 2, 1.8], '#d8d8d8');
        this.disc(c, px, py, b.open ? 5.7 : 2.3, 1.6, 0.9, '#e04040');
        return true;
      case 'floodgate':
        box(0.5, 0.5, 7, 7, shade(fg, b.open ? 0.22 : 0.6));
        for (let k = 0; k < 3; k++) box(2 + k * 2, 0.5, 0.4, 7, 'rgba(0,0,0,0.4)');
        return true;
      case 'cagetrap': case 'stonetrap':
        box(1, 1, 6, 6, '#3a3630');
        box(1.5, 1.5, 5, 5, b.type === 'cagetrap' ? '#6a6430' : '#5a5650');
        if (b.caged) for (let k = 0; k < 4; k++) box(1.6 + k * 1.5, 1, 0.5, 6, '#e0e060');
        else this.poly(c, px, py, [4, 2.4, 5.8, 5.6, 2.2, 5.6], b.type === 'cagetrap' ? '#e0e060' : '#c8c8c8');
        return true;
    }
    return false;
  }

  /** drawn art for common items; false = use the glyph */
  private itemArt(c: Ctx, it: Item, px: number, py: number): boolean {
    const box = (ax: number, ay: number, aw: number, ah: number, col: string) => this.box(c, px, py, ax, ay, aw, ah, col);
    const m = MATS[it.mat];
    switch (it.type) {
      case 'boulder': case 'ore': {
        const col = it.type === 'ore' ? '#6a6460' : shade(m.fg, 0.7);
        this.disc(c, px, py, 4, 4.6, 2.8, 'rgba(0,0,0,0.5)', 2.3);
        this.disc(c, px, py, 4, 4.3, 2.5, col, 2);
        if (it.type === 'ore') {
          box(2.8, 3.6, 1, 1, m.fg);
          box(4.6, 4.4, 1, 1, m.fg);
        } else box(3, 3.2, 1.2, 0.8, 'rgba(255,255,255,0.3)');
        return true;
      }
      case 'log':
        box(0.8, 3, 6.4, 2.4, 'rgba(0,0,0,0.5)');
        box(1, 3, 6, 2, shade(m.fg, 0.7));
        box(1, 3, 1, 2, shade(m.fg, 1.1));
        return true;
      case 'bar':
        box(1, 4, 6, 2, shade(m.fg, 0.55));
        box(1.8, 3, 4.4, 1.2, shade(m.fg, 0.95));
        return true;
      case 'block':
        box(2, 2, 4, 4, shade(m.fg, 0.75));
        box(2, 5.2, 4, 0.8, shade(m.fg, 0.4));
        box(5.2, 2, 0.8, 4, shade(m.fg, 0.5));
        return true;
      case 'barrel': case 'drink': {
        const wood = m.kind === 'wood' ? m.fg : '#b07a3c';
        box(2, 1, 4, 6, shade(wood, 0.65));
        box(1.4, 2.2, 5.2, 3.6, shade(wood, 0.65));
        box(1.4, 2.6, 5.2, 0.5, '#2e2218');
        box(1.4, 5, 5.2, 0.5, '#2e2218');
        if (it.type === 'drink') box(2.6, 1, 2.8, 0.9, '#e0b040');
        return true;
      }
      case 'gem': case 'cutgem':
        this.poly(c, px, py, [4, 1.6, 6.4, 4, 4, 6.4, 1.6, 4], shade(m.fg, it.type === 'gem' ? 0.7 : 1));
        this.poly(c, px, py, [4, 1.6, 6.4, 4, 4, 4], 'rgba(255,255,255,0.35)');
        return true;
    }
    return false;
  }

  private drawTerrain(g: Game, ov: Overlay) {
    const c = this.tctx;
    const { x: cx, y: cy, z, tile: s } = this.cam;
    c.fillStyle = '#000';
    c.fillRect(0, 0, this.cw, this.ch);
    c.font = `${Math.round(s * 0.92)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const w = g.w;
    for (let ry = 0; ry < this.rows; ry++) {
      const y = cy + ry;
      if (y < 0 || y >= H) continue;
      for (let rx = 0; rx < this.cols; rx++) {
        const x = cx + rx;
        if (x < 0 || x >= W) continue;
        const i = idx(x, y, z);
        const px = rx * s, py = ry * s;
        this.cell(g, c, i, px, py, 0);
        const zs = g.zoneAt.get(i);
        if (zs) {
          for (const id of zs) {
            const zn = g.zones.get(id);
            if (!zn) continue;
            c.fillStyle = ZONE_TINT[zn.kind];
            c.fillRect(px, py, s, s);
            if (id === ov.selZone) {
              c.fillStyle = 'rgba(255,255,255,0.12)';
              c.fillRect(px, py, s, s);
            }
          }
        }
        const d = w.desig[i];
        if (d) {
          c.fillStyle = DESIG_TINT[d];
          c.fillRect(px, py, s, s);
          if (DESIG_CH[d]) this.glyph(c, DESIG_CH[d], '#ffe070', px, py);
          else if (!(w.flag[i] & F.Revealed)) this.glyph(c, '?', 'rgba(255,220,120,0.5)', px, py);
        }
      }
    }
    // buildings
    for (const b of g.buildings.values()) {
      if (b.z !== z) continue;
      const d = BUILDINGS[b.type];
      const hex = b.mat && !d.shop ? MATS[b.mat].fg : d.fg;
      for (let dy = 0; dy < b.h; dy++)
        for (let dx = 0; dx < b.w; dx++) {
          const px = (b.x + dx - cx) * s, py = (b.y + dy - cy) * s;
          if (px < -s || py < -s || px > this.cw || py > this.ch) continue;
          c.globalAlpha = b.built ? 1 : 0.5;
          const raised = b.type === 'bridge' && b.open;
          if (!this.ascii && b.type === 'bridge' && !raised) {
            // a plank deck
            c.fillStyle = shade(hex, 0.45);
            c.fillRect(px, py, s, s);
            for (let k = 0; k < 3; k++) this.box(c, px, py, 0, k * 2.67, 8, 0.4, 'rgba(0,0,0,0.35)');
          } else if (this.ascii || b.w > 1 || b.h > 1 || raised || !this.furniture(c, b, px, py, hex)) {
            let ch = d.glyphs.length === b.w * b.h ? d.glyphs[dx + dy * b.w] : d.glyphs[0];
            let fg = hex;
            if (raised) {
              fg = 'rgba(200,200,200,0.35)';
              ch = '╌';
            } else if (b.type === 'floodgate' && b.open) fg = shade(hex, 0.4);
            else if (b.type === 'door' && b.locked) fg = '#ff5040';
            else if (b.type === 'lever') ch = b.open ? 'ó' : 'ò';
            else if (b.type === 'cagetrap' && b.caged) {
              ch = '▓';
              fg = '#e0e060';
            } else if (b.type === 'coffin' && b.corpse) fg = '#909090';
            else if (d.machine && b.built) {
              // turning machinery flickers; stopped machinery is dull
              const turn = b.powered && Math.floor(performance.now() / 500) % 2 === 0;
              fg = b.powered ? shade(hex, turn ? 1.25 : 0.85) : shade(hex, 0.45);
              if (turn && (ch === '*' || ch === '═' || ch === 'Φ' || ch === '÷' || ch === '☼')) ch = ch === '*' ? '+' : ch === '═' ? '≈' : ch === 'Φ' ? 'θ' : ch === '÷' ? '%' : '¤';
            }
            if (!raised) {
              c.fillStyle = !b.built ? '#2a2410' : this.ascii ? '#1a1510' : shade(d.fg, 0.16);
              c.fillRect(px, py, s, s);
            }
            this.glyph(c, ch, fg, px, py);
          }
          c.globalAlpha = 1;
          if (!b.built) {
            c.strokeStyle = b.suspended ? 'rgba(255,90,70,0.8)' : 'rgba(255,220,120,0.6)';
            c.setLineDash([3, 3]);
            c.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
            c.setLineDash([]);
          } else if (b.remove) {
            c.strokeStyle = 'rgba(255,70,70,0.9)';
            c.strokeRect(px + 1.5, py + 1.5, s - 3, s - 3);
          }
        }
      if (!this.ascii && d.shop && b.built) {
        // one frame around the whole workshop
        c.strokeStyle = shade(d.fg, 0.55);
        c.strokeRect((b.x - cx) * s + 0.5, (b.y - cy) * s + 0.5, b.w * s - 1, b.h * s - 1);
      }
    }
  }

  // ------------------------------------------------------------ creatures
  private unit(c: Ctx, u: Unit, px: number, py: number, blink: boolean) {
    const s = this.cam.tile;
    const d = CREATURES[u.kind];
    const lying = u.isDwarf && u.state !== 'were' && (u.downSince > 0 || u.job?.type === 'sleep' || u.job?.type === 'rest');
    const sp = spriteOf(u);
    const px1 = s / 8;
    const size = Math.ceil(px1);
    c.fillStyle = 'rgba(0,0,0,0.38)';
    c.fillRect(px, py, s, s);
    const alpha = c.globalAlpha;
    if (d.shape === 'ghost') c.globalAlpha = alpha * 0.6;
    for (let ry = 0; ry < 8; ry++)
      for (let rx = 0; rx < 8; rx++) {
        const col = sp.pal[sp.map[ry][rx]];
        if (!col) continue;
        c.fillStyle = col;
        // lying down: the sprite is turned on its side
        c.fillRect(px + Math.floor((lying ? ry : rx) * px1), py + Math.floor((lying ? rx : ry) * px1), size, size);
      }
    c.globalAlpha = alpha;
    if (!u.isDwarf) {
      // a bar under animals and monsters shows whose side they are on
      const bar = u.state === 'caged' ? '#e0e060' : u.faction === 'enemy' ? '#e03a30' : u.faction === 'fort' ? '#5ac04a' : u.hunted ? (blink ? '#ff9a30' : '') : d.predator ? '#c08030' : '';
      if (bar) {
        c.fillStyle = bar;
        c.fillRect(px + 1, py + s - Math.max(2, Math.round(s / 9)), s - 2, Math.max(2, Math.round(s / 9)));
      }
    }
    if (u.isDwarf) {
      if (u.drafted) {
        c.strokeStyle = '#ff4030';
        c.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
      }
      if (u.downSince && blink) {
        c.fillStyle = 'rgba(255,40,40,0.4)';
        c.fillRect(px, py, s, s);
      } else if (lying && !u.downSince && blink) this.mini(c, 'z', '#ffffff', px, py, 0.55, 0.78, 0.26);
      if ((u.state === 'berserk' || u.state === 'tantrum') && blink) this.mini(c, '!', '#ff3030', px, py, 0.8, 0.8, 0.34);
      else if (u.state === 'mood' && blink) this.mini(c, '‼', '#ffe070', px, py, 0.7, 0.78, 0.3);
    } else if (u.state === 'caged') {
      for (let k = 0; k < 4; k++) this.box(c, px, py, 1.2 + k * 1.7, 0.6, 0.45, 6.8, 'rgba(224,224,96,0.8)');
    }
  }
  private unitAscii(c: Ctx, u: Unit, px: number, py: number, blink: boolean) {
    const s = this.cam.tile;
    const d = CREATURES[u.kind];
    let ch = d.glyph, fg = u.fg, bg = 'rgba(0,0,0,0.75)';
    if (u.isDwarf) {
      if (u.state === 'berserk' || u.state === 'tantrum') {
        fg = blink ? '#ff3030' : u.fg;
        ch = blink ? '!' : '☺';
      } else if (u.downSince) {
        fg = blink ? '#ff5050' : '#803030';
        ch = '☻';
      } else if (u.job?.type === 'sleep' || u.job?.type === 'rest') {
        ch = blink ? 'z' : '☺';
        fg = shade(fg.length === 7 ? fg : '#ffffff', 0.7);
      } else if (u.state === 'mood') ch = blink ? '‼' : '☺';
      if (u.drafted) bg = '#6a1010';
    } else if (u.faction === 'enemy') bg = u.state === 'caged' ? 'rgba(60,60,0,0.8)' : 'rgba(70,0,0,0.75)';
    else if (u.hunted && blink) bg = 'rgba(120,60,0,0.8)';
    c.fillStyle = bg;
    c.fillRect(px, py, s, s);
    this.glyph(c, ch, fg, px, py);
  }

  // ------------------------------------------------------------ frame
  draw(g: Game, ov: Overlay) {
    this.clamp();
    const { x: cx, y: cy, z, tile: s } = this.cam;
    const now = performance.now();
    const key = `${g.w.version}|${cx}|${cy}|${z}|${s}|${this.cw}|${this.ch}|${ov.selZone}|${Math.floor(now / 500)}`;
    if (key !== this.key) {
      this.key = key;
      this.drawTerrain(g, ov);
    }
    const c = this.ctx;
    c.drawImage(this.terrain, 0, 0, this.cw, this.ch);
    c.font = `${Math.round(s * 0.92)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const w = g.w;
    // items
    for (let ry = 0; ry < this.rows; ry++) {
      const y = cy + ry;
      if (y < 0 || y >= H) continue;
      for (let rx = 0; rx < this.cols; rx++) {
        const x = cx + rx;
        if (x < 0 || x >= W) continue;
        const i = idx(x, y, z);
        const l = g.itemsAt.get(i);
        if (!l || !(w.flag[i] & F.Revealed)) continue;
        const it = g.items.get(l[l.length - 1]);
        if (!it) continue;
        const d = ITEMS[it.type];
        const px = rx * s, py = ry * s;
        if (this.ascii || !this.itemArt(c, it, px, py)) {
          const organic = it.type === 'plant' || it.type === 'seed';
          c.fillStyle = this.ascii ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.4)';
          c.fillRect(px, py, s, s);
          this.glyph(c, organic ? (it.type === 'seed' ? '·' : plantOf(it.sub || '').glyph) : d.glyph, it.forbid ? '#804040' : d.fg || (organic ? plantOf(it.sub || '').fg : MATS[it.mat].fg), px, py);
        } else if (it.forbid) {
          c.fillStyle = 'rgba(160,40,40,0.45)';
          c.fillRect(px, py, s, s);
        }
        if (l.length > 1) {
          c.fillStyle = '#ffd24a';
          c.fillRect(px + s - 3, py + 1, 2, 2);
        }
      }
    }
    // units (those on the level below show dimly through open space)
    const blink = Math.floor(now / 400) % 2 === 0;
    const seen = new Map<number, number>();
    const draw = (u: Unit, dim: boolean) => {
      const px = (u.x - cx) * s, py = (u.y - cy) * s;
      if (px < -s || py < -s || px > this.cw || py > this.ch) return;
      const i = idx(u.x, u.y, u.z);
      if (!(w.flag[i] & F.Revealed)) return;
      // several units on one tile: take turns
      const n = (seen.get(i) || 0) + 1;
      seen.set(i, n);
      if (n > 1 && Math.floor(now / 700) % n !== n - 1 && !ov.selUnits.has(u.id)) return;
      c.globalAlpha = dim ? 0.45 : 1;
      if (this.ascii) this.unitAscii(c, u, px, py, blink);
      else this.unit(c, u, px, py, blink);
      c.globalAlpha = 1;
      if (ov.selUnits.has(u.id)) {
        c.strokeStyle = '#ffe070';
        c.lineWidth = 2;
        c.strokeRect(px + 1, py + 1, s - 2, s - 2);
        c.lineWidth = 1;
        // where they are headed
        if (u.job && u.job.z === z && u.job.type !== 'idle') {
          const jx = (u.job.x - cx) * s, jy = (u.job.y - cy) * s;
          c.strokeStyle = 'rgba(255,224,112,0.7)';
          c.setLineDash([4, 3]);
          c.beginPath();
          c.moveTo(px + s / 2, py + s / 2);
          c.lineTo(jx + s / 2, jy + s / 2);
          c.stroke();
          c.strokeRect(jx + 2.5, jy + 2.5, s - 5, s - 5);
          c.setLineDash([]);
        }
      }
    };
    for (const u of g.units.values()) {
      if (u.dead || u.carriedBy) continue;
      if (u.z === z) draw(u, false);
      else if (u.z < z && u.z >= z - 3) {
        let open = true;
        for (let zz = u.z + 1; zz <= z; zz++) if (w.tile[idx(u.x, u.y, zz)] !== T.Open) open = false;
        if (open) draw(u, true);
      }
    }
    // selection / hover / drag
    const box = (i: number, col: string, lw = 1) => {
      if (i < 0 || Math.floor(i / WH) !== z) return;
      c.strokeStyle = col;
      c.lineWidth = lw;
      c.strokeRect(((i % W) - cx) * s + 0.5, ((Math.floor(i / W) % H) - cy) * s + 0.5, s - 1, s - 1);
      c.lineWidth = 1;
    };
    if (ov.selCell >= 0) box(ov.selCell, '#ffe070', 2);
    const sb = g.buildings.get(ov.selBuilding);
    if (sb && sb.z === z) {
      c.strokeStyle = '#ffe070';
      c.lineWidth = 2;
      c.strokeRect((sb.x - cx) * s + 1, (sb.y - cy) * s + 1, sb.w * s - 2, sb.h * s - 2);
      c.lineWidth = 1;
      if (sb.links) for (const id of sb.links) {
        const t = g.buildings.get(id);
        if (!t || t.z !== z) continue;
        c.strokeStyle = 'rgba(120,220,255,0.9)';
        c.setLineDash([4, 3]);
        c.beginPath();
        c.moveTo((sb.x - cx + 0.5) * s, (sb.y - cy + 0.5) * s);
        c.lineTo((t.x - cx + t.w / 2) * s, (t.y - cy + t.h / 2) * s);
        c.stroke();
        c.setLineDash([]);
      }
    }
    if (ov.rect) {
      const r = ov.rect;
      c.fillStyle = r.ok ? 'rgba(120,255,140,0.18)' : 'rgba(255,90,70,0.22)';
      c.strokeStyle = r.ok ? '#78ff8c' : '#ff5a46';
      const px = (r.x0 - cx) * s, py = (r.y0 - cy) * s, pw = (r.x1 - r.x0 + 1) * s, ph = (r.y1 - r.y0 + 1) * s;
      c.fillRect(px, py, pw, ph);
      c.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    } else box(ov.hover, 'rgba(255,255,255,0.55)');
  }
}

export { DG };
