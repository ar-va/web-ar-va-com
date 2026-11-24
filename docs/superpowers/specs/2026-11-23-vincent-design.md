# Vincent: a theme generator for Nextcloud

Site: **vincent.ar-va.com**. Status: design, awaiting approval. Date: 2026-11-23.

## Why

Theming Nextcloud well is hard. The admin panel offers a primary colour and a background colour, while the interface
uses about 75 colour variables, and pages seen by guests behave differently from pages seen by signed-in people. A theme
that looks right in the Files view can show dark text on a dark card on a public share link.

Vincent lets a Nextcloud admin choose a few colours, get a harmonious light and dark theme, see it on every kind of
Nextcloud screen, and leave with the exact settings and Custom CSS that reproduce it.

## Goals

- Choose colours in several ways and generate matching ones, in the spirit of Material Theme Builder and Canva's colour
  wheel, but built for interface design.
- Generate a **light and dark pair** for every theme (user's decision).
- Preview every element that changes colour, including those that never share a page: Files, public share, login, admin
  and a gallery of components, with realistic file types and information.
- Export step-by-step instructions: what to select in Appearance and accessibility, which primary and background colours
  to enter, and the code for the Custom CSS app.
- Every text and control pair meets WCAG 2.1 AA in both modes, the level Nextcloud itself aims for.

## Non-goals

- Editing individual variables by hand.
- Fonts, corner radii, spacing or layout changes. The export contains colours only.
- Importing an existing theme, accounts, saved themes on a server, or a theme gallery.
- A generated `occ` script. The export gives the steps for the web interface, plus one recovery command.
- Phone-sized Nextcloud previews.

## Anti-goals

- A preview that looks right while the exported CSS behaves differently on a real server.
- Changing Nextcloud's high contrast themes. People choose them for accessibility, so the export must leave them alone.
- A page that could pass as a real Nextcloud login. See "Login preview".

## What Nextcloud does (read from `nextcloud/server` master, latest release 35.0.3)

- Theme variables live in `apps/theming/lib/Themes/`. `css/default.css` shows the full default set.
- Stylesheets: the default theme as `:root`, dark as `:root` inside `@media (prefers-color-scheme: dark)`, and each theme
  scoped as `[data-theme-<id>]`. Theme ids: `default`, `light`, `dark`, `light-highcontrast`, `dark-highcontrast`.
- `<body>` carries a `data-theme-<id>` attribute for each enabled theme. A signed-in person on the system default has
  `data-theme-default`. **Guests have none**, so public share and login pages follow the device's light or dark setting.
- A scoped theme sets its variables directly on `<body>`, so a value set only on `:root` loses there.
- Real pages also load both high contrast themes under `(prefers-contrast: more)`, so guests and system-default users on
  a device asking for more contrast get them automatically. The export must not override that (found on a real 35).
- A person's own primary colour wins over the admin's unless `disable-user-theming` is on.
- `enforce_theme` in `config.php` can lock one theme. Vincent does not need it.
- The Custom CSS app (`theming_customcss`, 1.22.0, Nextcloud 26 to 35) adds one plain stylesheet to user, public and login
  pages. Its order relative to the theme stylesheets is not guaranteed, so the export must win by specificity.
- Recovery if CSS breaks the interface: `occ config:app:delete theming_customcss customcss`.

## Approaches

1. **Our own replica of the screens (chosen by the user).** Lightweight components that use Nextcloud's real variable
   names, so the exported CSS is the CSS that paints the preview. Static, fast, no server. It can drift from Nextcloud,
   which is handled by comparing it with a real instance before launch and after major releases.
2. **Nextcloud's component library (`@nextcloud/vue`).** Exact small components, but AGPL-licensed, adds Vue and an 8.8 MB
   package, and the Files table, share page and admin layouts would still be hand-built.
3. **A real Nextcloud behind the preview.** Perfect accuracy, but needs an always-on server and a public sandbox.

## The page

```text
+--------------------------------------------------------------------------+
| ARVA Vincent                                     [theme]        [Export] |
+----------------------+---------------------------------------------------+
| Your colours         | Files  Public share  Login  Admin  Components     |
|   [ colour wheel ]   |                                     Light | Dark  |
|   Lightness ---o--   | +-----------------------------------------------+ |
|   Primary  #624DB4   | |                                               | |
|                      | |        Live Nextcloud-style preview           | |
| Harmony [Triadic v]  | |                                               | |
| Style   Muted|Bal|Viv| |                                               | |
| Neutral tint ---o--- | |                                               | |
| Page background  [v] | |                                               | |
|                      | |                                               | |
| Palette and contrast | +-----------------------------------------------+ |
+----------------------+---------------------------------------------------+
```

Below 1024 px the controls stack above the preview. The preview keeps its desktop layout and scales to fit.

### Choosing colours

Start from one primary colour. Ways to set it:

- **Wheel:** hue is the angle, colourfulness the distance from the centre, drawn in OKLCH for the current lightness so it
  shows only colours a screen can display. Lightness has its own slider. Handles work by mouse, touch and keyboard.
- **Typed value:** hex, `rgb()`, `hsl()` or `oklch()`, plus number fields for lightness, chroma and hue.
- **From a logo or image:** the browser extracts up to five dominant colours to pick from. The file never leaves the device.

Harmonies: Complementary, Split-complementary, Analogous, Triadic, Tetradic, Monochromatic and Custom. Linked handles
rotate together. In Custom, each handle moves alone. Dragging a linked handle in any other mode rotates the whole group.

Style: **Muted, Balanced (default), Vivid**, which scale colourfulness. **Neutral tint** sets how much of the primary hue
reaches backgrounds, borders and text. **Page background** is Neutral, Primary or Secondary.

The current theme lives in the page address, so reloading keeps it and a link shares it, with no server.

### How colours map to Nextcloud

| Role | Comes from | Nextcloud variables |
| --- | --- | --- |
| Primary | chosen colour | `--color-primary*`, `--color-primary-element*`, `--color-background-selection`, invert flags |
| Secondary | harmony | `--color-primary-light*` and aliases: selected navigation, soft buttons |
| Tertiary | harmony | `--color-favorite`, `--color-mark` |
| Assistant | all harmony hues | `--color-background-assistant`, `--color-border-assistant`, `--color-element-assistant*` |
| Neutral | primary hue, low chroma | main background and its `-rgb`, hover, dark, darker, placeholders, text, borders, shadows, loading, scrollbar |
| Status | fixed red, amber, green, blue, pulled up to 15 degrees toward primary | every `error`, `warning`, `success`, `info` variable, including `-rgb` and `-text` |
| Page background | Neutral, Primary or Secondary | `--color-background-plain`, `-text`, `--background-image-invert-if-bright`, `--image-background: none` |

With two-colour harmonies, Tertiary reuses the nearest hue at a different lightness. With Monochromatic, roles differ by
lightness and chroma. Status colours stay recognisably red, amber, green and blue in every theme.

### Generation rules

- Work in OKLCH and clamp to sRGB by lowering chroma, keeping lightness and hue. Output hex.
- Fix contrast by changing lightness only.
- Text on its background and on its hover state: at least 4.5:1. Controls and icons: at least 3.2:1, the same margin
  Nextcloud uses so hover states still reach 3:1.
- Check Nextcloud's blurred surfaces too: `--color-main-background-blur` over the page background, on login and share pages.
- When a chosen colour must shift to pass, the palette panel shows both values and why.
- The palette panel lists the main pairs and their contrast for the mode on screen.

### Previews

One isolated preview page in an iframe, so the site's own styles cannot leak in. Static sample data for a fictional
company: folders, shared folders, images, video, audio, PDF, documents, spreadsheets, presentations, archives, code and
text, with varied sizes, dates, tags, favourites and share states.

- **Files:** header, navigation with quota, toolbar, filters, breadcrumbs, file table with selected and hover rows, action
  menu, New menu, details sidebar with sharing, upload progress.
- **Public share:** header with Download, file list, note card, footer and the file-request state.
- **Login:** logo, card over the page background, fields, Remember me, primary button, error state.
- **Admin:** settings navigation, Theming (colours, images, Custom CSS field) and Appearance and accessibility.
- **Components:** every button type and state, fields, checkboxes, radios, switches, selects, note cards, toasts, tags,
  avatars, status dots, progress, tabs, menus, dialog, tooltip, Assistant surfaces, text selection and highlights.

Hover, focus, selected and disabled states are shown statically in Components, and work live elsewhere.

#### Login preview

It must not be able to collect credentials: no `<form>`, no password input, fields drawn as inert elements, a permanent
"Preview" label outside the mock, and `noindex` on the preview page. Nextcloud's name and logo are not used in the mock.
The sample logo is fictional, and a person's own logo can be shown locally. The site says it isn't affiliated with Nextcloud.

No code, icons or images are copied from Nextcloud. Variable names are its public theming interface. Icons come from
Material Design Icons (Apache-2.0).

### Export

A dialog with numbered steps and copy buttons:

1. Install and enable **Custom CSS** from Apps.
2. In **Administration settings > Theming**, set **Primary color** and **Background color** to the given values, and turn on
   **Remove background image**.
3. On the same page, turn on **Disable user theming**, since the CSS overrides personal colours anyway.
4. In **Personal settings > Appearance and accessibility**, choose **System default theme** to follow each device, or
   Light or Dark to fix it. Every choice is covered, and high contrast stays Nextcloud's own.
5. Paste the code into **Custom CSS** and save.
6. Reload. If anything breaks, run the recovery command shown.

The admin colours matter for what CSS cannot reach, such as emails and the first paint.

Shape of the exported CSS:

```css
@media not (prefers-contrast: more) {
  html:root,
  body:not([data-theme-dark], [data-theme-light-highcontrast], [data-theme-dark-highcontrast]) { /* light */ }
}

@media (prefers-color-scheme: dark) and (not (prefers-contrast: more)) {
  html:root,
  body:not([data-theme-light], [data-theme-light-highcontrast], [data-theme-dark-highcontrast]) { /* dark */ }
}

body[data-theme-light] { /* light */ }
body[data-theme-dark] { /* dark */ }
```

## Build

- New workspace `vincent/`, Worker **`web-vincent-ar-va-com`**, static assets only, custom domain `vincent.ar-va.com`, the
  same setup as `brand/`.
- Astro with plain TypeScript in the browser, no UI framework. Reuse `shared/` (Layout, Header, Footer, controls, brand).
- `vincent/src/lib/`: `color.ts` (conversions, gamut, contrast), `harmony.ts`, `theme.ts` (choices to light and dark
  variables), `export.ts` (CSS and steps). Pure functions with no browser APIs.
- Tests in `vincent/tests/`, added to the root `npm test`.

## Verification

- Unit tests: conversions against known values, each harmony, and contrast rules across a broad grid of colours in both modes.
- Browser matrix on the exported CSS, using stylesheets in Nextcloud's real structure and in both load orders: guest on
  light and dark devices, system default on both, explicit Light and Dark on both, both high contrast themes untouched.
- Screenshots of every view in both modes, plus keyboard use of the wheel.
- **A real Nextcloud 35** before launch, with the exported CSS on every view, compared with the replica. Docker is not
  installed on this Mac, so this needs either the user's OK to install it or a test instance from the user.

## Calls made without asking

- The role mapping above, including Secondary driving soft selected states.
- OKLCH generation with WCAG 2.1 AA checks, because that is Nextcloud's stated accessibility target.
- The login page as a fourth view and Components as a fifth.
- Theme stored in the address instead of accounts.
- High contrast themes left untouched.

## Left to the builder

Exact chroma and lightness curves, image extraction method, component file structure, and the wheel's rendering details,
within the rules above.

## Launch (user)

Claude never pushes. After the user pushes: Cloudflare, Import a repository, `ar-va/web-ar-va-com`, name
`web-vincent-ar-va-com`, root `vincent`, build `npm run build`, deploy `npx wrangler deploy`, include paths `vincent/*`,
`shared/*`, `package.json`, `package-lock.json`. Add `vincent/*` to `web-ar-va-com`'s exclude paths.
