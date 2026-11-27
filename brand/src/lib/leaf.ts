// The leaf's construction, read back from a logo file at build time: the outline is a chain of arcs (lobes bulge out,
// notches cut in), followed by the stem and, on the full mark, the midrib cut out of it. The story page draws its
// diagrams from this, so they always show the leaf that is actually in the files.

export type Pt = [number, number];
export type Circle = { kind: 'lobe' | 'notch'; cx: number; cy: number; r: number };
export type Leaf = {
  /** The whole path (outline, stem, midrib). */
  path: string;
  /** The outline alone, closed. */
  outline: string;
  /** Where one arc hands over to the next. */
  joins: Pt[];
  /** One circle per arc, in the outline's order. */
  circles: Circle[];
  stem: Pt[];
  midrib: Pt[] | null;
  /** The middle of the stem's flat cut, and where the axis leaves the tip lobe. */
  base: Pt;
  tip: Pt;
};

const TOUCH = 0.02; // the files keep two decimals

const points = (s: string): Pt[] => [...s.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

export function readLeaf(svg: string): Leaf {
  const path = svg.match(/ d="([^"]+)"/)?.[1];
  if (!path) throw new Error('leaf: no path in the file');
  const [outlinePart, stemPart, midribPart] = path.split('Z').filter((s) => s.trim());
  if (!/^M[\d.]+ [\d.]+A/.test(outlinePart)) throw new Error('leaf: no arcs where the outline should start (expected "M x yA…")');
  let at = points(outlinePart.match(/^M[^A]+/)![0])[0];
  const joins: Pt[] = [];
  const circles: Circle[] = [];
  for (const m of outlinePart.matchAll(/A([\d.]+) [\d.]+ [\d.]+ ([01]) ([01]) ([\d.]+) ([\d.]+)/g)) {
    const r = +m[1], large = +m[2], sweep = +m[3], to: Pt = [+m[4], +m[5]];
    const [x1, y1] = at, dx = to[0] - x1, dy = to[1] - y1, q = Math.hypot(dx, dy);
    const h = Math.sqrt(Math.max(0, r * r - (q / 2) ** 2));
    const side = large !== sweep ? 1 : -1; // the SVG arc flags pick which of the two possible centres
    circles.push({ kind: sweep ? 'lobe' : 'notch', r, cx: (x1 + to[0]) / 2 - (side * h * dy) / q, cy: (y1 + to[1]) / 2 + (side * h * dx) / q });
    joins.push(to);
    at = to;
  }
  circles.forEach((a, i) => {
    const j = (i + 1) % circles.length, b = circles[j];
    const off = Math.hypot(a.cx - b.cx, a.cy - b.cy) - a.r - b.r;
    if (Math.abs(off) > TOUCH) throw new Error(`leaf: circles ${i} and ${j} don’t touch (off by ${off.toFixed(3)})`);
  });

  const stem = points(stemPart);
  const midrib = midribPart ? points(midribPart) : null;
  // The stem is drawn top edge first, then the flat cut at its end.
  const base = mid(stem[2], stem[3]);
  const top = mid(stem[0], stem[1]);
  const len = Math.hypot(top[0] - base[0], top[1] - base[1]);
  const u: Pt = [(top[0] - base[0]) / len, (top[1] - base[1]) / len];
  const tipLobe = circles.reduce((a, c) => (c.r > a.r ? c : a));
  const b = u[0] * (base[0] - tipLobe.cx) + u[1] * (base[1] - tipLobe.cy);
  const c = (base[0] - tipLobe.cx) ** 2 + (base[1] - tipLobe.cy) ** 2 - tipLobe.r ** 2;
  const t = -b + Math.sqrt(Math.max(0, b * b - c));
  return { path, outline: `${outlinePart}Z`, joins, circles, stem, midrib, base, tip: [base[0] + t * u[0], base[1] + t * u[1]] };
}

/** The point where two touching circles meet. */
export function contact(a: Circle, b: Circle): Pt {
  const d = Math.hypot(b.cx - a.cx, b.cy - a.cy);
  return [a.cx + ((b.cx - a.cx) * a.r) / d, a.cy + ((b.cy - a.cy) * a.r) / d];
}
