# Design — connect

This is the locked interface system for the app. Product function carries the
screen; decoration does not. Existing routes, behaviour, copy intent, and the
warm paper / deep green / rust palette are preserved.

## Genre

Modern-minimal, with a utilitarian product tone.

## Macrostructure family

- App pages: **Workbench** — one labelled top workspace bar, one contextual
  navigator, and one primary work surface. Supporting lists open on demand.
- Form pages: **Long Document** — one readable column with explicit actions.
- Content pages: **Long Document** — typography and rules only.

## Theme

- Paper: `oklch(0.956541 0.017173 84.587)`
- Surface: `oklch(0.981561 0.016341 79.353)`
- Navigation: `oklch(0.923903 0.030146 78.778)`
- Ink: `oklch(0.241178 0.015345 174.652)`
- Action: `oklch(0.362801 0.054942 189.627)`
- Rust signal: `oklch(0.611686 0.151539 42.503)`

These values are perceptual conversions of the existing colours; do not rotate
the palette between pages.

## Typography

- Display: native serif stack, weight 700, normal style.
- Body: existing UI sans stack, weight 400.
- Mono: native monospace stack, used only for user IDs and technical values.
- Minimum body size: 16 px. Interactive labels remain on one line.

## Spacing

A 4-point named scale lives in `tokens.css`. App chrome is dense; work surfaces
use larger gaps to separate tasks. Components consume named tokens where CSS is
authored directly.

## Motion

- Only opacity and transform may animate.
- State changes use `--ease-out`; no page-load reveals.
- Reduced motion keeps functional feedback and removes spatial movement.

## Microinteractions stance

- Visible result means silent success.
- Keyboard focus is immediate and never animated.
- Hover-only controls are forbidden; touch and keyboard users get the same
  actions.

## CTA voice

- Primary actions are compact dark rectangles with specific verb labels.
- Secondary actions are text or outline controls, never decorative pills.

## Per-page allowances

- App pages use no decorative enrichment.
- Member lists and secondary inspectors are drawers opened by labelled actions.
- Mobile is a single-pane workflow; the current task wins over persistent
  navigation.

## What pages must share

- The preserved palette and top workspace bar.
- The same focus rings, button geometry, spacing scale, and icon set.
- A navigator / work-surface hierarchy rather than stacked Discord-style rails.

## What pages may differ on

- Forms may omit the contextual navigator.
- Dense administration pages may use a wider work surface.

## Exports

### tokens.css

The complete source of truth is [`tokens.css`](tokens.css).

### Tailwind v4 `@theme`

```css
@theme inline {
  --color-connect-paper: var(--color-paper);
  --color-connect-surface: var(--color-surface);
  --color-connect-navigation: var(--color-paper-2);
  --color-connect-highlight: var(--color-paper-3);
  --color-connect-ink: var(--color-ink);
  --color-connect-muted: var(--color-muted);
  --color-connect-action: var(--color-accent);
  --color-connect-danger: var(--color-danger);
  --font-connect-body: var(--font-body);
  --font-connect-display: var(--font-display);
}
```

### DTCG `tokens.json`

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(0.956541 0.017173 84.587)", "$type": "color" },
    "surface": {
      "$value": "oklch(0.981561 0.016341 79.353)",
      "$type": "color"
    },
    "ink": { "$value": "oklch(0.241178 0.015345 174.652)", "$type": "color" },
    "accent": { "$value": "oklch(0.362801 0.054942 189.627)", "$type": "color" }
  },
  "space": {
    "sm": { "$value": "1rem", "$type": "dimension" },
    "md": { "$value": "1.5rem", "$type": "dimension" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 0.956541 0.017173 84.587;
  --foreground: 0.241178 0.015345 174.652;
  --card: 0.981561 0.016341 79.353;
  --card-foreground: 0.241178 0.015345 174.652;
  --primary: 0.362801 0.054942 189.627;
  --primary-foreground: 0.981561 0.016341 79.353;
  --muted: 0.923903 0.030146 78.778;
  --muted-foreground: 0.478407 0.02052 163.966;
  --border: 0.241178 0.015345 174.652;
  --ring: 0.362801 0.054942 189.627;
  --radius: 0.375rem;
}
```
