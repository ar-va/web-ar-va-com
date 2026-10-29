# ARVA brand rules for AI tools

Give this file to any AI that designs or codes for ARVA. Treat every rule as a requirement. If a request conflicts with a rule, follow the rule and say so.

Use with: `arva-tokens.css` (all colours, fonts, spacing) and the SVG files in `logo/`.

---

## 1. Who ARVA is

ARVA makes modern digital products with the patience of a century-old craft workshop. The symbol is a single oak leaf (*kashiwa*). In Japan the oak keeps its old leaves until new shoots appear, which stands for an unbroken line from one generation to the next.

- **Personality:** calm, precise, warm, unhurried, confident without being loud.
- **The design should feel like** a well-made tool on a paper-covered desk: quiet surfaces, exact details, one clear accent.
- **It should never feel like** a startup template, a nature or eco brand, or a luxury fashion house.

### Voice (draft, for the owner to refine)
- Short, plain sentences. Concrete nouns. No hype ("revolutionary", "game-changing", "unleash").
- Speak as a maker: talk about how things are built and how long they last.
- No exclamation marks, no emoji.

---

## 2. Logo

Files are in `logo/`. Never redraw, retype, or recolour the logo; always use the files.

| File | Use |
|---|---|
| `arva-horizontal-ink.svg` | Default: site header, light theme |
| `arva-horizontal-washi.svg` | Site header and footer, dark theme |
| `arva-stacked-ink.svg` / `-washi.svg` | Square spaces: splash, social, about page |
| `arva-mark-ink.svg` / `-washi.svg` | Mark alone, 32 px and larger |
| `arva-mark-small-ink.svg` / `-washi.svg` | Mark alone, below 32 px (simplified, no midrib) |
| `arva-mark-russet.svg` | Print and packaging only (the russet is no longer a screen colour since 2026-10-29) |
| `arva-wordmark-ink.svg` | Wordmark alone, only where the mark already appears nearby |
| `favicon.svg` | Browser favicon; switches colour automatically in dark mode |

Rules:
- Header logo height is 24–32 px on desktop and 22–26 px on mobile.
- Clear space on every side must be at least the width of the leaf's tip lobe (about ¼ of the mark's height).
- Swap ink and washi files with the theme. Never place the ink logo on a dark background or the washi logo on a light one.
- Never use the accent colour (indigo or periwinkle) on the logo.
- Never rotate, outline, add shadows to, add gradients to, stretch, or animate-distort the logo. The 45° lean is part of the mark.
- Never put the leaf in a circle, a badge, or a frame.

---

## 3. Colour

Use **only** the CSS variables from `arva-tokens.css`. Do not write hex values in components. Every colour has a light and a dark value, and the variable switches automatically.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | #F8F9FC Cool Paper | #1A1B26 Night | Page background |
| `--surface` | #FFFFFF White | #24283B Storm | Cards, inputs, menus, modals |
| `--sunken` | #EEF0F7 Mist | #292E42 | Alternating section bands, code blocks, wells, table stripes, popovers on dark |
| `--line` | #D8DBE6 | #3B4261 | All borders and dividers (1px) |
| `--text` | #1F2335 Ink | #C0CAF5 Moonlight | Headings and body text |
| `--text-2` | #565F89 Slate | #9AA5CE | Captions, meta, placeholders, secondary text |
| `--accent` | #5A57C4 Indigo | #A2A8FC Periwinkle | Primary buttons, links, focus rings, active nav |
| `--accent-hover` | #4B45B0 | #B7BDFF | Hover state of the accent |
| `--on-accent` | #FFFFFF | #1A1B26 | Text and icons placed on an accent fill |
| `--accent-tint` | #E4E8FF | #2F3058 | Tags, selected rows, info banners, text selection |
| `--moss` | #1F7A66 Moss | #73DACA Lichen | Secondary: small heritage and nature details (see below) |
| `--success` | #2F7D3A | #9ECE6A | Success messages and icons |
| `--warning` | #8A5D10 | #E0AF68 | Warning messages and icons |
| `--error` | #C0394B | #F7768E | Error messages, invalid field borders |

Every text colour above meets WCAG AA (4.5:1 or better) on `--bg`, `--surface` and `--sunken` in its theme (checked 2026-10-29).

The dark theme is based on **Tokyo Night** (night background, storm surfaces, moonlight text); the light theme is a cool, fresh paper. Moss is the leaf: a teal-green from the same family as the accent, so the two sit together.

**Proportions on any screen:** about 60% `--bg` and `--surface`, 30% `--text`, at most 10% `--accent`, under 3% `--moss`.

Rules:
- Each view has one accent: indigo in light, periwinkle in dark, plus the secondary `--moss` in small doses. Don't introduce other blues, purples, or brand colours.
- Text on an accent fill always uses `--on-accent`. Never put white text on the dark-theme periwinkle.
- `--moss` is allowed for: eyebrow labels (the mono uppercase labels above titles), one stamp-like detail, a "since" line, or editorial pull quotes. Never use it on buttons, links, form states, or large fills. It must not appear next to `--success`, so status colours stay readable as status.
- **No gradients**, except for the subtle overlays on photos described in section 7.
- **Green only as Moss.** The leaf colour is the teal-green `--moss`, never a bright grass or eco green. `--success` appears only in form or status feedback.
- Pure black (#000) is never used. In the light theme, white is reserved for `--surface` and `--on-accent`; the page itself is Cool Paper.
- Use `--sunken` (Mist) to alternate full-width sections in the light theme.
- Shadows: avoid them. Separate surfaces with `--line` borders. If a floating element (menu, modal) truly needs one, use `0 8px 24px rgb(0 0 0 / .12)` in light and `0 8px 24px rgb(0 0 0 / .4)` in dark.

### Theme switching
- Support both themes using `[data-theme="light"|"dark"]` on `<html>`. If no attribute is set, follow `prefers-color-scheme`.
- The theme toggle is a small icon button in the header (sun/moon line icons). Remember the choice in `localStorage`.
- Swap logo files and any images that have a light or dark version when the theme changes.

---

## 4. Typography

| Role | Font | Weight | Size / line height | Notes |
|---|---|---|---|---|
| H1 | Archivo | 600 | 56 / 1.05 (40 on mobile) | `font-stretch: 112%`, letter-spacing −0.01em |
| H2 | Archivo | 600 | 36 / 1.15 (28 on mobile) | `font-stretch: 112%` |
| H3 | Archivo | 600 | 24 / 1.25 | `font-stretch: 112%` |
| Body | IBM Plex Sans | 400 | 18 / 1.6 | Medium (500) for emphasis, never bold body text |
| Small / meta | IBM Plex Sans | 400 | 15 / 1.5 | colour `--text-2` |
| Button | IBM Plex Sans | 600 | 16 / 1 | |
| Eyebrow / label | IBM Plex Mono | 500 | 12, uppercase, +0.08em tracking | |
| Code, specs, numbers in tables | IBM Plex Mono | 400 | 14–15 | |
| Japanese text | IBM Plex Sans JP | same as Plex Sans | | |

Rules:
- Use only these three families. Never Inter, Roboto, Arial, Montserrat, Poppins, or any serif.
- Archivo is for headings only, never paragraphs. Expanded width (125%) belongs to the wordmark; don't set headings wider than 112%.
- Sentence case for headings and buttons. Uppercase only for mono eyebrows and labels.
- Paragraphs are at most 68 characters wide (`--measure`). Use `text-wrap: balance` on headings and `pretty` on paragraphs.
- Left-align text. Centre it only for short hero lines or empty states.

---

## 5. Layout and spacing

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Use only these values.
- Content max width is 1200 px, with side padding of 32 px on desktop and 20 px on mobile.
- Section vertical padding is 96–128 px on desktop and 64 px on mobile.
- Lean toward generous whitespace. One idea per section.
- Use CSS grid and flex with `gap`; avoid margin-based spacing between siblings.
- Radius: 6 px for tags, 8 px for buttons and inputs, 12 px for cards and images. No pill buttons, no fully rounded cards.
- Borders are 1px `--line`. Inputs use a 1.5px border.

---

## 6. Components

**Buttons**
- Primary: `--accent` fill, `--on-accent` label, 14 × 22 px padding, 8 px radius. Hover: `--accent-hover`. Use one primary button per view.
- Secondary: transparent, 1.5px `--text` border, `--text` label. Hover: inverts to a `--text` fill with a `--bg` label.
- Text link button: `--accent` text with a trailing arrow →.
- No icon-only buttons without an `aria-label`. Minimum hit area 44 × 44 px.

**Links:** `--accent`, underlined in body copy with a 3px offset. Hover changes the colour to `--text`. Navigation links are `--text` with no underline; the active item gets `--accent` text.

**Focus:** a 2px `--accent` outline with a 2px offset, on every interactive element. Never remove it.

**Inputs:** `--surface` fill, 1.5px `--line` border, 8 px radius. Focus turns the border to `--accent`; an invalid field gets an `--error` border with a message underneath in `--error` at 14 px.

**Cards:** `--surface` fill, 1px `--line` border, 12 px radius, 24 px padding, no shadow. Hover (only if the card is clickable) changes the border to `--text-2`.

**Tags / badges:** `--accent-tint` fill, `--text` label, 12 px mono.

**Header:** logo on the left, nav links and one primary button on the right, plus the theme toggle. 72 px tall with a 1px `--line` bottom border, on `--bg`. Sticky is allowed; no blur effects.

**Footer:** on `--surface` (light) or `--bg` (dark), separated by a `--line` top border, with the washi or ink horizontal logo as appropriate. Links in `--text-2`, hovering to `--text`.

---

## 7. Imagery and icons

- Photography shows real materials, hands, tools, workshops, and products in use. Use natural light and warm, slightly muted grading. No stock-photo smiles, no glowing abstract tech.
- Images sit in 12 px radius frames or run full-bleed. To place text over a photo, add a `--bg`-coloured overlay at 70% or more opacity.
- Icons are line icons with a 1.5px stroke, round joins, 20 or 24 px, coloured `--text` or `--text-2`. Lucide is a good match. Never use filled multicolour icons or emoji.
- Don't add decorative leaves, leaf patterns, or nature illustrations. The logo is the only leaf.
- If an image is missing, use a `--sunken` placeholder box with a short caption describing what goes there. Never invent images with SVG.

---

## 8. Motion

- Transitions take 150–250 ms with `var(--ease)`. Fade or move by 8–16 px at most.
- No bounce, parallax, spinning, or autoplaying carousels.
- Respect `prefers-reduced-motion`: turn off non-essential motion.

---

## 9. Never

- Bright grass or eco greens (the only green is `--moss`), rainbow, or neon colours, or gradient backgrounds.
- Any font other than Archivo, IBM Plex Sans, IBM Plex Mono, and Plex Sans JP.
- The logo recoloured, redrawn, in a circle, or in the accent colour.
- Moss on interactive elements.
- White text on periwinkle (dark-theme accent).
- Glassmorphism, heavy shadows, pill buttons, cards with a coloured left border.
- Emoji, exclamation marks, or hype words in copy.
- Filler content, invented statistics, or fake testimonials. Leave a clearly marked placeholder instead.

---

## 10. Before you finish, check

1. Every colour comes from a token, and both themes have been checked.
2. Logo files are swapped correctly for the theme.
3. There is one primary button per view and the accent covers 10% of the screen or less.
4. Body text is 18 px Plex Sans, and headings are Archivo 600 at 112%.
5. Every interactive element has a visible focus state and a hit area of at least 44 px.
6. Text contrast is at least 4.5:1, which the tokens guarantee if used as specified.

---

## Changelog

- **2026-10-29:** colours refreshed. The first warm neutrals (Paper White, Washi, Bark, Night Ink) and the russet
  heritage colour read as burnt and brownish; the dark theme now follows Tokyo Night, the light theme is a cool
  paper, and the secondary is Moss (teal-green) instead of russet. Accent unchanged.
- **Site note (ar-va.com):** the owner chose "identity only" for the site: logo, fonts and colours follow these
  rules, while the site keeps its frosted-glass pill header and toolbars, pill-shaped controls, and the music
  shelf's vinyl animations, which sections 5, 6, 8 and 9 would otherwise rule out.
