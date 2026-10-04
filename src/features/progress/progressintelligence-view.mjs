// Feature-owned presentation; the app supplies current state and adapters.
export function progressIntelligenceHtmlView(context) {
  const { S, dashSignal, diaryAvg, diaryDelta, diaryVerdict, esc, premiumIcon, signal, t, totalCompletedHistorySets } = context;

    if(!S.diary.length&&!S.history.length) return '';
    var latestWeight=S.diary.filter(function(d){return typeof d.weight==='number';})[0];
    var latestWaist=S.diary.filter(function(d){return typeof d.waist==='number';})[0];
    var d30=diaryDelta('weight',30), w30=diaryDelta('waist',30), sleep=diaryAvg('sleep',14), mood=diaryAvg('mood',14);
    var latestLift=S.diary.filter(function(d){return !!d.lift;})[0];
    var cutoff30=Date.now()-30*86400000,recentSessions=S.history.filter(function(h){var ts=Date.parse(h.date||'');return isFinite(ts)&&ts>=cutoff30;}),recentWorkSets=recentSessions.reduce(function(sum,h){return sum+totalCompletedHistorySets(h);},0);
    function delta(v,unit){ return v===null?t('progressNeedMore'):(v>0?'+':'')+v.toFixed(1)+' '+unit; }
    function metric(label,value,sub){ if(!value||value==='—')return ''; return '<div class="intel-metric"><span>'+esc(label)+'</span><b>'+esc(value||'—')+'</b><small>'+esc(sub||'')+'</small></div>'; }
    var action=diaryVerdict(diaryDelta('weight',14),w30);
    return '<div class="progress-intel"><div class="progress-intel-head"><div><h3>'+esc(t('progressIntel'))+'</h3><p>'+esc(t('progressIntelSub'))+'</p></div>'+signal(dashSignal().state,dashSignal().label)+'</div><div class="intel-metrics">'+
      metric(t('progressWeight'),latestWeight?latestWeight.weight.toFixed(1)+' '+t('kg'):'—',delta(d30,t('kg')))+
      metric(t('progressWaist'),latestWaist?latestWaist.waist.toFixed(1)+' '+t('cm'):'—',delta(w30,t('cm')))+
      metric(t('progressSleep'),sleep===null?'—':sleep.toFixed(1)+' '+t('hrs'),sleep===null?t('progressNeedMore'):'')+
      metric(t('progressMood'),mood===null?'—':mood.toFixed(1)+' / 5',mood===null?t('progressNeedMore'):'')+
      metric(t('progressStrength'),latestLift?latestLift.lift:'—',latestLift?latestLift.date:t('progressNeedMore'))+
      metric(t('progressSessions'),recentSessions.length?String(recentSessions.length):'—',recentSessions.length?'30 '+(S.lang==='en'?'days':'дней'):t('progressNeedMore'))+
      metric(t('progressWorkSets'),recentWorkSets?String(recentWorkSets):'—',recentSessions.length?'30 '+(S.lang==='en'?'days':'дней'):t('progressNeedMore'))+
      '</div><div class="intel-evidence">'+esc(t('progressEvidence',{diary:S.diary.length,sessions:recentSessions.length}))+'</div><div class="intel-action"><span class="intel-action-icon" aria-hidden="true">'+premiumIcon('progress')+'</span><div><b>'+esc(t('progressAction'))+'</b><p>'+esc(action)+'</p></div></div></div>';

}
