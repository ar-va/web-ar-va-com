# brand.ar-va.com/story and a positioning review (design, 2026-11-26)

## Intent

A page on brand.ar-va.com that presents ARVA: what the brand is, what the leaf stands for, and how the leaf was built
and why. The owner's reference: an earlier six-step construction sheet (axis, lobes, notches, trace, fill + stem,
midrib; why there are no corners; why build it this way).

While planning, the owner corrected the meaning, and asked for every brand text to be reviewed against it:

- ARVA is **new**. Nothing was passed down; never imply a history, heritage or generations behind it.
- The leaf stands for an **aim**: work so well made that it outlives trends and generations and stays right.
- ARVA is **not about print or craft objects**. It makes solutions, mostly digital: for example an innovative business
  system that has a vision, is engineered and designed well, and does the job better than others.

## Positioning (second round, same day)

The owner found the first copy uncertain and gave the projects as examples. Agreed positioning:

- One line: **ARVA builds the software people have been missing: simple and pleasant on the surface, carefully
  engineered underneath.** ARVA makes **its own products** (owner's answer), not work for hire.
- Every time: finds the gap (missing, or done badly); builds for the person on the other side, not the expert;
  engineers the hard part so the surface stays simple (over-built details, never flashy or heavy); leaves people in
  control.
- Proof: music.ar-va.com, vincent.ar-va.com, anon.ar-va.com, Solaris (in progress).
- The leaf carries both halves: 18 exact circles nobody sees (engineered underneath), the oak that keeps its leaves
  (made to last).
- Page order: one line → what ARVA has built → how → the leaf → how it's drawn → small sizes → wordmark → colours.
- Copy states what ARVA does in the present tense; no "aims", no hedges.

## Goals

- `/story`: its own page, linked from the top of the reference page (`/`). Owner's choice.
- Drawings generated at build time from `logo/arva-mark-ink.svg` (and the small mark), so they can't drift from the
  logo. The build fails if a lobe and its notch stop touching.
- Every brand text says the corrected positioning: `ARVA-brand-rules.md` (section 1, logo table, two-tone rule, colour
  stories, imagery, changelog), the reference page's intro, llms.txt, and the README of the ARVA design system
  artifact on claude.ai.

## Non-goals / anti-goals

- No animation (the rules keep motion minimal).
- No claims that can't be checked; no hype ("better than others" is said as the standard aimed for, not a boast).
- Not a heritage or craft brand: no "century-old", "workshop", "generations" as ARVA's past, no print-first wording.

## Page outline (approved)

1. Top: the two-tone leaf, large; "ARVA"; one line: digital solutions made carefully enough to outlast their trends.
2. The idea: solutions, mostly digital (business systems with a vision, engineered and designed well, working better
   than what they replace); calm, precise, unhurried.
3. The leaf: kashiwa keeps its leaves through winter until new ones are ready, so it stands for work that holds
   while trends change. The 45° lean (base bottom left, tip top right: moving forward), lobes growing toward the
   tip, the two sides staggered like a real oak leaf. Kamon: ARVA borrows the method, not the history.
4. How it's built: six drawings (axis, lobes, notches, trace, fill + stem, midrib), "why there are no corners"
   (one joint zoomed), "why build it this way" (reproducible, exact at any size, easy to adjust) with the 18 circles
   as a number table.
5. Small sizes: the 7 + 7 circle leaf without midrib, at 16 / 24 / 32 px beside the full one.
6. The wordmark: Brygada 1918 Medium, letter-spaced, capitals centred on the leaf.
7. Three colours: Kikyō, Kashiwa, Bengara, where each name comes from and its one job.
8. Link to the full design language.

## Approaches

- **Own page (chosen by the owner)** vs the top of the reference page (long page, two audiences mixed).
- **Diagrams from the logo file at build time (my call)** vs hand-drawn SVG (could silently disagree with the logo
  after any change) vs images exported from a design tool (same problem, plus no dark theme).

## My calls

- Colours in the drawings: construction in the line / secondary text greys, each step's new part in Kashiwa, the
  filled leaf in Kashiwa; light and dark through Tailwind classes.
- Text written by me from the rules and the reference sheet, plain sentences; the owner reviews it on a local preview
  before anything is committed.
- The `arva-mark-kashiwa.svg` row becomes "the brand's own pages and presentations"; one-colour files "where only one
  colour is possible".
- ar-va.com's hidden home page ("Business Success Specialist…") is the owner's own copy and stays as is.
