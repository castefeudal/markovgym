# Training controls r73

This change improves the existing training flow. It does not claim to complete
every item in the Flagship Product Transformation brief.

## Delivered behavior

- Run Mode fields have explicit labels. Increment and decrement buttons are
  separate controls and identify the input they change. Adjusting a value keeps
  keyboard focus on the same action so repeated Enter presses remain usable.
- An empty planned value can use the previous recorded performance. Existing
  planned values and saved set drafts retain priority.
- Adding a set copies distance and duration along with repetitions and load;
  completion flags, timestamps and notes are not copied.
- Removing a completed set requires confirmation. Cancelling retains the result.
- Both rest timer panels adjust the persisted deadline, including when paused.
  A subsequent clock tick or reload therefore retains the adjustment.
- Library actions identify their exercise in the accessible name in RU and EN.

## Verification coverage

`training-layout.spec.mjs` adds 27 viewport/theme cases per browser: 320, 360,
375, 390, 430, 768, 1024, 1440 and 1920 pixels in Obsidian, Soft and Ivory.
The 768-pixel case uses a 430-pixel height for landscape coverage. It verifies
44-pixel controls, actionable completion/rest controls, numeric editing and page
overflow. Existing screenshot references remain subject to comparison.

`session-safety.spec.mjs` covers input labels, destructive-action cancellation,
timer adjustment, pause and reload. `production.spec.mjs` covers copying
distance/duration and prefill from actual history.

The build updates the shell, runtime and service worker version together.
IndexedDB and backup schemas are unchanged.
The GitHub Actions browser matrix includes the new layout spec in every browser
job; performance budgets and screenshot comparisons retain their existing limits.

Local verification on 2026-10-21 passed 168 unit tests and all 200 existing
Windows visual comparisons. The full local E2E attempt was interrupted after
repeated browser-context teardown timeouts; it is not a successful full run.
Retained failure contexts and traces are under `artifacts/r73-failures/`.

Lighthouse 13.5.0 on the local static server, without concurrent E2E tests,
measured Performance 54 / Accessibility 100 on the default mobile preset and
Performance 95 / Accessibility 100 on the standard desktop preset. The mobile
performance target is unmet. These results do not establish production CWV.

## Scope limits

This release does not introduce a new visual system or rewrite Today, planning,
analytics, nutrition or LAB. Those existing implementations still require their
own product evaluation against the full brief. Automated browser and Axe checks
do not constitute human usability validation or WCAG certification. Lighthouse
measurements describe a controlled local run, not real-user Core Web Vitals.
