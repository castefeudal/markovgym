import { readFile, writeFile } from 'node:fs/promises';

const body = await readFile(new URL('../app-body.html', import.meta.url), 'utf8');
const BUILD_VERSION = '2026.09-r14-substitution-engine';
const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'MARKOV MADE GYM',
  applicationCategory: 'HealthApplication',
  operatingSystem: 'Web',
  isAccessibleForFree: true,
  inLanguage: ['ru', 'en'],
  description: 'Local-first система тренировок, прогрессии, питания, состава тела и прозрачных fitness-расчётов.',
  featureList: ['Библиотека упражнений', 'Конструктор тренировки', 'Run Mode и таймер отдыха', 'Прогресс', 'Питание', 'MARKOV MADE LAB'],
};

const bootCss = `
  :root {
    --mmg-boot-bg:#070a0e;
    --mmg-boot-text:#f6f8fb;
    --mmg-boot-muted:#84909f;
    --mmg-boot-line:rgba(221,231,243,.14);
    --mmg-boot-accent:#86b6ff;
    color-scheme:dark;
  }
  html[data-theme="soft"] {
    --mmg-boot-bg:#eaf0f6;
    --mmg-boot-text:#172330;
    --mmg-boot-muted:#5d6d7e;
    --mmg-boot-line:rgba(24,40,58,.14);
    --mmg-boot-accent:#386aa9;
    color-scheme:light;
  }
  html[data-theme="ivory"] {
    --mmg-boot-bg:#f6f5f1;
    --mmg-boot-text:#1a1e23;
    --mmg-boot-muted:#68717b;
    --mmg-boot-line:rgba(28,33,39,.13);
    --mmg-boot-accent:#4f7197;
    color-scheme:light;
  }
  html, body { min-height: 100%; }
  body { margin: 0; background: var(--mmg-boot-bg); }
  #mmg-boot { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 24px; background: var(--mmg-boot-bg); color: var(--mmg-boot-text); transition: opacity 180ms ease, transform 180ms ease, visibility 180ms; }
  #mmg-boot[data-hidden="true"] { opacity: 0; visibility: hidden; pointer-events: none; transform: translateY(-4px); }
  .mmg-boot-card { width: min(100%, 420px); }
  .mmg-boot-mark { display: grid; grid-template-columns: 42px 1fr; gap: 14px; align-items: center; }
  .mmg-boot-mark svg { width: 42px; height: 42px; }
  .mmg-boot-brand { font: 750 12px/1.25 system-ui, sans-serif; letter-spacing: .11em; }
  .mmg-boot-brand span { display: block; margin-top: 3px; color: var(--mmg-boot-muted); font-size: 10px; letter-spacing: .22em; }
  .mmg-boot-rail { position: relative; height: 2px; margin: 32px 0 14px; overflow: hidden; background: var(--mmg-boot-line); }
  .mmg-boot-rail::after { content: ""; position: absolute; inset: 0 auto 0 -35%; width: 35%; background: var(--mmg-boot-accent); animation: mmg-boot-measure 1.15s ease-in-out infinite; }
  .mmg-boot-status { margin: 0; color: var(--mmg-boot-muted); font: 520 13px/1.5 system-ui, sans-serif; }
  .mmg-boot-error { display: none; margin-top: 20px; padding: 14px; border: 1px solid rgba(240,102,107,.42); color: var(--mmg-boot-text); font: 500 13px/1.5 system-ui, sans-serif; }
  #mmg-boot[data-error="true"] .mmg-boot-error { display: block; }
  #mmg-boot[data-error="true"] .mmg-boot-rail { display: none; }
  .mmg-boot-error button, .mmg-boot-error a { min-height: 40px; margin: 12px 8px 0 0; padding: 0 13px; border: 1px solid var(--mmg-boot-line); background: transparent; color: inherit; font: inherit; text-decoration: none; cursor: pointer; }
  .mmg-boot-error button { border-color: var(--mmg-boot-accent); color: var(--mmg-boot-accent); }
  @keyframes mmg-boot-measure { from { transform: translateX(0); } to { transform: translateX(390%); } }
  @media (prefers-reduced-motion: reduce) { #mmg-boot { transition: none; } .mmg-boot-rail::after { animation: none; left: 32%; width: 36%; } }
`

const icon = `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="9" fill="none" stroke="currentColor" stroke-opacity=".20"/><path d="M9 29V11h4.4l6.6 10.2L26.6 11H31v18h-4.3V18.9l-5.9 9.1h-1.6l-5.9-9.1V29z" fill="var(--mmg-boot-accent)"/><path d="M9 33h22" stroke="var(--mmg-boot-accent)" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="1.5 3.5" opacity=".7"/></svg>`

const index = `<!doctype html>
<html lang="ru" data-theme="obsidian">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>MARKOV MADE GYM — тренировки, прогресс и техника</title>
  <meta name="description" content="MARKOV MADE GYM — local-first система тренировок, прогрессии, питания, состава тела и прозрачных fitness-расчётов.">
  <meta name="author" content="Павел Марков / MarkovMade">
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
  <meta name="theme-color" content="#070a0e">
  <meta name="application-name" content="MARKOV MADE GYM">
  <meta name="color-scheme" content="dark light">
  <link rel="canonical" href="https://castefeudal.github.io/markovgym/">
  <link rel="alternate" hreflang="ru" href="https://castefeudal.github.io/markovgym/">
  <link rel="alternate" hreflang="en" href="https://castefeudal.github.io/markovgym/?lang=en">
  <link rel="alternate" hreflang="x-default" href="https://castefeudal.github.io/markovgym/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="MARKOV MADE GYM">
  <meta property="og:title" content="MARKOV MADE GYM — тренировки, прогресс и техника">
  <meta property="og:description" content="Local-first система тренировок, прогрессии, питания, состава тела и MARKOV MADE LAB.">
  <meta property="og:url" content="https://castefeudal.github.io/markovgym/">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="MARKOV MADE GYM">
  <meta name="twitter:description" content="Библиотека упражнений, Run Mode, прогресс и инструменты зала без регистрации.">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230B0C0E'/%3E%3Cpath d='M14 46V18h6.5l11.5 17 11.5-17H50v28h-6.6V29.4L32.6 45.6h-1.2L20.6 29.4V46z' fill='%2386B6FF'/%3E%3C/svg%3E">
  <link rel="apple-touch-icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%230B0C0E'/%3E%3Cpath d='M14 46V18h6.5l11.5 17 11.5-17H50v28h-6.6V29.4L32.6 45.6h-1.2L20.6 29.4V46z' fill='%2386B6FF'/%3E%3C/svg%3E">
  <link rel="manifest" href="./manifest.webmanifest">
  <script>
  (function () {
    try {
      var saved = localStorage.getItem('mmg.theme.v2') || localStorage.getItem('mmg_theme_v7');
      if (['obsidian','soft','ivory'].indexOf(saved) !== -1) {
        document.documentElement.setAttribute('data-theme', saved);
        document.documentElement.style.colorScheme = saved === 'obsidian' ? 'dark' : 'light';
      }
      var settings = JSON.parse(localStorage.getItem('mmg.settings.v1') || '{}');
      if (settings && ['balanced','comfortable','large'].indexOf(settings.reading) !== -1) {
        document.documentElement.setAttribute('data-reading', settings.reading);
      }
    } catch (_) {}
  })();
  </script>
  <link rel="stylesheet" href="./app.css?v=${BUILD_VERSION}">
  <link rel="stylesheet" href="./lab.css?v=${BUILD_VERSION}">
  <style>${bootCss}</style>
  <script type="application/ld+json">${JSON.stringify(structuredData)}</script>
</head>
<body data-app-version="${BUILD_VERSION}">
  <div id="mmg-boot" role="status" aria-live="polite" aria-label="Загрузка MARKOV MADE GYM">
    <div class="mmg-boot-card">
      <div class="mmg-boot-mark">${icon}<div class="mmg-boot-brand">MARKOV MADE<span>GYM</span></div></div>
      <div class="mmg-boot-rail" aria-hidden="true"></div>
      <p class="mmg-boot-status" id="mmg-boot-status">Интерфейс</p>
      <div class="mmg-boot-error" id="mmg-boot-error">
        <strong>Не удалось загрузить приложение.</strong>
        <div>Локальные данные не изменены. Повтори загрузку или открой сохранённую резервную версию.</div>
        <button type="button" id="mmg-boot-retry">Повторить</button>
        <a href="./legacy-base.html">Открыть резервный экран</a>
      </div>
    </div>
  </div>
${body}
  <script src="./bootstrap.js" defer></script>
  <script src="./app.js?v=${BUILD_VERSION}" defer></script>
  <script type="module" src="./gym-tools.js"></script>
</body>
</html>
`;

await writeFile(new URL('../index.html', import.meta.url), index);
console.log(`index.html written: ${Buffer.byteLength(index)} bytes`);
