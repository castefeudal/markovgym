# MARKOV MADE GYM design system

## Principles

Use a quiet, high contrast training interface. Put the next action first, keep exercise and set data easy to scan, and reserve the accent for actions or state. Obsidian is graphite with a cool blue accent. Soft and Ivory keep the same hierarchy on light canvases.

## Color tokens

The active themes are defined in `app.css`. New components should use the semantic tokens below; the existing `--v8-*` variables remain compatibility aliases while older styles are consolidated.

| Token | Use |
| --- | --- |
| `--bg-canvas` | Page background |
| `--bg-surface` | Cards and panels |
| `--bg-elevated` | Raised controls and overlays |
| `--text-primary` | Main text |
| `--text-secondary` | Supporting labels and descriptions |
| `--text-muted` | Quiet metadata |
| `--border-subtle` | Low emphasis boundaries |
| `--border-strong` | Focused or important boundaries |
| `--accent`, `--accent-hover`, `--accent-soft` | Primary action and selection |
| `--positive`, `--warning`, `--critical` | Meaningful result states |

Do not use state colors as decoration. Avoid gold trim, repeated glow, glass effects, and small all caps labels.

## Typography and spacing

Use the system UI stack already declared in `app.css`. Keep body text at a readable size and line height; use tabular numerals for load, reps, time, and measurements. Existing spacing uses a compact 4/8/12/16/24/32 px rhythm. Prefer the existing spacing custom properties and component rules over one off values.

## Components and states

- Buttons have a visible hover, pressed, disabled, and keyboard focus state. Primary buttons mark the next action.
- Panels use `--bg-surface`, a subtle border, and consistent internal spacing.
- Inputs keep visible labels and validation next to the affected field.
- Empty states explain the next useful action. Error states preserve entered data and offer a retry or recovery path.
- Scrollable regions must be keyboard reachable and have an accessible name.

## Themes, accessibility, and motion

Obsidian, Soft, and Ivory share component geometry and semantic tokens. Keep text contrast strong in each theme. Use semantic controls, explicit labels, focus indicators, and `aria-live` only for changes the user needs announced. Respect `prefers-reduced-motion`; animation must not carry information by itself.

## Responsive rules

The layout adapts at the existing 1024, 900, 840, 640, and 520 px breakpoints. Exercise actions and Run Mode controls remain reachable at 360 px. Check both horizontal overflow and the keyboard path through any horizontally scrolling content.
