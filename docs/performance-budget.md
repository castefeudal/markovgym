# Static performance budgets

The site stays dependency-light and static. CI measures raw and gzip size for the largest first-party shell assets so future features do not silently grow the first load.

| Asset | Raw limit | gzip limit |
| --- | ---: | ---: |
| `app.js` | 600,000 B | 180,000 B |
| `app.css` | 230,000 B | 50,000 B |
| Modular CSS files under `styles/` | 95,000 B total | 24,000 B total |
| `index.html` | 150,000 B | 40,000 B |
| `gym-tools.js` | 50,000 B | 16,000 B |

Run `npm run budget` locally. Limits apply to the generated production shell, so run `npm run build:index` before checking after markup changes. Raise a limit only with a measured reason and a deliberate performance trade-off.
