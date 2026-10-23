# Travian Region-News Userscript Design System

This file is a copy-nearby contract, not a new design system. The userscript runs
inside a live Travian page (`https://cw.x2.international.travian.com/*`) and has
to look like the game wrote it. Nothing here introduces a visual language. It
records the existing one so the single primitive this add-on injects blends in.

## 1. Atmosphere & Identity

Travian reads as a dense, utilitarian war table: parchment-toned panels, tight
metadata rows, and small type that assumes you already know the game. The
userscript inherits that voice wholesale. Its signature is restraint: a region
name appended inside the same sentence, in the same type, as if the game had
always named the region there. The label adds information, never chrome. It
should be invisible to a player scanning the alliance news; it only surfaces
when someone actually reads a row and wants to know where a settlement landed.

## 2. Color

No new color roles. Every value is inherited from the host page at runtime.

| Role | Source | Usage |
|------|--------|-------|
| Text/primary | inherited from the event row | region name and separator |
| Link/default | inherited from Travian's native anchor styling | region link at rest |
| Link/hover | inherited from Travian's native anchor styling | region link on hover |
| Link/visited | inherited from Travian's native anchor styling | region link after a visit |

### Rules
- The primitive declares no color of its own and sets none. It must render
  correctly under Travian's own palette, including any seasonal theme.
- Accent color is never introduced. The only interactive element is the region
  link, which takes the native link treatment already present in the row.
- Any future color need is met by inheritance first, and by adding an inherited
  token row here second. Raw values never appear in this file.

## 3. Typography

### Scale

| Level | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Body (inherited) | 100% inherit | inherit | inherit | region name, separator, link |

### Font Stack
- Primary: inherited from the Travian page (`font: inherit`)
- Mono: not used
- Serif: not used

### Rules
- The primitive sets no family and embeds no web-font rule, so a Travian theme
  change flows through automatically.
- No fixed size is declared. The label matches the surrounding event row.
- Long region names wrap with the paragraph instead of truncating.

## 4. Spacing & Layout

### Base Unit
No spacing scale is introduced. Spacing comes from the row's own inline flow.

| Intent | Value | Usage |
|--------|-------|-------|
| Separator gap | one text space before and after the separator glyph | between coordinate and region |
| Flow | inline | label stays inside the event sentence |

### Rules
- The label is an inline fragment, not a block. It must not break the row's
  paragraph flow or force a new line on wide rows.
- On narrow rows the fragment wraps naturally with the sentence; it never
  overflows the sidebar or introduces horizontal scrolling.
- No margins, padding, or fixed pixel gaps are added.

## 5. Components

### RegionEventLabel

- **Structure**: injected immediately after the event's coordinate anchor
  (`<a class="coordinates ...">...</a>`), inside the same `<li>`. The fragment
  is a separator glyph (the literal `—`, an em dash) followed by a space, then
  the region link: `<a href="/region/<id>">name</a>`. The fixtures show this link
  form as `/region/32` named "Cherusci" and `/region/8` named "Numantia".
- **Variants**: one. No size, tone, or layout variants. Every event type gets the
  identical treatment.
- **Spacing**: none of its own. The separator carries single spaces; the fragment
  flows inline in the event sentence.
- **States**:
  - default: separator plus region link, inherited color and type
  - hover / active / focus: native anchor behavior only, inherited from Travian
  - loading: hidden. No placeholder text, no spinner, no reserved space.
  - empty: hidden. No region resolved means no fragment.
  - error: hidden. A failed lookup leaves the row exactly as Travian rendered it.
- **Accessibility**: keyboard reachability comes from the native `<a>`, so it
  inherits Travian's focus indicator and tab order. No ARIA role is added because
  the anchor already exposes link semantics. The accessible name is the name.
- **Motion**: none. No entry, no exit, no keyframe motion, no decorative motion.
- **Layout**: inline fragment in the event row's text flow (a cluster within a
  sentence). It owns no scroll container.

## 6. Motion & Interaction

### Timing

| Type | Duration | Easing | Usage |
|------|----------|--------|-------|
| None | n/a | n/a | the primitive adds no motion |

### Rules
- The label has no motion. No hover movement, no fade, no reveal.
- Interaction is limited to the native link states Travian already styles.
- Reduced motion support is automatic: there is nothing to reduce.

## 7. Depth & Surface

### Strategy
Flat and inherited: borders-only at most, and only where Travian already puts
them. The primitive contributes no surface of its own.

| Type | Value | Usage |
|------|-------|-------|
| Background | none | no fill behind the label |
| Border | none | no outline around the label |
| Shadow | none | no drop shadow, no glow, no elevation |

### Rules
- The label sits directly on the event row's existing background.
- No inner or outer shadow, no gradient, no texture, no rounded container.
- The only weight added is the separator glyph and the link text.

## 8. Accessibility Constraints & Accepted Debt

### Constraints
- Inherit WCAG behavior from the host page; add no regressions. The region link
  uses Travian's native anchor contrast and native focus indicator.
- Keyboard: reachable and activatable via Enter from the native anchor. No
  custom key handling is added.
- Content stress: long, unbroken region names must wrap and stay inside the
  sidebar at 375px with no horizontal scroll of the event row.
- Reduced motion: nothing to suppress (Section 6), so no media query is needed.
- Hidden states: loading, empty, and error render nothing at all; screen readers
  announce exactly what a non-instrumented row would announce.

### Accepted Debt
| Item | Location | Why accepted | Owner / Exit |
|------|----------|--------------|--------------|
| External tokens are inherited, not duplicated | RegionEventLabel, all sections | The userscript cannot ship Travian's palette, type scale, or spacing tokens; copying them would drift the moment the game restyles. Inheritance keeps the label correct across themes, at the cost of this file not listing concrete values. | Revisit only if Travian changes the anchor styling in a way inheritance cannot follow. |
