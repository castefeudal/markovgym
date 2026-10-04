// Feature-owned presentation; the app supplies current state and adapters.
export function renderHistoryView(context) {
  const { $, S, esc, filteredHistory, historyDetailHtml, historyVisibleCount, renderHistoryFilterOptions, t, totalCompletedHistorySets, totalHistorySets } = context;

    var host = $('hist');
    if (!host) return;
    renderHistoryFilterOptions();
    if (!S.history.length) { host.innerHTML = '<p class="tiny">' + esc(t('histEmpty')) + '</p>'; return; }
    var filtered=filteredHistory(),visible=filtered.slice(0,historyVisibleCount);
    if(!filtered.length){host.innerHTML='<p class="tiny">'+(S.lang==='en'?'No workouts match these filters.':'Нет тренировок по этим условиям.')+'</p>';return;}
    host.innerHTML = visible.map(function (h) {
      var done=(h.items||[]).filter(function(i){return i.done;}).length, doneSets=totalCompletedHistorySets(h), totalSets=totalHistorySets(h);
      var duration=Number(h.durationSec)>0?Math.max(1,Math.round(Number(h.durationSec)/60)):0,prCount=(h.personalRecords||[]).length;
      return '<div class="hist-item"><span><b class="hist-name">' + esc(h.name) + '</b><span class="hist-meta">' + esc(h.date) + ' · ' + esc(t('histMeta', { n: h.items.length, d: done })) + '</span><span class="hist-evidence"><b>'+esc(t('histSetsDone',{done:doneSets,total:totalSets}))+'</b>'+(duration?'<span>'+esc(t('histDuration',{v:duration}))+'</span>':'')+(prCount?'<span class="hist-pr-count">'+(S.lang==='en'?'PRs: ':'PR: ')+prCount+'</span>':'')+'</span></span><span class="hist-actions"><button class="btn btn-quiet btn-sm" type="button" data-hist-detail="'+esc(h.id)+'" aria-expanded="false" aria-controls="hist-detail-'+esc(h.id)+'">'+esc(t('histDetails'))+'</button><button class="btn btn-quiet btn-sm" type="button" data-hist-repeat="' + esc(h.id) + '">' + esc(t('histRepeat')) + '</button><button class="btn btn-quiet btn-sm btn-danger" type="button" data-hist-del="' + esc(h.id) + '" aria-label="' + esc(t('histDelete')) + '">×</button></span>'+historyDetailHtml(h)+'</div>';
    }).join('') + (visible.length < filtered.length ? '<button class="btn btn-quiet btn-sm" type="button" data-history-more>' + esc(t('histMore', { shown: visible.length, total: filtered.length })) + '</button>' : '');

}
