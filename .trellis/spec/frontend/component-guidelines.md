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

### Absolute icon buttons inside inputs

The shared `Button` applies a one-pixel Y translation while pressed. An icon
button positioned inside an input must opt out of that movement so its target
and glyph remain centered for idle, hover, focus, active, and disabled states.

- Use a fixed icon-button size and a fixed SVG size.
- Prefer transform-free absolute centering such as `inset-y-0 my-auto`.
- Override the shared press translation with
  `active:not-aria-[haspopup]:translate-y-0` on the embedded control.
- Keep the shared press treatment unchanged for normal buttons.
- Cover the merged active-state class in a component test and verify pointer-
  down geometry in a browser regression test when the bug is visual.

Wrong: `top-1/2 -translate-y-1/2` on a shared `Button`; its active translation
replaces the centering transform while pressed.

Correct: a fixed-size shared `Button` centered with `inset-y-0 my-auto` and an
explicit active `translate-y-0` override.

### Progressive disclosure for troubleshooting controls

Settings pages must not present routine preferences, diagnostic evidence, and
host recovery as peer actions. Keep the common local action directly visible
and place support-only controls in one native `<details>` disclosure.

- The collapsed state exposes one common action plus one descriptive summary.
- Diagnostic preview/export remain inside the disclosure.
- Host check/recovery buttons render only when a workspace is authorized.
  Before authorization, show the prerequisite as status text instead of
  disabled controls.
- Do not show an idle host status such as "not checked". Announce only active
  checking, ready, or error results after the user requests them.
- Preserve a light, unframed hierarchy. A divider and chevron are sufficient;
  do not turn the advanced region into another card.
- Cover collapsed desktop/mobile geometry and both authorization branches in
  tests.

Wrong:

```tsx
<Button>Reset UI</Button>
<Button>Preview diagnostics</Button>
<Button>Export diagnostics</Button>
<Button disabled={!workspace}>Check host</Button>
<Button disabled={!workspace}>Recover host</Button>
```

Correct:

```tsx
<Button>Reset UI</Button>
<details>
  <summary>Diagnostics and recovery</summary>
  <DiagnosticActions />
  {workspace ? <HostActions /> : <HostAuthorizationRequirement />}
</details>
```

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

### Visual fixtures for host-backed drawers

Visual tests for drawers that call Tauri/native commands must install their
deterministic command map with `page.addInitScript` before `page.goto`. A mock
installed after the app loads can miss startup calls, and a catch-all response
must not return a valid payload for unrelated commands.

- Locate rail and drawer controls by role plus accessible name, not a `title`
  attribute that the shared component does not own.
- Wait for observable UI state such as the authorized repository, changed file,
  and review region. Do not use fixed sleeps or larger global timeouts.
- Removing `test.skip` is not enough: assert that visible text geometry does
  not overlap an absolute drawer and stays inside the review viewport.
- When a responsive drawer width changes by breakpoint, cover each width with
  computed geometry. For the Git drawer this is 24rem at `lg` and 27rem at
  `2xl`, with the main review starting at the drawer's right edge.
- Keep screenshots for representative theme/viewport combinations, and use
  assertion-only breakpoint cases when another snapshot would add no visual
  information.

Wrong: assert `toBeVisible()` on review text that exists in the DOM but is
painted underneath an absolute drawer.

Correct: compare the drawer box with the rendered text range, assert zero gap
between drawer and review at desktop breakpoints, then capture the snapshot.

### Workspace rail items

Workspace rail entries share one stable item component even when their targets
are different surface types such as a drawer, dialog, or inline main workspace.

- Use fixed width and height for every item so label length, active content, or
  hover state cannot shift the rail.
- Keep icon size, label typography, hover treatment, and `focus-visible`
  treatment in the shared item component.
- A toggle item's `aria-pressed` and active styling must be derived from the
  exact surface it opens. Do not bind active state to a drawer while the click
  handler opens a different dialog or route.
- Drawer items are mutually exclusive. Commands that leave the drawer context,
  such as opening Assets or Deliver, clear the current drawer selection before
  opening their target surface.
- Preserve the target surface's information architecture. Visual consistency
  in the rail does not require forcing a full-width workspace into a narrow
  drawer.

Wrong: `Design` renders `active={designDrawerOpen}` but its click handler closes
the drawer and opens a separate specimen dialog.

Correct: `Design` toggles `designDrawerOpen`; `Deliver` uses the same rail item
treatment but continues to open the established inline delivery workspace.

---

## Common Mistakes

<!-- Component-related mistakes your team has made -->

(To be filled by the team)
