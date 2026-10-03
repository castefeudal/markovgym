import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProgressChart } from '../src/features/progress/chart-view.mjs';

test('progress chart view renders a localized empty state safely', () => {
  const html = renderProgressChart({ status: 'insufficient' }, {
    label: '<Weight>', unit: 'kg', emptyText: 'Add <two> entries', legendText: '',
  });
  assert.match(html, /&lt;Weight&gt;/);
  assert.match(html, /Add &lt;two&gt; entries/);
  assert.doesNotMatch(html, /<Weight>|<two>/);
});

test('progress chart view renders accessible paths, axes, points and a safe legend', () => {
  const model = {
    status: 'ready', width: 560, height: 200, padding: { left: 42, right: 10 },
    count: 2, firstDate: '2026-01-01', lastDate: '2026-01-03',
    ticks: [{ value: 80, y: 150, labelY: 153.5 }],
    points: [{ date: '2026-01-01', value: 82, x: 42, y: 90 }],
    linePath: 'M42.0 90.0 L550.0 120.0', averagePath: 'M42.0 90.0 L550.0 105.0',
  };
  const html = renderProgressChart(model, {
    label: 'Weight', unit: 'kg', digits: 1, emptyText: '', legendText: 'solid = entries',
  });
  assert.match(html, /role="img" aria-label="Weight · 2"/);
  assert.match(html, /class="prog-avg"/);
  assert.match(html, /class="prog-line"/);
  assert.match(html, /2026-01-01 · 82\.0 kg/);
  assert.match(html, /solid = entries/);
});

test('progress chart view escapes all user facing text in SVG and legend contexts', () => {
  const model = {
    status: 'ready', width: 560, height: 200, padding: { left: 42, right: 10 },
    count: 2, firstDate: '2026-01-01', lastDate: '2026-01-02',
    ticks: [], points: [{ date: '2026-01-01', value: 1, x: 42, y: 80 }],
    linePath: 'M42.0 80.0 L550.0 90.0', averagePath: 'M42.0 80.0 L550.0 85.0',
  };
  const html = renderProgressChart(model, {
    label: '<img src=x>', unit: '" onmouseover="x', digits: 1,
    emptyText: '', legendText: '<script>bad</script>',
  });
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /&quot; onmouseover=&quot;x/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<img|<script|onmouseover="x/);
});
