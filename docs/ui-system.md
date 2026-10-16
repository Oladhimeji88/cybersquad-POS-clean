# UI system

The rules every screen follows. Tokens live in `src/styles/globals.css`.

## Spacing (8pt)
- Use Tailwind steps that are multiples of 8px: `2` (8), `4` (16), `6` (24), `8` (32), `10` (40), `12` (48).
- `1` (4px) is allowed only for tight icon-to-label gaps. Avoid `1.5`, `2.5`, `3`, `3.5`, `5` and `7`.
- Rhythm: 16px between related items, 24px between sections, 24px card padding, 32px page padding.
- Heights: controls 36 (compact) / 40 (default) / 48 (large). Buttons, inputs, selects and toggles share them. 36 is the one half-step allowed. Icons 16px inline, 24px in headers, 32px in empty states.

## Type
- One family, Plus Jakarta Sans, for the whole app. Weights 400, 500, 600.
- Scale (size / line height): 12/16, 14/20, 16/24, 18/28, 20/28, 24/32. Line heights stay on the 4px baseline.
- Page title 24 semibold. Section title 18 to 20 semibold. Body 14 to 16. Labels, buttons and table text 14.
- Numbers in tables use tabular figures so columns align.

## Motion
- Classes: `motion-fade`, `motion-rise`, `motion-pop`, `motion-stagger` (on a list parent), `press` and `lift` (on clickable cards).
- 150ms for feedback, 240ms for entrances. Opacity and transform only. Everything is off under reduced motion.

## Icons
- lucide only. One stroke weight (set globally). Decorative icons get `aria-hidden="true"`.
