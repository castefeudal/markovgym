// DOM adapter: domain rules and persistence remain in their existing modules.
  export function renderNutritionTrendView(context) {
    const { $, S, t, esc, weightTrendFn } = context;
    var host = $('nutrition-trend');
    if (!host) return;
    var trend = weightTrendFn ? weightTrendFn(S.diary) : null;
    if (!trend || trend.status !== 'ok') {
      host.innerHTML = '<p class="small">' + esc(t('nutritionTrend.empty')) + '</p>';
      return;
    }
    var fmtWeight = function (value) { return value == null ? '—' : esc(Number(value).toFixed(1)) + ' ' + esc(t('kg')); };
    var fmtDelta = function (value) { return value == null ? '—' : (value > 0 ? '+' : '') + esc(Number(value).toFixed(1)) + ' ' + esc(t('kg')); };
    var coverage = t('nutritionTrend.coverage', { n7: trend.observations7d, n21: trend.observations21d });
    host.innerHTML = '<div class="nutrition-trend-metrics"><div><span>' + esc(t('nutritionTrend.scale')) + '</span><b>' + fmtWeight(trend.scaleWeightKg) + '</b></div><div><span>' + esc(t('nutritionTrend.mean')) + '</span><b>' + fmtWeight(trend.trendWeightKg) + '</b></div><div><span>' + esc(t('nutritionTrend.delta')) + '</span><b>' + fmtDelta(trend.delta7dKg) + '</b></div><div><span>' + esc(t('nutritionTrend.rate')) + '</span><b>' + fmtDelta(trend.rate21dKgPerWeek) + (trend.rate21dKgPerWeek == null ? '' : '<small> / ' + esc(S.lang==='en'?'week':'нед.') + '</small>') + '</b></div></div><p class="tiny">' + esc(coverage) + '</p><p class="tiny">' + esc(t('nutritionTrend.method')) + '</p>';
  }
