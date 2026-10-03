function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

/** Render the pure chart model as localized, accessible SVG markup. */
export function renderProgressChart(model, { label, unit, digits = 1, emptyText, legendText }) {
  const safeLabel = escapeHtml(label);
  if (model?.status !== 'ready') {
    return `<div class="v10-chart-empty"><b>${safeLabel}</b><p class="tiny">${escapeHtml(emptyText)}</p></div>`;
  }

  const { width, height, padding, ticks, firstDate, lastDate, points, count } = model;
  const grid = ticks.map((tick) => {
    const y = tick.y.toFixed(1);
    return `<line class="prog-grid" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"/>`;
  }).join('');
  const yLabels = ticks.map((tick) => `<text class="prog-axis" x="4" y="${tick.labelY.toFixed(1)}">${tick.value.toFixed(digits)}</text>`).join('');
  const dateLabels = `<text class="prog-axis" x="${padding.left}" y="${height - 6}">${escapeHtml(firstDate.slice(5))}</text><text class="prog-axis" x="${width - padding.right}" y="${height - 6}" text-anchor="end">${escapeHtml(lastDate.slice(5))}</text>`;
  const dots = points.map((point) => `<circle class="prog-dot" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3"><title>${escapeHtml(`${point.date} · ${point.value.toFixed(digits)} ${unit}`)}</title></circle>`).join('');
  const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(`${label} · ${count}`)}">${grid}${yLabels}${dateLabels}<path class="prog-avg" d="${model.averagePath}"/><path class="prog-line" d="${model.linePath}"/>${dots}</svg>`;
  return `<div class="prog-chart">${svg}<p class="tiny v8-chart-legend">${escapeHtml(`${label} · ${legendText}`)}</p></div>`;
}
