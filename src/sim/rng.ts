// Small deterministic RNG (mulberry32) + value noise. The sim never calls Math.random.

export class Rng {
  s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  range(a: number, b: number): number {
    return a + this.int(b - a + 1);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<X>(arr: readonly X[]): X {
    return arr[this.int(arr.length)];
  }
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function hash3(x: number, y: number, z: number, seed: number): number {
  return hash2(x + z * 131, y + z * 71, seed + z * 977);
}
const smooth = (t: number) => t * t * (3 - 2 * t);

export function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = smooth(x - xi), yf = smooth(y - yi);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
export function fbm2(x: number, y: number, seed: number, oct = 4): number {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    v += noise2(x * f, y * f, seed + i * 101) * amp;
    tot += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / tot;
}
export function noise3(x: number, y: number, z: number, seed: number): number {
  const zi = Math.floor(z);
  const zf = smooth(z - zi);
  const a = noise2(x, y, seed + zi * 7919);
  const b = noise2(x, y, seed + (zi + 1) * 7919);
  return a + (b - a) * zf;
}
export { hash2, hash3 };
