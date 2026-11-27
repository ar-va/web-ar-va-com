# brand.ar-va.com/story Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/story` page on brand.ar-va.com presenting ARVA, the leaf's meaning and its construction, plus every brand
text corrected to the owner's positioning.

**Architecture:** `brand/src/lib/leaf.ts` reads the leaf's path from the logo file at build time and derives its
circles; two Astro components draw the construction steps and one joint from that data; the page is static.

**Tech Stack:** Astro 7 (static), Tailwind 4 (shared `global.css`), node:test.

**Spec:** `docs/superpowers/specs/2026-11-26-brand-story-design.md`

## Global Constraints

- ARVA is new: no history, heritage or generations behind it. The leaf is an aim: work that outlives trends.
- Solutions, mostly digital (business systems with a vision, engineered and designed well); not print or craft.
- Brand rules: sentence case, no all-caps labels, no "→" on links, no emoji / exclamation marks / hype, Brygada for
  titles only, Plex Mono only for aligned numbers, colours by token (Kashiwa for the leaf), both themes.
- No animation.

## Review Focus

- A logo file edited so a lobe no longer touches its notch: the build must fail with a message naming the pair.
- The small mark (no midrib): `readLeaf` must still work (midrib `null`).
- Dark theme: every drawing readable (strokes and fills through `dark:` classes, not hard-coded hex).
- Phones (390 / 360 px): step grid one column, number table scrolls inside itself, no sideways page scroll.
- Rounding in the file (2 decimals): tangency tolerance 0.02, tested against both real files.

---

### Task 1: Leaf geometry

**Files:** Create `brand/src/lib/leaf.ts`, `brand/tests/leaf.test.js`; Modify root `package.json` (`test` adds
`'brand/tests/*.test.js'`).

**Interfaces — Produces:**
- `type Pt = [number, number]`
- `type Circle = { kind: 'lobe' | 'notch'; cx: number; cy: number; r: number }`
- `type Leaf = { outline: string; joins: Pt[]; circles: Circle[]; stem: Pt[]; midrib: Pt[] | null; base: Pt; tip: Pt }`
  (`outline` = the path's first subpath, `joins` = every arc's end point, `circles` in path order,
  `base` = middle of the stem's flat cut, `tip` = where the axis leaves the largest lobe)
- `readLeaf(svg: string): Leaf` — throws `Error('leaf: circles i and j don’t touch')` past 0.02
- `contact(a: Circle, b: Circle): Pt` — the touching point

- [ ] Tests: full mark → 9 lobes + 9 notches alternating, largest lobe r 11.73, lobe radii rise to the tip on both
  sides; axis base→tip at 45° ±0.2°; small mark → 7 + 7, `midrib === null`; a copy with `A11.73 11.73` → `A12.5 12.5`
  throws /touch/; `contact` lies on both circles (±0.02).
- [ ] Run `npm test` → fails (module missing); implement; run → passes.

### Task 2: Drawings

**Files:** Create `brand/src/components/LeafStep.astro` (props `leaf: Leaf`, `step: 1|2|3|4|5|6`),
`brand/src/components/LeafJoint.astro` (props `leaf: Leaf`).

- Step drawings in `viewBox="0 0 100 100"`; earlier steps' parts stay faint, the step's new part in Kashiwa:
  1 axis with base / tip dots and "45°"; 2 lobe circles + centres; 3 notch circles dashed; 4 the traced outline with
  join dots; 5 filled leaf + stem; 6 midrib cut out (the real path with its midrib).
- Joint: the tip lobe and one neighbouring notch, centres joined through the contact point, the shared tangent.

### Task 3: The page

**Files:** Create `brand/src/pages/story.astro`; Modify `brand/src/pages/index.astro` (link + intro),
`brand/src/pages/llms.txt.ts` (story link).

- Sections as the spec's outline; 18-circle table (Plex Mono, right-aligned numbers); small sizes via `<img>` of the
  files at 16 / 24 / 32 / 64 px; colours from `colourTokens`.

### Task 4: Positioning review

**Files:** Modify `brand/ARVA-brand-rules.md` (§1, logo table row, two-tone rule, colour story row, imagery, changelog);
the ARVA design system artifact's `project/README.md` (claude.ai, after the repo).

### Task 5: Verify and hand over

- [ ] `npm test`; `npm run build -w brand`; serve `brand/dist` and screenshot `/story` at 1200 light / dark and
  390 px; check no sideways scroll; owner reviews before the commit; CLAUDE.md history entry.
