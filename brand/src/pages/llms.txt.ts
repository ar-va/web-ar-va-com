// brand.ar-va.com/llms.txt: the index an AI tool reads first (llmstxt.org format).
import { SITE, kitFiles } from '../lib/files';

export const GET = () => new Response(`# ARVA design language

> ARVA's brand rules: logo, colour, type, layout, components and voice for every ARVA site and product. Follow them when designing or coding for ARVA; if a request conflicts with a rule, follow the rule and say so.

## Read first

- [Brand rules](${SITE}/ARVA-brand-rules.md): every rule, as Markdown. Treat each one as a requirement.
- [Design tokens](${SITE}/arva-tokens.css): all colours (light and dark), fonts, spacing and radii as CSS variables. Use these, never raw hex values.

## Background

- [What ARVA builds](${SITE}/story): ARVA's products and how they are built, what the oak leaf stands for, and how it is drawn from 18 circles and one line.

## Logo files (SVG; never redraw the logo)

${kitFiles('logo').map((f) => `- [${f}](${SITE}/logo/${f})`).join('\n')}

## Avatars (1:1; each also as a 1024 px PNG)

${kitFiles('avatars').map((f) => `- [${f}](${SITE}/avatars/${f})`).join('\n')}
`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
