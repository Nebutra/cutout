# Component Guidelines

> How components are built in this project.

---

## Overview

<!--
Document your project's component conventions here.

Questions to answer:
- What component patterns do you use?
- How are props defined?
- How do you handle composition?
- What accessibility standards apply?
-->

(To be filled by the team)

---

## Component Structure

<!-- Standard structure of a component file -->

(To be filled by the team)

---

## Props Conventions

<!-- How props should be defined and typed -->

(To be filled by the team)

---

## Styling Patterns

<!-- How styles are applied (CSS modules, styled-components, Tailwind, etc.) -->

(To be filled by the team)

---

## Accessibility

### Identity icons that reveal a panel action

When a dock header icon doubles as the affordance for collapsing that dock:

- Render exactly one fixed-size `button`; do not place a static identity icon
  beside a second collapse button.
- Give the button the action name (for example `aria-label="Hide Git"`) and a
  visible hover title or tooltip.
- The default glyph may identify the current dock, while hover and
  `focus-visible` reveal the collapse glyph in the same stable icon box.
- Mark both inner SVG glyphs `aria-hidden="true"` and `focusable="false"`; the
  button owns the accessible semantics.
- Keep the action understandable without animation and disable decorative
  transitions under `prefers-reduced-motion`.
- Test one control, keyboard focus, stable dimensions, glyph state classes, and
  exactly one callback invocation.

Wrong: a Git glyph on the left plus a second `Hide Git` icon on the right.

Correct: one 28x28 `Hide Git` button whose Git glyph swaps to the panel-close
glyph on hover or keyboard focus.

---

## Common Mistakes

<!-- Component-related mistakes your team has made -->

(To be filled by the team)
