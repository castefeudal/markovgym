// DOM adapter: domain rules and persistence remain in their existing modules.
  export function renderRunView(context) {
    const { $, S, runState, fmtClock, runElapsedSeconds, runPersonalRecordNotice, premiumIcon, esc, t, runTotalSets, saveRunSession, BY_ID, runDoneSets, ensureSetLog, cleanSetRecord, runReferenceForCurrent, setPerformanceSummary, exerciseTechniqueModel, progressionCopy, progressionForItem, exMotion, exStill, labelZone, labelMu, labelEq, exName, detailText, completedSetCount } = context;
    var item = S.workout[runState.ex];
    var stage = $('run-stage');
    var elapsed = fmtClock(runElapsedSeconds());
    if (!item) {
      stage.innerHTML = runPersonalRecordNotice()+'<div class="run-finish-summary">' + premiumIcon('check') +
        '<h3>' + esc(t('runDoneTitle')) + '</h3><p class="small">' + esc(t('runFinishedBody')) + '</p>' +
        '<div class="run-session-meta"><div><span>' + esc(t('runElapsed')) + '</span><b data-run-elapsed-full>' + elapsed + '</b></div>' +
        '<div><span>' + esc(t('sessionExercises')) + '</span><b>' + S.workout.length + '</b></div>' +
        '<div><span>' + esc(t('sessionSets')) + '</span><b>' + runTotalSets() + '</b></div></div></div>';
      $('run-kicker').textContent = t('runFinished');
      $('run-bar-i').style.width = '100%';
      $('run-next').textContent = t('runSaveWorkout');
      $('run-prev').disabled = false;
      $('run-rest').disabled = true;
      saveRunSession();
      return;
    }
    var ex = BY_ID[item.id];
    if (!ex) { runState.ex++; runState.set = 1; renderRunView(context); return; }

    var total = runTotalSets() || 1;
    $('run-bar-i').style.width = Math.round((runDoneSets() / total) * 100) + '%';
    $('run-kicker').textContent = t('runProgress', { i: runState.ex + 1, n: S.workout.length });
    $('run-next').textContent = t('runCompleteSet');
    $('run-rest').disabled = false;
    $('run-prev').disabled = runState.ex === 0 && runState.set === 1;

    var currentLog=ensureSetLog(item), currentSet=currentLog[Math.max(0,runState.set-1)]||cleanSetRecord(null);
    var tracking=ex.custom?ex.trackingType:(ex.zone==='cardio'?'duration':'weight-reps');
    var repLabel=S.lang==='en'?'Reps':'Повторы',durationLabel=S.lang==='en'?'Duration':'Время',weightLabel=S.lang==='en'?'Load, kg':'Вес, кг';
    var trackingFields={
      'weight-reps':[{key:'reps',label:repLabel},{key:'weight',label:weightLabel}],
      'reps-only':[{key:'reps',label:repLabel}],
      duration:[{key:'duration',label:durationLabel}],
      'distance-duration':[{key:'distance',label:S.lang==='en'?'Distance (km)':'Дистанция (км)'},{key:'duration',label:durationLabel}],
      'weight-duration':[{key:'duration',label:durationLabel},{key:'weight',label:weightLabel}],
      'assisted-weight':[{key:'reps',label:repLabel},{key:'weight',label:S.lang==='en'?'Assisted weight':'Вес с поддержкой'}],
      'bodyweight-added-weight':[{key:'reps',label:repLabel},{key:'weight',label:S.lang==='en'?'Added weight':'Дополнительный вес'}]
    };
    var runFields=(trackingFields[tracking]||trackingFields['weight-reps']).map(function(field){
      var initial=currentSet[field.key]||item[field.key]||(field.key==='duration'&&!ex.custom?item.reps:'');
      var adjust=field.key==='weight'||field.key==='reps';
      return '<label>'+esc(field.label)+(adjust?'<span class="run-value-control"><button type="button" data-run-adjust="'+field.key+'" data-direction="-1" aria-label="'+esc(S.lang==='en'?'Decrease '+field.label:'Уменьшить: '+field.label)+'">−</button>':'')+'<input type="text" inputmode="'+(field.key==='duration'?'text':'decimal')+'" data-run-field="'+field.key+'" value="'+esc(initial||'')+'">'+(adjust?'<button type="button" data-run-adjust="'+field.key+'" data-direction="1" aria-label="'+esc(S.lang==='en'?'Increase '+field.label:'Увеличить: '+field.label)+'">+</button></span>':'')+'</label>';
    }).join('');
    var prev=runReferenceForCurrent();
    var prevValue=setPerformanceSummary(prev),prevText=prevValue||t('runNoPrev');
    var setStrip=currentLog.map(function(row,idx){var state=row.completed?'done':(idx===runState.set-1?'current':'pending');return '<button class="run-set-chip" type="button" data-state="'+state+'" data-run-set="'+(idx+1)+'" aria-pressed="'+String(state==='current')+'" aria-label="'+esc(t('runJumpSet',{i:idx+1}))+'">'+(idx+1)+'</button>';}).join('');
    var usePrev=prevValue?'<button class="run-use-prev" type="button" data-run-copy-prev><span>'+premiumIcon('progress')+esc(t('runUsePrevious'))+'</span><b>'+esc(t('runUsePreviousValue',{v:prevText}))+'</b></button>':'';
    var runTechnique=exerciseTechniqueModel(ex);
    var runPrimary=runTechnique.cues[0]||runTechnique.control;
    var progression=progressionCopy(progressionForItem(item));
    var progressionHtml=progression?'<div class="run-progression"><div><span>'+esc(progression.title)+'</span><b>'+esc(progression.value)+'</b></div><p>'+esc(progression.why)+'</p></div>':'';
    var advancedInputs='';
    if(S.settings&&S.settings.rir)advancedInputs+='<label>RIR<input type="number" inputmode="decimal" min="0" max="10" step=".5" data-run-field="rir" value="'+esc(currentSet.rir||'')+'"></label>';
    if(S.settings&&S.settings.rpe)advancedInputs+='<label>RPE<input type="number" inputmode="decimal" min="1" max="10" step=".5" data-run-field="rpe" value="'+esc(currentSet.rpe||'')+'"></label>';
    var setTypeLabels={warmup:S.lang==='en'?'Warm-up':'Разминка',working:S.lang==='en'?'Working':'Рабочий',drop:'Drop',failure:S.lang==='en'?'Failure':'Отказ',backoff:'Back-off',amrap:'AMRAP'};
    var setTypeSelect='<label class="run-set-type">'+esc(S.lang==='en'?'Set type':'Тип подхода')+'<select data-run-set-type>'+Object.keys(setTypeLabels).map(function(key){return'<option value="'+key+'"'+(currentSet.type===key?' selected':'')+'>'+esc(setTypeLabels[key])+'</option>';}).join('')+'</select></label>';
    stage.innerHTML = '<div class="run-shell">' +
      '<div class="run-media-frame"><img class="run-media" src="' + esc(exMotion(ex)) + '" data-still="' + esc(exStill(ex)) + '" data-ex-media alt="" decoding="async"><span class="run-media-badge">' + esc(labelZone(ex.zone)) + '</span></div>' +
      '<div class="run-context"><div class="run-exercise-heading"><div class="run-submeta"><span class="meta-tag">' + esc(labelMu(ex.target)) + '</span><span class="meta-tag">' + premiumIcon('equipment') + esc(labelEq(ex.equip)) + '</span></div>' +
      '<h3 class="run-name">' + esc(exName(ex)) + '</h3></div>' +
      '<div class="run-tech-cues"><div><span>'+esc(detailText('Ключ','Key cue'))+'</span><p>'+esc(runPrimary)+'</p></div><div><span>'+esc(detailText('Дыхание','Breathing'))+'</span><p>'+esc(runTechnique.breathing)+'</p></div></div>' +
      runPersonalRecordNotice()+'<div class="run-current"><div class="run-setline"><b>' + esc(t('runSetLabel', { i: runState.set, n: item.sets })) + '</b><span data-run-elapsed>' + esc(t('runElapsed')) + ' · ' + elapsed + '</span></div>' +
      '<div class="run-current-inputs">' + runFields + '</div><details class="run-details"'+(advancedInputs?' open':'')+'><summary>'+esc(S.lang==='en'?'Set details':'Детали подхода')+'</summary><div class="run-advanced-inputs">'+advancedInputs+'</div>'+setTypeSelect +
      '<label class="run-note-field">'+esc(S.lang==='en'?'Quick note':'Короткая заметка')+'<textarea rows="2" data-run-field="note" maxlength="500" placeholder="'+esc(S.lang==='en'?'Optional set note':'Заметка к подходу, если нужна')+'">'+esc(currentSet.note||'')+'</textarea></label></details>'+
      '<div class="run-prev-record"><b>' + esc(t('runPrevPerformance')) + ':</b> ' + esc(prevText) + '</div>' + progressionHtml + usePrev + '<div class="run-set-strip" aria-label="' + esc(t('workoutSetsDone',{done:completedSetCount(item),total:item.sets})) + '">' + setStrip + '</div><div class="run-set-tools"><button type="button" data-run-add-set>'+(S.lang==='en'?'Add set':'Добавить подход')+'</button><button type="button" data-run-remove-set'+(Number(item.sets)<=1?' disabled':'')+'>'+(S.lang==='en'?'Remove set':'Убрать подход')+'</button>'+(currentSet.completed?'<button type="button" data-run-undo>'+(S.lang==='en'?'Undo completed set':'Отменить подход')+'</button>':'')+'</div></div>' +
      '<div class="run-session-meta"><div><span>' + esc(t('sessionExercises')) + '</span><b>' + (runState.ex + 1) + ' / ' + S.workout.length + '</b></div>' +
      '<div><span>' + esc(t('sessionSets')) + '</span><b>' + runDoneSets() + ' / ' + total + '</b></div>' +
      '<div><span>' + esc(t('runElapsed')) + '</span><b data-run-elapsed-full>' + elapsed + '</b></div></div>' +
      '<div class="run-actions"><button class="btn btn-solid btn-sm" type="button" data-run-open="' + esc(ex.id) + '">' + premiumIcon('technique') + esc(t('openTechnique')) + '</button>' +
      '<button class="btn btn-quiet btn-sm" type="button" data-run-skip="1">' + premiumIcon('skip') + esc(t('runSkip')) + '</button></div></div></div>';
    saveRunSession();
  }
