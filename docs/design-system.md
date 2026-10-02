# MARKOV MADE GYM design system

## Principles

Use a quiet, high contrast training interface. Put the next action first, keep exercise and set data easy to scan, and reserve the accent for actions or state. Obsidian is graphite with a cool blue accent. Soft and Ivory keep the same hierarchy on light canvases.

## Color tokens

Theme values are owned by the theme blocks in `app.css`. Shared components now read the semantic tokens below. The old palette values remain behind aliases in those theme blocks during the staged migration; new component rules must not reference `--v8-*` color names.

| Token | Use |
| --- | --- |
| `--bg-canvas`, `--bg-workspace` | Page and secondary workspace backgrounds |
| `--bg-surface` | Cards and panels |
| `--bg-elevated`, `--bg-overlay` | Raised controls and overlays |
| `--text-primary` | Main text |
| `--text-secondary` | Supporting labels and descriptions |
| `--text-muted` | Quiet metadata |
| `--border-subtle` | Low emphasis boundaries |
| `--border-strong` | Focused or important boundaries |
| `--accent`, `--accent-hover`, `--accent-soft` | Primary action and selection |
| `--positive`, `--warning`, `--critical` | Meaningful result states |

Do not use state colors as decoration. Avoid gold trim, repeated glow, glass effects, and small all caps labels.

## Typography and spacing

Use the system UI stack already declared in `app.css`. The shared `styles/features/readability.css` layer keeps visible labels, captions, and controls at 14 px or larger and reading copy at 16 px or larger. Keep body text at a readable line height and use tabular numerals for load, reps, time, and measurements. Existing spacing uses a compact 4/8/12/16/24/32 px rhythm. Prefer the existing spacing custom properties and component rules over one off values.

## Components and states

- Buttons have a visible hover, pressed, disabled, and keyboard focus state. Primary buttons mark the next action.
- Panels use `--bg-surface`, a subtle border, and consistent internal spacing.
- Inputs keep visible labels and validation next to the affected field.
- Empty states explain the next useful action. Error states preserve entered data and offer a retry or recovery path.
- Scrollable regions must be keyboard reachable and have an accessible name.

## Stylesheet ownership

The generated shell loads the style layers in this order: `styles/tokens.css`, `styles/reset.css`, `styles/base.css`, `styles/components.css`, `styles/layout.css`, `styles/features/legacy-product.css`, `app.css`, the feature sheets, `lab.css`, then the shared readability rules. This preserves the previous cascade while giving tokens, reset, typography, shared components, layout and feature rules clear homes.

`styles/features/legacy-product.css` is a documented migration boundary for older product components. `app.css` currently holds the later presentation and theme overrides; move rules from it into the owning layer only when the resulting cascade is verified. Feature rules live beside their feature markup (`exercise.css`, `program.css`, `workout.css`, `nutrition.css`). Every stylesheet must be linked by the index builder, precached by the service worker, copied by Pages, and covered by artifact-drift checks. The aggregate modular-layer budget prevents this split from becoming unbounded.

## Themes, accessibility, and motion

Obsidian, Soft, and Ivory share component geometry and semantic tokens. Keep text contrast strong in each theme. Use semantic controls, explicit labels, focus indicators, and `aria-live` only for changes the user needs announced. Respect `prefers-reduced-motion`; animation must not carry information by itself.

## Responsive rules

The layout adapts at the existing 1024, 900, 840, 640, and 520 px breakpoints. Check 360×800, 390×844, and 430×932 phones, tablet, and desktop. Exercise actions and Run Mode controls remain reachable at 360 px. Check both horizontal overflow and the keyboard path through any horizontally scrolling content.
