# DESIGN.md — VIBEMASTER Console UI

This project uses a dark mastering-console interface inspired by the supplied VIBEMASTER reference.
The UI should feel like a precise audio/video production tool: dense, quiet, technical, and ready for repeated work.

## 1. Visual Direction

- Full black workspace with thin section dividers.
- Panels are dark charcoal, almost flat, with 1px borders.
- Primary action color is amber.
- Technical status, meters, selected states, and active accents use cyan.
- Text is compact and mostly monospaced.
- Layout should prioritize scanning: left control rail, wide main analysis/work area, dense forms.

## 2. Color Tokens

| Role | Color |
|---|---|
| App background | `#030303` |
| Panel background | `#101010` |
| Raised panel | `#151515` |
| Border | `#232323` |
| Strong border | `#333333` |
| Primary text | `#e7e7e7` |
| Secondary text | `#8a8a8a` |
| Muted text | `#5f5f5f` |
| Cyan accent | `#00d6c8` |
| Amber accent | `#ffb000` |
| Warning | `#f6b73c` |
| Error | `#ff5c5c` |

## 3. Typography

- Default UI font: `Geist Mono`, `SFMono-Regular`, `Menlo`, `Monaco`, monospace.
- Labels are uppercase, 10px, muted, with `0.08em` letter spacing.
- Body controls use 12px-13px monospaced text.
- Numerical/status values use monospaced text, right-aligned where possible.
- Do not use hero-scale typography inside the app. This is a work console, not a landing page.
- Use wide letter spacing only for labels and command buttons.

## 4. Layout

### Shell

- Top bar: 58px, black, 1px bottom border.
- Brand: `VIBE` in white + `MASTER` in amber.
- Right status: cyan dot + short state text.
- Main surface: `display: grid`.
- Desktop: `272px` left rail + flexible main area.
- Mobile: single column, top rail first.

### Panels

- Use `.vm-panel` for framed surfaces.
- Radius: 5px-6px.
- Border: `1px solid #232323`.
- Padding: 14px-16px.
- Do not nest decorative cards. Nested sections may use simple dividers or compact rows.

## 5. Components

### Buttons

- Primary command: amber fill, black text, uppercase, letter-spaced.
- Secondary command: dark fill, border, light text.
- Danger command: dark fill with red text/border, no bright red blocks unless confirming destructive state.
- Buttons should be rectangular with 5px radius.

### Inputs

- Background: `#0b0b0b`.
- Border: `#2a2a2a`.
- Focus: cyan border and subtle cyan outline.
- Text: monospaced, compact.
- Placeholder: muted gray.

### Dropzones

- Dashed cyan border for primary ingest areas.
- Cyan text for accepted/active state.
- The dropzone should look like a technical file bay, not a friendly upload card.

### Meters / Progress

- Track and render progress use thin bars.
- Fill color: cyan.
- No thick rounded progress bars.

### Tables / Lists

- Prefer compact rows, separators, and right-aligned values.
- Each row should have a clear index, title, duration/status, and actions.
- Hover states should be subtle, using border or background shifts only.

## 6. Page-Specific Direction

### Editor

- Left rail: source ingest, title, tracks, audio preview, render command.
- Main area: background, overlay, render settings, tracklist/result.
- Render CTA should be the strongest element and use amber.

### History

- Same black console shell.
- Completed exports appear as compact technical records with thumbnails.
- Use status/date metadata and restrained action buttons.

### Settings

- Left rail: preset slots.
- Main area: selected preset editor.
- Forms should be dense and sectioned by labels, not large visual cards.

## 7. Don't

- Do not use blue as the primary accent.
- Do not use gradients as the main surface.
- Do not use large rounded cards, marketing sections, or hero copy.
- Do not use pastel palettes.
- Do not add decorative blobs, orbs, illustrations, or stock imagery.
- Do not make the interface feel like a dashboard landing page.
