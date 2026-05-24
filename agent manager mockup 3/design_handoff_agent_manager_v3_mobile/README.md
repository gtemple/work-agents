# Handoff v3 Addendum: Mobile / Responsive Layout

## What this is

A **purely additive** follow-up to v1 and v2. Adds responsive behavior so the dashboard works on phones and narrow viewports (≤720px). Nothing in v1 or v2 changes — this is one CSS media-query block, one new state variable in `App`, one button added to `TitleBar`.

## Recommended workflow

Same pattern as v2 — apply after v1 and v2 are merged. Order is **v1 → v2 → v3** if you're staging them, but v3 is so small it can also be folded directly into the v2 PR if the timing works.

**Tell Claude Code**: *"This is a v3 addendum that adds responsive/mobile layout on top of v1 and v2. Apply last. All changes are additive — no existing behavior changes at desktop widths."*

## What's in this folder

```
design_handoff_agent_manager_v3_mobile/
├── README.md                            (this file)
├── additions/
│   └── styles.mobile.css                (~200 lines of @media (max-width: 720px) rules
│                                         plus one default rule for .title .hamb)
└── edits/
    ├── app.jsx.edits.md                 (3 small wiring edits — drawer state + backdrop + close-on-select)
    └── components.jsx.edits.md          (1 edit — hamburger button in TitleBar)
```

## Apply order

1. Append `additions/styles.mobile.css` to the existing `<style>` block in the HTML (place just before the existing "help overlay" CSS section). Also add the single default rule `.title .hamb { display: none; }` somewhere in the desktop `.title` styles — this keeps the hamburger hidden at desktop widths.
2. Apply the 3 small edits in `edits/app.jsx.edits.md`.
3. Apply the 1 small edit in `edits/components.jsx.edits.md`.

## Design Spec

### Breakpoints

- `≤ 720px` — primary mobile layout
- `≤ 380px` — extra-narrow phones (single-column stats, hide non-essential tab actions)

### What gets hidden

- Left rail (`.rail`) — hidden by default, returns as a slide-in drawer when the hamburger is tapped
- Bottom log (`.log`) — hidden entirely (per-agent activity is still accessible inside the chat view)
- Right side panel (`.side`, split-layout only) — hidden
- Filter bar (`.filterbar`) — hidden (source/sort filters become a follow-up, not v3)
- Window-chrome dots, breadcrumb separator, refresh button "saved 4" label, several status-bar segments — hidden to make room for what matters

### What stays / what changes

- **Title bar** — height bumps from 30px to 44px. Hamburger button on the left, app title in the center, abbreviated meta on the right (running + cost only).
- **Tabs** — horizontal scroll, no scrollbar UI. Tap to filter.
- **Triage row** — was a 4-column grid `[num | meta | body | actions]`. Becomes a 2-column grid `[num | rest]` with rest stacked vertically: meta → body → actions. Action buttons (`investigate / save / no`) become a 3-column row at full width, 38px tall — proper tap targets.
- **Sessions row** — was a 6-column grid `[status | session | kind | tokens | cost | when]`. Collapses to 3 columns: `[status | title | when]`. Tokens/cost/kind hidden.
- **Status bar** — keeps `running` + `needs input` + `cost` + `help`. Drops the granular `queued / done / error` counts and the kbd hints (no use on touch).
- **Chat view header** — drops branch pill, PR link, elapsed time, tokens (still in the underlying data, just not on the chrome). Only `✕` button remains on the right.
- **Chat rows** — drop the timestamp column. Glyph + message only.
- **Chat input footer** — shrinks padding, drops the `⌘↵` hint (no keyboard shortcut on mobile).
- **Workspace overlay tabs** — horizontal scroll.
- **Memory side-nav** — was a 200px vertical column. Becomes horizontal scrolling top tabs with bottom-border active indicator.
- **Memory editor (about.md)** — line gutter shrinks to 28px, smaller font.
- **Memory list rows** (keys, repos) — collapse to `[icon | name+sub | ⋯]`. Masked secret, scope, last-used are hidden.
- **Schedules form** — single-column. Cron dropdown + add button stack under name + prompt.
- **Schedules table** — each row becomes a 3-column grid `[checkbox | name/prompt/last | ⋯]`. The "next run" column is dropped.
- **Stats strip** — 6 cells → 2 cells × 3 rows. At ≤380px → 1 cell per row.
- **Stats sparkline** — shrinks to 60px tall, bars 5px min.
- **Stats heatmap** — horizontal scroll (don't try to fit 24 hours into 360px). Inner grid keeps a min-width of 600px.
- **Stats top sessions table** — rows become `[rank | title | tokens]` with the ref tucked under the title and the cost column dropped.

### Drawer behavior

- Tap hamburger → rail slides in from the left (~86vw wide, max 320px), backdrop dims the rest
- Tap backdrop → drawer closes
- Tap any item inside that performs navigation (open agent, open workspace) → drawer auto-closes
- No swipe-to-close in v3 (could add via touch-event handlers later if needed)
- The rail is `position: fixed` inside the @media block so it overlays the main content without reflowing the grid

### Performance / touch notes

- Tap targets: triage action buttons are 38px tall in mobile (vs 26px desktop), session rows are 12px padded, hamburger is 32×32px
- Scroll surfaces use `-webkit-overflow-scrolling: touch`
- Custom scrollbars hidden inside horizontal-scroll regions (tabs, sub-nav) — keeps the chrome clean

### What's intentionally NOT here

- **Swipe-to-triage** on cards — would be a great mobile gesture (swipe right = save, swipe left = dismiss). Skipped in v3 because it requires touch event handling + animation library work. Open for v4.
- **Pull-to-refresh** — same reason.
- **Bottom nav bar** — considered, rejected. The desktop tabs work fine on mobile after the horizontal-scroll treatment, and a separate bottom nav would conflict with the status bar.
- **Mobile-specific empty states / hero callouts** — none added. Keeping the same density discipline.
- **Filter bar collapse** — currently hidden entirely on mobile. A follow-up could fold it into a "Filters" pill that opens a sheet, but not needed for v3.

### Real implementation notes

1. **viewport meta tag** is already in the HTML head from v1; double-check it survives translation into your framework's index template.
2. **Drawer state** — in production, consider closing the drawer on route changes if your app routes within the dashboard. The prototype is single-screen so this doesn't matter, but a real app would benefit from a `useEffect(() => setDrawerOpen(false), [location.pathname])`.
3. **Touch handlers for the drawer** — the current implementation only opens via tap. To add swipe-from-edge, attach `touchstart`/`touchmove` handlers on the main area and translate the drawer on drag. Out of scope for v3.
4. **Safe-area insets** — for iOS notch / home-indicator support, add `padding-bottom: env(safe-area-inset-bottom)` to the status bar and `padding-top: env(safe-area-inset-top)` to the title bar. Not in the prototype because preview iframes don't have notches; production should.
5. **The hamburger glyph** is a Unicode `≡` (U+2261). If JetBrains Mono renders it inconsistently across platforms, swap for a 16×16 SVG icon — the rest of the design is glyph-driven but this one is critical chrome.
