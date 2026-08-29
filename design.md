# Design — connect

This is the locked interface system for the app. The original layered chat shell,
existing behaviour, and warm paper / deep green / rust palette are preserved.
New capabilities are added inside that shell without replacing its navigation.

## Genre

Functional chat workspace with compact, familiar navigation.

## Macrostructure family

- App pages use a persistent 64 px mobile / 72 px desktop vertical server rail.
- A 300 px contextual navigator follows the rail for servers, channels, DMs, and
  matching.
- The conversation surface fills the remaining width.
- Server member lists are a persistent 256 px inspector on desktop and a drawer
  on smaller screens.
- Form and content pages use one readable column beside the same server rail.
- Do not replace the vertical rail with a top workspace bar unless the product
  owner explicitly requests another redesign.

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

- Headings and body use the native UI sans stack.
- Native monospace is reserved for user IDs and technical values.
- Interactive labels remain legible and actions have at least a 44 px target on
  touch layouts.

## Feature integration

- Cross-app search and notification settings live as utility icons in the server
  rail.
- Group DMs appear with one-to-one DMs in the contextual navigator.
- Reply, quote, reactions, saved messages, and attachments stay attached to the
  message and composer flow.
- Role controls stay in the member inspector and wrap below member identity when
  needed.
- Public server discovery, user discovery, saved messages, and matching history
  remain tabs in cross-app search.

## Interaction and motion

- Visible result means silent success.
- Keyboard focus is immediate and visible.
- Hover-only controls are not the sole route to an action.
- Motion is limited to short opacity and transform transitions, with reduced
  motion respected.

## Exports

`tokens.css` remains the source of truth for the preserved palette, spacing,
focus, and state tokens. Tailwind aliases remain in `src/styles/globals.css` so
new feature components share the same colours as the original interface.
