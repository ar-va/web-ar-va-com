# ARVA brand rules for AI tools

Give this file to any AI that designs or codes for ARVA. Treat every rule as a requirement. If a request conflicts with a rule, follow the rule and say so.

Use with: `arva-tokens.css` (all colours, fonts, spacing) and the SVG files in `logo/`.

---

## 1. Who ARVA is

ARVA makes modern digital products with the patience of a century-old craft workshop. The symbol is a single oak leaf (*kashiwa*). In Japan the oak keeps its old leaves until new shoots appear, which stands for an unbroken line from one generation to the next.

- **Personality:** calm, precise, warm, unhurried, confident without being loud.
- **The design should feel like** a well-made tool on a paper-covered desk: quiet surfaces, exact details, three colours used sparingly, each with one job.
- **It should never feel like** a startup template, a nature or eco brand, or a luxury fashion house.

### Voice (draft, for the owner to refine)
- Short, plain sentences. Concrete nouns. No hype ("revolutionary", "game-changing", "unleash").
- Speak as a maker: talk about how things are built and how long they last.
- No exclamation marks, no emoji.

---

## 2. Logo

Files are in `logo/`. Never redraw or retype the logo; always use the files. **The wordmark** (since 2026-11-20) is "ARVA" in Brygada 1918 Medium (500), letter-spaced 0.23 em, outlined to paths (no font needed), its capitals centred on the leaf; it ties the logo to the sites' titles. It was a wide geometric sans in the style of Archivo before. **Logo colours follow the palette:** the ink files use `--text` (light) and the washi files use `--text` (dark); they change only when the brand palette changes, and then every file changes together (see the changelog). Never recolour a single file for one page.

| File | Use |
|---|---|
| `arva-horizontal-ink.svg` | Default: site header, light theme |
| `arva-horizontal-washi.svg` | Site header and footer, dark theme |
| `arva-stacked-ink.svg` / `-washi.svg` | Square spaces: splash, social, about page |
| `arva-mark-ink.svg` / `-washi.svg` | Mark alone, 32 px and larger |
| `arva-mark-small-ink.svg` / `-washi.svg` | Mark alone, below 32 px (simplified, no midrib) |
| `arva-mark-moss.svg` | Heritage contexts only (print, packaging, an "about" page); Kashiwa `--kashiwa` |
| `arva-wordmark-ink.svg` | Wordmark alone, only where the mark already appears nearby |
| `arva-horizontal-ink-moss.svg` / `-washi-moss.svg` | **Default on screen** (site header): Kashiwa leaf, wordmark in `--text` |
| `arva-stacked-ink-moss.svg` / `-washi-moss.svg` | Square spaces on screen, two-tone |
| `arva-mark-small-ink-moss.svg` / `-washi-moss.svg` | Leaf alone below 32 px on screen (phone header) |
| `favicon.svg` | Browser favicon: the Kashiwa leaf, switching to mint on dark tabs |
| `../avatars/arva-avatar-{full,wordmark,leaf}-{scheme}.svg` / `.png` | Profile pictures (1:1, 1024 px PNG): full logo (stacked), wordmark or leaf on a solid ground. Schemes: `paper` (Kashiwa leaf, ink), `night` (mint, washi), `ink` (mint, paper), `moss` / `indigo` (all paper), `periwinkle` (all ink). Sized to keep the clear space and to survive a circle crop. Prefer `full-paper` / `full-night`; the leaf alone where the name shows next to it anyway |

Rules:
- Header logo height is 24–32 px on desktop and 22–26 px on mobile. The sites use 30 px and 26 px (2026-11-20; 24 px left the letter-spaced wordmark too small).
- Clear space on every side must be at least the width of the leaf's tip lobe (about ¼ of the mark's height).
- Swap ink and washi files with the theme. Never place the ink logo on a dark background or the washi logo on a light one.
- Never use Kikyō on the logo.
- **Two-tone:** on screen the leaf may be `--kashiwa` while the wordmark stays `--text` (the `-moss` files). This is the one place Kashiwa may sit on an interactive element (the logo as a home link). Use the one-colour ink / washi files for print, embossing, stamps and other single-colour uses.
- Never rotate, outline, add shadows to, add gradients to, stretch, or animate-distort the logo. The 45° lean is part of the mark.
- Never put the leaf in a circle, a badge, or a frame.

---

## 3. Colour

Use **only** the CSS variables from `arva-tokens.css`. Do not write hex values in components. Every colour has a light and a dark value, and the variable switches automatically.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | #FDFDFB Paper | #15161C Night | Page background |
| `--surface` | #FFFFFF White | #1E2029 Storm | Cards, inputs, menus, modals |
| `--sunken` | #F1F2F6 Mist | #262935 | Alternating section bands, code blocks, wells, table stripes, popovers on dark |
| `--line` | #D8DBE6 | #333645 | All borders and dividers (1px) |
| `--text` | #1F2335 Ink | #C6CBE4 Moonlight | Headings and body text |
| `--text-2` | #565F89 Slate | #9CA3C4 | Captions, meta, placeholders, secondary text |
| `--kikyo` | #4A45B5 Kikyō | #979CF7 Kikyō (dark) | Primary buttons, links, focus rings, active nav |
| `--kikyo-hover` | #3D3891 | #B7BDFF | Hover state of Kikyō |
| `--on-kikyo` | #FFFFFF | #15161C | Text and icons placed on a Kikyō fill |
| `--kikyo-tint` | #E4E8FF | #3F3F75 | Tags, selected rows, info banners, text selection |
| `--kashiwa` | #15683F Kashiwa | #5FCF8F Kashiwa (dark) | Belong: the leaf, people, the owner's voice, the facts separator (see below) |
| `--bengara` | #A3442B Bengara | #E57F57 Bengara (dark) | Notice: Latest, New, the most played flame, the favourite heart (see below) |
| `--bengara-tint` | #F7E6DF | #4A2B22 | Quiet ground behind a Bengara label (Bengara text on it 5.1:1 light, 4.5:1 dark) |
| `--success` | #2F7D3A | #9ECE6A | Success messages and icons |
| `--warning` | #8A5D10 | #E0AF68 | Warning messages and icons |
| `--error` | #C0394B | #F7768E | Error messages, invalid field borders |

Every text colour above meets WCAG AA (4.5:1 or better) on `--bg`, `--surface` and `--sunken` in its theme (checked 2026-10-29).

The dark theme is based on **Tokyo Night**, toned down: less blue and a touch darker (night background, storm surfaces, moonlight text); the light theme is almost white with a slight hint of paper. Kashiwa is the leaf: a deep oak green chosen to sit opposite Kikyō.

**Service icons.** Third-party service icons (Spotify, Apple Music, YouTube Music) use `--kikyo`, not their brand colours, so they sit inside the palette; hover `--kikyo-hover`. Third-party sign-in buttons (Telegram) use the site's primary button style, with the service's icon in the button's text colour.

### Kikyō, Kashiwa and Bengara

ARVA has three named colours, each with **one job**. If a colour doesn't mean its job on an element, the element stays neutral (`--text`, `--text-2`, `--line`).

| | **Kikyō** (bellflower violet) | **Kashiwa** (oak-leaf green) | **Bengara** (earth red) |
|---|---|---|---|
| Job | **Act**: you can press, follow or choose this | **Belong**: who made, owns or is speaking | **Notice**: worth a second look, no click needed |
| Story | The Japanese bellflower's blue-violet, once worn by the nobility | The oak in the logo, which keeps its old leaves until new ones grow | The iron-oxide red of Kyoto's old wooden shopfronts, a workshop pigment |
| Tokens | `--kikyo` #4A45B5 / #979CF7, `--kikyo-hover`, `--on-kikyo`, `--kikyo-tint` | `--kashiwa` #15683F / #5FCF8F | `--bengara` #A3442B / #E57F57, `--bengara-tint` |
| Use it for | Primary buttons, links, streaming buttons, the Telegram link, picked filters, the current view, open menus (its tint), count badges, focus rings | The leaf in the logo and the site name beside it, the artist above an album title, the owner's note (its rule and signature), the small leaf between facts, the shelf's "just now" | The "Latest" label (shelves, blog), anon's "New" marker, the most played flame, the owner's favourite-track heart |
| Form | The only one that fills shapes | Text-sized, or the leaf | Small marks or a tinted pill |
| Share of a screen | up to about 8% | about 4% | 1–2% |
| Never | On text that can't be pressed, as a large background or decoration | On buttons or links, next to a success message | On buttons, links or errors; more than one label per view or a few marks in a list (three flames at most) |

**Proportions on any screen:** about 58% `--bg` and `--surface`, 28% `--text`, then Kikyō, Kashiwa and Bengara in that order of loudness.

Rules of thumb:
1. **One test.** Pressable: Kikyō. Names a person or their voice: Kashiwa. Worth a second look: Bengara. None of these: neutral.
2. **One loud, two quiet.** Only Kikyō fills shapes; Kashiwa stays text-sized; Bengara stays a mark or a tinted pill.
3. **Never two as equals.** Never two of the three as same-sized choices side by side (a Kikyō and a Bengara button in one row). A Bengara mark next to Kikyō text is fine: they say different things. Never two on one element; an owner's toggle that shows a Bengara mark (the favourite heart) keeps a Kikyō hover and focus ring.
4. **Bengara is rare on purpose.** If everything is new, nothing is. A screen with nothing to notice (settings) has no Bengara.
5. **Status stays separate.** `--success`, `--warning`, `--error` appear only in messages. Kashiwa never next to success (close in dark), Bengara never next to an error.
   *Exception (owner's choice, 2026-10-30):* the shelf's freshness in settings ("Last updated … just now") is Kashiwa, a quiet "alive" mark rather than a success message.
6. **Both themes, same feeling.** Dark values are lighter versions of the same hue. Text on a Kikyō fill always uses `--on-kikyo`; never white on the dark-theme Kikyō.

Other colour rules:
- Don't introduce other blues, purples, greens or brand colours. **Green only as Kashiwa**, never a bright grass or eco green.
- **No gradients**, except for the subtle overlays on photos described in section 7.
- Pure black (#000) is never used. In the light theme, white is reserved for `--surface` and `--on-kikyo`; the page itself is Paper (#FDFDFB).
- Use `--sunken` (Mist) to alternate full-width sections in the light theme.
- Shadows: avoid them. Separate surfaces with `--line` borders. If a floating element (menu, modal) truly needs one, use `0 8px 24px rgb(0 0 0 / .12)` in light and `0 8px 24px rgb(0 0 0 / .4)` in dark.
- In code the Tailwind scales are `kikyo-50`…`kikyo-950` (600 light, 400 dark), `kashiwa` / `kashiwa-light`, `bengara` / `bengara-light` / `bengara-tint` / `bengara-tint-dark` (`shared/styles/global.css`).

### Theme switching
- Support both themes using `[data-theme="light"|"dark"]` on `<html>`. If no attribute is set, follow `prefers-color-scheme`.
- The theme toggle is a small icon button in the header (sun/moon line icons). Remember the choice in `localStorage`.
- Swap logo files and any images that have a light or dark version when the theme changes.

---

## 4. Typography

| Role | Font | Weight | Size / line height | Notes |
|---|---|---|---|---|
| H1 | Brygada 1918 | 600 | 56 / 1.05 (40 on mobile) | letter-spacing −0.01em |
| H2 | Brygada 1918 | 600 | 36 / 1.15 (28 on mobile) | |
| H3 | Brygada 1918 | 600 | 24 / 1.25 | |
| Body | IBM Plex Sans | 400 | 18 / 1.6 | Medium (500) for emphasis, never bold body text |
| Small / meta | IBM Plex Sans | 400 | 15 / 1.5 | colour `--text-2` |
| Button | IBM Plex Sans | 600 | 16 / 1 | |
| Label (artist, site name, status) | IBM Plex Sans | 500 | 14–18, sentence case | |
| Code, specs, numbers in tables | IBM Plex Mono | 400 | 14–15 | |
| Japanese text | IBM Plex Sans JP | same as IBM Plex Sans | | |

Rules:
- Use only these three families. Never Inter, Roboto, Arial, Montserrat, Poppins, or another serif.
- All three cover Cyrillic, so Russian titles and text render in the brand fonts. Check Cyrillic before adding any font.
- Brygada 1918 is for titles only, never paragraphs or controls. The wordmark is Brygada too, but as drawn shapes in the logo files: never retype "ARVA" in live text as a logo.
- Brygada's small letters are shorter than Plex Sans' (x-height 0.47 vs 0.52 of the size), so a title looks smaller than text at the same size: never set the two side by side at one size.
- Sentence case everywhere: headings, buttons and labels. No all-caps labels, and no label above a heading that only repeats it.
- Paragraphs are at most 68 characters wide (`--measure`). Use `text-wrap: balance` on headings and `pretty` on paragraphs.
- Left-align text. Centre it only for short hero lines or empty states.

### Which font when

Decide by what the text **does**, not by which HTML tag it sits in.

| Font | Use it for | Examples on ar-va.com |
|---|---|---|
| **Brygada 1918** (600) | Titles a reader scans for: page titles, section titles, card and item titles, album and post titles | "Artur — ARVA", "Selected work", "Tracklist", "Comments", "Chet Baker Sings", edit-page card titles |
| **IBM Plex Sans** | Everything read or operated: body text, meta lines, links, navigation, buttons and controls, form fields, and small grey labels that name a group | "Filter", "Sort", "Spotify", "Show details", "Latest", "Added", "Genres", "Date published", "Added to the shelf…" |
| **IBM Plex Sans** (500, sentence case) | Labels that carry information: the artist above an album title (Kashiwa), "Side A", "New", "Edited" | "Miles Davis", "Side A" |
| **IBM Plex Mono** (400, normal case) | Numbers that line up in columns, codes | Track positions (A1) and lengths (4:52), code |

Rules of thumb:
1. **A control is never in Brygada**, even when it sits inside a heading for structure. Buttons, toggles and menu items are IBM Plex Sans.
2. **Small grey labels are IBM Plex Sans**, even when they are headings in the markup (`font-sans`). Brygada below about 18 px competes with real titles.
3. **A label carries information or it goes.** Sentence case, IBM Plex Sans; no eyebrow that repeats the heading under it.
4. **Mono normal case only for aligned numbers and code.** Dates in running text stay IBM Plex Sans.
5. **One family per element.** Don't mix Brygada and IBM Plex Sans inside a single button or line.

On the site, Brygada is applied to `h1`–`h4` in the CSS base layer, so an element that is a heading only for structure can switch to IBM Plex Sans with `font-sans`; Plex Mono only where a class asks for it (`font-mono`), for aligned numbers and codes.

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
- Primary: `--kikyo` fill, `--on-kikyo` label, 14 × 22 px padding, 8 px radius. Hover: `--kikyo-hover`. Use one primary button per view.
- Secondary: transparent, 1.5px `--text` border, `--text` label. Hover: inverts to a `--text` fill with a `--bg` label.
- Text link button: `--kikyo` text, no trailing arrow (arrows only where they mean a direction: ← back, ↓ further down the page, Older →).
- No icon-only buttons without an `aria-label`. Minimum hit area 44 × 44 px.

**Links:** `--kikyo`, underlined in body copy with a 3px offset. Hover changes the colour to `--text`. Navigation links are `--text` with no underline; the active item gets `--kikyo` text.

**Focus:** a 2px `--kikyo` outline with a 2px offset, on every interactive element. Never remove it.

**Inputs:** `--surface` fill, 1.5px `--line` border, 8 px radius. Focus turns the border to `--kikyo`; an invalid field gets an `--error` border with a message underneath in `--error` at 14 px.

**Cards:** `--surface` fill, 1px `--line` border, 12 px radius, 24 px padding, no shadow. Hover (only if the card is clickable) changes the border to `--text-2`.

**Tags / badges:** `--kikyo-tint` fill, `--text` label, 12 px IBM Plex Sans 500, sentence case.

**Header:** logo on the left, nav links and one primary button on the right, plus the theme toggle. 72 px tall with a 1px `--line` bottom border, on `--bg`. Sticky is allowed; no blur effects.

**Footer:** on `--surface` (light) or `--bg` (dark), separated by a `--line` top border, with the washi or ink horizontal logo as appropriate. Links in `--text-2`, hovering to `--text`.

---

## 7. Imagery and icons

- Photography shows real materials, hands, tools, workshops, and products in use. Use natural light and warm, slightly muted grading. No stock-photo smiles, no glowing abstract tech.
- Images sit in 12 px radius frames or run full-bleed. To place text over a photo, add a `--bg`-coloured overlay at 70% or more opacity.
- Icons are line icons with a 1.5px stroke, round joins, 20 or 24 px, coloured `--text` or `--text-2`. Lucide is a good match. Never use filled multicolour icons or emoji.
- Don't add decorative leaves, leaf patterns, or nature illustrations. The logo is the only leaf, with one exception (2026-11-20): the logo's small leaf, in Kashiwa at 0.7em, divides separate facts in a line (between "1959", "Jazz" and "5 tracks" on album pages). One leaf per gap, never a row of leaves on its own.
- If an image is missing, use a `--sunken` placeholder box with a short caption describing what goes there. Never invent images with SVG.

---

## 8. Motion

- Transitions take 150–250 ms with `var(--ease)`. Fade or move by 8–16 px at most.
- No bounce, parallax, spinning, or autoplaying carousels.
- Respect `prefers-reduced-motion`: turn off non-essential motion.

---

## 9. Never

- Bright grass or eco greens (the only green is `--kashiwa`), rainbow, or neon colours, or gradient backgrounds.
- Any font other than Brygada 1918, IBM Plex Sans, IBM Plex Mono, and Plex Sans JP.
- The logo redrawn, in a circle, in Kikyō, or recoloured outside a palette change.
- Kashiwa on interactive elements.
- White text on the dark-theme Kikyō.
- Glassmorphism, heavy shadows, pill buttons, cards with a coloured left border.
- Emoji, exclamation marks, or hype words in copy.
- Filler content, invented statistics, or fake testimonials. Leave a clearly marked placeholder instead.

---

## 10. Before you finish, check

1. Every colour comes from a token, and both themes have been checked.
2. Logo files are swapped correctly for the theme.
3. There is one primary button per view, Kikyō covers about 8% of the screen or less, and Bengara appears at most once as a label.
4. Body text is 18 px IBM Plex Sans, and headings are Brygada 1918 600.
5. Every interactive element has a visible focus state and a hit area of at least 44 px.
6. Text contrast is at least 4.5:1, which the tokens guarantee if used as specified.

---

## Changelog

- **2026-11-20 (logo):** the wordmark redrawn in Brygada 1918 500, letter-spaced 0.23 em ("Open capitals", chosen by the
  owner from three options), outlined with opentype.js from Google Fonts' static Medium; the leaf unchanged. All
  horizontal, stacked and wordmark files and the full / wordmark avatars (SVG + PNG) regenerated; the indigo and
  periwinkle avatar grounds moved to Kikyō (#4A45B5 / #979CF7). The horizontal logo is 109 px wide at its 30 px header height.

- **2026-11-20 (colour names and roles):** the three colours are named Kikyō (act), Kashiwa (belong) and Bengara
  (notice), with one job each ("Kikyō, Kashiwa and Bengara" in section 3; replaces "Purple or Moss"). Tokens renamed
  (`--accent` → `--kikyo`, `--moss` → `--kashiwa`, `--brick` → `--bengara`; Tailwind `blue-violet` / `moss` / `brick` →
  `kikyo` / `kashiwa` / `bengara`). On the sites: the favourite heart and the most played flame are Bengara, the owner's
  note has a Kashiwa rule and signature. Older entries below keep the names of their day.
- **2026-11-20 (colours, leaf, titles):** from the refreshed ARVA design system: accent deepened (#4A45B5 / #979CF7,
  hover #3D3891), Moss deeper and bolder (#15683F / #5FCF8F, logo and favicon files follow), Brick added as the third
  main colour (#A3442B / #E57F57, tint #F7E6DF / #4A2B22) for "Latest" and "New", the logo's small leaf replaces the
  thin rule between facts, and titles are Brygada 1918 600.

- **2026-11-20 (fonts):** the owner chose the "Archive" pairing, Brygada 1918 (titles, 500) with IBM Plex Sans (text),
  after comparing pairings on real pages (IBM Plex Sans was tried for text the same day and dropped). Reasons: a serif for
  status and craft, and full Cyrillic in both (Archivo had none, so Russian titles fell back to a system font).
  Replaces Archivo; IBM Plex Sans and Plex Mono stay.

- **2026-11-20 (labels, separators, arrows):** after a review against common "generated page" tells, the owner asked
  to drop three patterns: all-caps tracked mono eyebrows (labels that repeat a heading are gone; the rest are Plex
  Sans 500 in sentence case, the artist and site name in Moss), "A · B · C" meta strings (now words, commas, or a
  thin vertical rule between facts), and "→" on link text (kept only where it means a direction). Plex Mono stays for aligned numbers and codes.

- **2026-10-30:** Moss allowed for the shelf's freshness in settings ("just now"), an exception to "Moss is not
  success" chosen by the owner.
- **2026-10-30:** avatars: 18 square profile pictures in `brand/avatars/` (SVG + 1024 px PNG), generated from the
  logo paths in the palette.
- **2026-10-29:** colours refreshed. The first warm neutrals (Paper White, Washi, Bark, Night Ink) and the russet
  heritage colour read as burnt and brownish; the dark theme now follows Tokyo Night, the light theme is a cool
  paper, and the secondary is Moss (teal-green) instead of russet. Accent unchanged.
- **2026-10-29 (logo):** logo files follow the v3 palette: ink #1F1C26 → #1F2335, washi #F4F0E8 → #C0CAF5 (the
  dark-theme text), russet mark → Moss #1F7A66 (`arva-mark-moss.svg`). File names keep "ink" / "washi" for the
  light / dark versions. Their embedded Content Credentials (C2PA) were removed: they certified the old colours.
  `favicon.svg` now switches ink → washi on dark browser tabs itself.
- **2026-10-29 (later):** light page lightened to #FDFDFB (almost white, a hint of paper; sunken #F1F2F6); Moss moved
  from teal to leaf-green: #237A50 light, #8BD8A9 dark (was #1F7A66 / #73DACA); `arva-mark-moss.svg` follows.
- **2026-10-29 (two-tone logo):** new `-moss` logo files: the leaf in Moss (#237A50 light, #8BD8A9 dark), the
  wordmark in `--text`. They are the default on screen; the favicon is the Moss leaf. One-colour files stay for print.
- **2026-10-29 (services):** service colours added (streaming icons); the header's Telegram "Log in" became a primary
  button (accent fill, `--on-accent` label, icon in the label colour) instead of black/white with Telegram blue.
- **2026-10-29 (dark toned down):** the Tokyo Night base read too blue: bg #1A1B26 → #15161C, surface #24283B →
  #1E2029, sunken #292E42 → #262935, line #3B4261 → #333645, text #C0CAF5 → #C6CBE4, text-2 #9AA5CE → #9CA3C4. The washi
  logo files follow the new dark `--text`.
- **2026-10-29 (service icons):** the per-service colours were dropped again; service icons use the accent.
- **2026-10-29 (purple or Moss):** added the "Purple or Moss" section: purple for action and state, Moss for
  identity and labels, neutral for the rest.
- **2026-10-29 (one on-state colour):** selected pills, open toggles, switch knobs and count badges all use the
  same "on" colour (`--accent-tint`-style tint with accent text); solid `--accent` fill is kept for primary buttons.
- **2026-10-29 (brighter on-state):** dark `--accent-tint` #2F3058 → #3F3F75; the old tint had the grey controls'
  brightness, so selected and unselected pills looked alike.
- **2026-10-29 (fonts):** added "Which font when"; small label headings and the Filter button were in Archivo by
  accident (heading tags) and are now Plex Sans.
- **Site note (ar-va.com):** the owner chose "identity only" for the site: logo, fonts and colours follow these
  rules, while the site keeps its frosted-glass pill header and toolbars, pill-shaped controls, and the music
  shelf's vinyl animations, which sections 5, 6, 8 and 9 would otherwise rule out.
