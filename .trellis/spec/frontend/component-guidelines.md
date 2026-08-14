# Component Guidelines

> How components are built in this project.

---

## Overview

Components render typed domain projections and dispatch commands; they do not
decode persisted/provider payloads or own the authoritative workflow state.
Shared controls come from `src/components/ui/` and visual behavior follows the
existing quiet, work-focused application shell.

---

## Component Structure

- Keep pure formatting/projection helpers above the component or in a neighboring
  view-model module when reused or complex.
- Define props, then the named component. Use composition for panels, rows and
  disclosures rather than adding unrelated modes to a monolith.
- Keep effects in hooks and event handlers. Rendering must be side-effect free.
- Add the closest focused test beside the component; use Playwright for geometry,
  focus, responsive and native-dialog behavior that jsdom cannot prove.

---

## Props Conventions

- Use named interfaces with `readonly` fields for non-trivial props.
- Pass domain projections and explicit callbacks, not the entire store or service
  registry.
- Use discriminated unions when visible states require different data.
- Do not accept credential values, arbitrary filesystem paths or caller-authored
  approval authority as component props.

---

## Styling Patterns

Tailwind utility classes are the default; `cn` composes conditional classes and
shared primitives use `class-variance-authority`. Stable controls declare fixed
dimensions. Prefer transform/opacity animation, respect reduced motion and keep
pressed states from shifting absolutely positioned controls.

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

### Workspace chrome restore

The desktop rail (`Collapse sidebar`) and any drawer hide control are independent.
Collapsing one or both must leave a discoverable restore on the workspace shell.

- Keep `Expand sidebar` on `[data-workspace-root]`, not inside `OutputCanvas` or
  another replaceable canvas surface. Run-error, Git review, and empty-state
  views unmount that canvas, which would strand the user.
- Style the restore as a chrome control (circular, bordered, background, shadow),
  never a bare glyph on the dotted canvas.
- When the rail and drawer are both gone, reserve the canvas top-left origin so
  background / grid / minimap controls sit beside the restore instead of under
  it.
- Restoring expands the rail only. The rail remains the navigation back to
  Agent, Files, Git, Design, and Deliver.
- Cover hide-then-collapse and collapse-then-hide. Presence in the accessibility
  tree is not enough if the control is `display: none` or painted under canvas
  tools.

Wrong: mount `Expand sidebar` only as the first `OutputCanvas` toolbar item.

Correct: render a shell-level `Expand sidebar` whenever `sidebarCollapsed` is
true, and reserve a toolbar slot only when the drawer is also closed.

---

## Common Mistakes

- Treating DOM presence as proof that content is visible when a drawer overlaps it.
- Rendering duplicate controls for one action instead of one accessible button.
- Showing inferred percentages, ETAs or completion without source evidence.
- Nesting operational page sections in decorative cards and reducing scanability.
- Binding `aria-pressed` to a different surface than the click handler opens.
- Mounting the only sidebar restore control inside a canvas surface that run
  error, review, or empty states can replace.
