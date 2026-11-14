// Canvas renderer: one glyph per tile, Dwarf Fortress style.
import { BUILDINGS, CREATURES, D, F, H, ITEMS, MATS, PLANTS, T, W, plantOf } from '../sim/defs';
import { Game } from '../sim/game';
import { DG, ripe } from '../sim/jobs';
import type { Unit } from '../sim/types';
import { WH, idx } from '../sim/world';

const FONT = '"DejaVu Sans Mono", Menlo, Consolas, "Apple Symbols", "Segoe UI Symbol", monospace';

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

const ZONE_TINT: Record<string, string> = {
  stockpile: 'rgba(214,190,90,0.16)', farm: 'rgba(150,110,60,0.30)', meeting: 'rgba(90,140,230,0.16)', hospital: 'rgba(240,120,160,0.18)',
  fishing: 'rgba(80,200,220,0.20)', pasture: 'rgba(110,200,90,0.14)', burrow: 'rgba(200,200,200,0.1)',
};
const DESIG_TINT = ['', 'rgba(255,190,40,0.30)', 'rgba(255,120,40,0.32)', 'rgba(255,230,90,0.30)', 'rgba(255,230,90,0.30)', 'rgba(255,150,40,0.38)', 'rgba(120,255,120,0.30)', 'rgba(140,200,255,0.30)', 'rgba(200,140,255,0.30)', 'rgba(255,80,80,0.35)'];
const DESIG_CH = ['', '', '▼', 'X', '▲', '', '', '', '', 'x'];
const WATER_BG = ['', '#0c2440', '#0d2a4c', '#0e3058', '#0f3664', '#103c70', '#11427c', '#124888'];

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
  ctx: CanvasRenderingContext2D;
  terrain = document.createElement('canvas');
  tctx: CanvasRenderingContext2D;
  key = '';
  cam = { x: 0, y: 0, z: 0, tile: 18 };
  cw = 0;
  ch = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.tctx = this.terrain.getContext('2d')!;
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

  // ------------------------------------------------------------ tile appearance
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
  private glyph(c: CanvasRenderingContext2D, ch: string, fg: string, px: number, py: number) {
    if (!ch || ch === ' ') return;
    c.fillStyle = fg;
    c.fillText(ch, px + this.cam.tile / 2, py + this.cam.tile / 2 + 1);
  }
  private cell(g: Game, c: CanvasRenderingContext2D, i: number, px: number, py: number, depth: number) {
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
    const l = this.look(g, i);
    c.fillStyle = l.bg;
    c.fillRect(px, py, s, s);
    this.glyph(c, l.ch, l.fg, px, py);
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
      for (let dy = 0; dy < b.h; dy++)
        for (let dx = 0; dx < b.w; dx++) {
          const px = (b.x + dx - cx) * s, py = (b.y + dy - cy) * s;
          if (px < -s || py < -s || px > this.cw || py > this.ch) continue;
          let ch = d.glyphs.length === b.w * b.h ? d.glyphs[dx + dy * b.w] : d.glyphs[0];
          let fg = b.mat && !d.shop ? MATS[b.mat].fg : d.fg;
          let bg = '#1a1510';
          if (b.type === 'bridge' && b.open) {
            bg = 'rgba(0,0,0,0)';
            fg = 'rgba(200,200,200,0.35)';
            ch = '╌';
          } else if (b.type === 'floodgate' && b.open) fg = shade(fg.startsWith('#') ? fg : '#cccccc', 0.4);
          else if (b.type === 'door' && b.locked) fg = '#ff5040';
          else if (b.type === 'lever') ch = b.open ? 'ó' : 'ò';
          else if (b.type === 'cagetrap' && b.caged) {
            ch = '▓';
            fg = '#e0e060';
          } else if (b.type === 'coffin' && b.corpse) fg = '#909090';
          c.globalAlpha = b.built ? 1 : 0.5;
          if (bg !== 'rgba(0,0,0,0)') {
            c.fillStyle = b.built ? bg : '#2a2410';
            c.fillRect(px, py, s, s);
          }
          this.glyph(c, ch, fg, px, py);
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
    }
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
        c.fillStyle = 'rgba(0,0,0,0.55)';
        c.fillRect(px, py, s, s);
        this.glyph(c, it.type === 'plant' || it.type === 'seed' ? (it.type === 'seed' ? '·' : plantOf(it.sub || '').glyph) : d.glyph, it.forbid ? '#804040' : d.fg || (it.type === 'plant' || it.type === 'seed' ? plantOf(it.sub || '').fg : MATS[it.mat].fg), px, py);
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
      c.globalAlpha = dim ? 0.45 : 1;
      c.fillStyle = bg;
      c.fillRect(px, py, s, s);
      this.glyph(c, ch, fg, px, py);
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
