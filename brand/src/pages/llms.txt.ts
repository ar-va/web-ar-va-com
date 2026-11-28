// brand.ar-va.com/llms.txt: the index an AI tool reads first (llmstxt.org format).
import { SITE, kitFiles } from '../lib/files';

export const GET = () => new Response(`# ARVA design language

> ARVA is Artur's brand: software Artur makes (music.ar-va.com, vincent.ar-va.com, anon.ar-va.com, Solaris in progress) for people the usual tools leave out. Slogan: "Digital craft, evermore". Copy in ARVA's voice is written as Artur, in the first person ("I make", never "we"). These are its brand rules: logo, colour, type, layout, components and voice for every ARVA site and product. Follow them when designing or coding for ARVA; if a request conflicts with a rule, follow the rule and say so.

## Read first

- [Brand rules](${SITE}/ARVA-brand-rules.md): every rule, as Markdown. Treat each one as a requirement.
- [Design tokens](${SITE}/arva-tokens.css): all colours (light and dark), fonts, spacing and radii as CSS variables. Use these, never raw hex values.

## Background

- [ar-va.com](https://ar-va.com/): who Artur is, the products, and how they are built.
- [The leaf](${SITE}/story): what the oak leaf stands for, how it is drawn from 18 circles and one line, the name and the three colours.

## Logo files (SVG; never redraw the logo)

${kitFiles('logo').map((f) => `- [${f}](${SITE}/logo/${f})`).join('\n')}

## Avatars (1:1; each also as a 1024 px PNG)

${kitFiles('avatars').map((f) => `- [${f}](${SITE}/avatars/${f})`).join('\n')}
`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
