import type { Theme, Vars } from './theme.ts';

const declarations = (vars: Vars, indent: string) =>
  Object.entries(vars).map(([name, value]) => `${indent}${name}: ${value};`).join('\n');

// Nextcloud sets each chosen theme directly on <body> and loads this file in no fixed order, so these selectors win by
// specificity. Guests have no theme attribute, so they follow the device. High contrast stays Nextcloud's own.
const HIGH_CONTRAST = '[data-theme-light-highcontrast], [data-theme-dark-highcontrast]';

/** The code for the Custom CSS app. */
export function exportCss(theme: Theme): string {
  return `/* Nextcloud theme made with vincent.ar-va.com. Light and dark. High contrast themes are left alone. */
html:root,
body:not([data-theme-dark], ${HIGH_CONTRAST}) {
${declarations(theme.light, '  ')}
}

@media (prefers-color-scheme: dark) {
  html:root,
  body:not([data-theme-light], ${HIGH_CONTRAST}) {
${declarations(theme.dark, '    ')}
  }
}

body[data-theme-dark] {
${declarations(theme.dark, '  ')}
}
`;
}

/** The two colours for Administration settings > Theming, for what CSS can't reach (emails, first paint). */
export function settings(theme: Theme): { primary: string; background: string } {
  return { primary: theme.light['--color-primary-element'], background: theme.light['--color-background-plain'] };
}
