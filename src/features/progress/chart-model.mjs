const WIDTH = 560;
const HEIGHT = 200;
const PADDING = Object.freeze({ left: 42, right: 10, top: 14, bottom: 24 });

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function path(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
}

/** Pure plotting geometry for dated measurements. It returns data, never HTML. */
export function progressChartModel(entries, field, { limit = 60, flatRange = field === 'sleep' ? 0.5 : 1 } = {}) {
  const latest = new Map();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const value = entry?.[field];
    if (!validDate(entry?.date) || typeof value !== 'number' || !Number.isFinite(value)) continue;
    latest.set(entry.date, { date: entry.date, value });
  }

  const points = [...latest.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-Math.max(2, Math.floor(limit)));
  if (points.length < 2) return { status: 'insufficient', count: points.length, points };

  const values = points.map((point) => point.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const spanFloor = Number.isFinite(flatRange) && flatRange > 0 ? flatRange : 1;
  if (max - min < spanFloor) {
    max += spanFloor / 2;
    min -= spanFloor / 2;
  }
  const padding = (max - min) * 0.12;
  min -= padding;
  max += padding;

  const x = (index) => PADDING.left + (index / (points.length - 1)) * (WIDTH - PADDING.left - PADDING.right);
  const y = (value) => PADDING.top + (1 - (value - min) / (max - min)) * (HEIGHT - PADDING.top - PADDING.bottom);
  const positioned = points.map((point, index) => ({ ...point, x: x(index), y: y(point.value) }));
  const average = positioned.map((_, index) => {
    const window = values.slice(Math.max(0, index - 6), index + 1);
    return window.reduce((sum, value) => sum + value, 0) / window.length;
  });
  const averagePoints = average.map((value, index) => ({ x: x(index), y: y(value) }));
  const ticks = Array.from({ length: 4 }, (_, index) => {
    const value = min + ((max - min) * index) / 3;
    const tickY = y(value);
    return { value, y: tickY, labelY: tickY + 3.5 };
  });

  return {
    status: 'ready',
    count: positioned.length,
    width: WIDTH,
    height: HEIGHT,
    padding: PADDING,
    points: positioned,
    averagePoints,
    linePath: path(positioned),
    averagePath: path(averagePoints),
    ticks,
    firstDate: positioned[0].date,
    lastDate: positioned[positioned.length - 1].date,
  };
}
