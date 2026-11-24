import type { Theme, Vars } from './theme.ts';

const declarations = (vars: Vars, indent: string) =>
  Object.entries(vars).map(([name, value]) => `${indent}${name}: ${value};`).join('\n');

// Nextcloud sets each chosen theme directly on <body> and loads this file in no fixed order, so these selectors win by
// specificity. Guests and "system default" follow the device, including its request for more contrast, which Nextcloud
// answers with its high contrast themes: those stay Nextcloud's own.
const HIGH_CONTRAST = '[data-theme-light-highcontrast], [data-theme-dark-highcontrast]';

const SEARCH_LIFT = `    --resting-background: color-mix(in srgb, #ffffff 8%, transparent);
    --resting-background-hover: color-mix(in srgb, #ffffff 12%, transparent);`;

/** The code for the Custom CSS app. */
export function exportCss(theme: Theme): string {
  return `/* Nextcloud theme made with vincent.ar-va.com. Light and dark. High contrast themes are left alone. */
@media not (prefers-contrast: more) {
  html:root,
  body:not([data-theme-dark], ${HIGH_CONTRAST}) {
${declarations(theme.light, '    ')}
  }
}

@media (prefers-color-scheme: dark) and (not (prefers-contrast: more)) {
  html:root,
  body:not([data-theme-light], ${HIGH_CONTRAST}) {
${declarations(theme.dark, '    ')}
  }
}

body[data-theme-light] {
${declarations(theme.light, '  ')}
}

body[data-theme-dark] {
${declarations(theme.dark, '  ')}
}

/* The header search bar in dark mode: Nextcloud gives a dark device on the system default a black overlay that
   disappears into a dark header, and its Dark theme a primary tint that glares with strong colours. Both get a faint
   white lift instead: visible on a dark header, and on a light one it moves away from the dark label (≥ 5.3:1). */
@media (prefers-color-scheme: dark) and (not (prefers-contrast: more)) {
  body:not([data-theme-light], ${HIGH_CONTRAST}) .unified-search-input .unified-search-input__field {
${SEARCH_LIFT}
  }
}

body[data-theme-dark] .unified-search-input .unified-search-input__field {
${SEARCH_LIFT}
}
`;
}

/** The two colours for Administration settings > Theming, for what CSS can't reach (emails, first paint). */
export function settings(theme: Theme): { primary: string; background: string } {
  return { primary: theme.light['--color-primary-element'], background: theme.light['--color-background-plain'] };
}
