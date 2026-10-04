# Production performance budgets

Run npm run quality to regenerate production assets and check raw/gzip budgets.

| Asset | Raw limit | gzip limit |
| --- | ---: | ---: |
| Authored app.js | 440,000 B | 125,000 B |
| Single compiled app.css | 255,000 B | 46,000 B |
| Deferred markup ui.html | 117,000 B | 28,000 B |
| Initial index.html | 10,000 B | 4,000 B |
| All compiled runtime chunks | 480,000 B | 160,000 B |
| Lazy LAB gym-tools.js | 50,000 B | 16,000 B |

The entry preloads compact markup and runtime. Mounting markup before initialization preserves DOM bindings. This reduces the initial document; markup still transfers on first launch. It does not eliminate total HTML transfer.

Esbuild emits ESM runtime with split dynamic imports. LAB, methods and secondary engines retain lazy loading. The service worker precaches generated chunks and markup for offline launches. Installation downloads these intentionally; media is cached on demand. Budgets cover every generated runtime chunk. CI checks generated-asset drift.
