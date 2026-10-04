// Feature-owned presentation; the app supplies current state and adapters.
export function renderWorkoutView(context) {
  const { $, BY_ID, S, completedSetCount, ensureSetLog, esc, exName, exStill, labelEq, labelMu, premiumIcon, renderCoachWorkout, round, saveWorkout, t, updateMobileBar, v7NextPlanDay } = context;

    var list = $('workout-list');
    var rows = S.workout.map(function (item) {
      return { item: item, ex: BY_ID[item.id] };
    }).filter(function (r) { return !!r.ex; });

    if (rows.length !== S.workout.length) {
      S.workout = rows.map(function (r) { return r.item; });
      saveWorkout();
    }

    if (!rows.length) {
      var nextPlanDay = v7NextPlanDay();
      var planAction = S.plan && nextPlanDay >= 0
        ? '<button class="btn btn-primary btn-sm" type="button" data-v7-action="planDay" data-v7-day="' + nextPlanDay + '">' + esc(S.lang === 'en' ? 'Load next programme session' : 'Загрузить следующую тренировку программы') + '</button>'
        : '';
      list.innerHTML = '<div class="empty v10-workout-empty"><b>' + esc(t('workoutEmptyTitle')) + '</b><p>' +
        esc(S.plan && nextPlanDay >= 0 ? (S.lang === 'en' ? 'Your programme already has the next session ready. Load it or build a session manually from the library.' : 'В программе уже готова следующая тренировка. Загрузи её одним действием или собери сессию вручную из библиотеки.') : t('workoutEmptyText')) + '</p><div class="v10-empty-actions">' + planAction + '<a class="btn btn-solid btn-sm" href="#library">' +
        esc(t('workoutOpenLibrary')) + ' →</a></div></div>';
    } else {
      list.innerHTML = rows.map(function (r, i) {
        var ex = r.ex, item = r.item;
        return '<article class="workout-item" data-id="' + esc(item.id) + '" data-done="' + !!item.done + '">' +
          '<div class="workout-order">' +
            '<button type="button" data-move="-1" ' + (i === 0 ? 'disabled' : '') + ' aria-label="' + esc(t('wUp')) + '">↑</button>' +
            '<button type="button" data-move="1" ' + (i === rows.length - 1 ? 'disabled' : '') + ' aria-label="' + esc(t('wDown')) + '">↓</button>' +
          '</div>' +
          '<img class="workout-thumb" src="' + esc(exStill(ex)) + '" data-still="' + esc(exStill(ex)) + '" data-ex-media alt="" width="96" height="96" loading="lazy" decoding="async">' +
          '<div class="workout-main">' +
            '<button class="workout-name" type="button" data-open="' + esc(item.id) + '">' + esc(exName(ex)) + '</button>' +
            '<p class="workout-sub"><span class="meta-tag">' + esc(labelMu(ex.target)) + '</span><span class="meta-tag">' + premiumIcon('equipment') + esc(labelEq(ex.equip)) + '</span></p>' +
            (item.groupId?'<p class="workout-group-badge">'+esc(S.lang==='en'?({superset:'Superset', 'tri-set':'Tri-set', circuit:'Circuit'}[item.groupType]||'Group'):({superset:'Суперсет', 'tri-set':'Три-сет', circuit:'Круг'}[item.groupType]||'Группа'))+'</p>':'')+
            '<div class="workout-fields">' +
              '<label>' + esc(t('wSets')) + '<input class="num" type="number" min="1" max="20" step="1" inputmode="numeric" data-field="sets" value="' + esc(item.sets) + '"></label>' +
              '<label>' + esc(t('wReps')) + '<input type="text" inputmode="numeric" data-field="reps" value="' + esc(item.reps) + '"></label>' +
              '<label>' + esc(t('wWeight')) + '<input type="text" inputmode="decimal" data-field="weight" value="' + esc(item.weight) + '"></label>' +
            '</div>' +
            '<div class="workout-set-summary"><span>' + esc(t('workoutSetsDone',{done:completedSetCount(item),total:item.sets})) + '</span><span class="workout-set-dots" aria-hidden="true">' + ensureSetLog(item).map(function(set){return '<i class="workout-set-dot" data-done="'+String(!!set.completed)+'"></i>';}).join('') + '</span></div>' +
            '<details class="workout-group-menu"><summary>'+esc(S.lang==='en'?'Group exercises':'Сгруппировать упражнения')+'</summary><div><button type="button" data-group-create="superset">'+esc(S.lang==='en'?'Superset with next':'Суперсет со следующим')+'</button><button type="button" data-group-create="tri-set">'+esc(S.lang==='en'?'Tri-set with next two':'Три-сет со следующими двумя')+'</button><button type="button" data-group-create="circuit">'+esc(S.lang==='en'?'Circuit with next two':'Круг со следующими двумя')+'</button>'+(item.groupId?'<button type="button" data-group-clear>'+esc(S.lang==='en'?'Ungroup':'Разъединить')+'</button>':'')+'</div></details>'+
            '<label class="workout-complete"><input type="checkbox" data-field="done"' + (item.done ? ' checked' : '') + '> ' + esc(t('wDone')) + '</label>' +
          '</div>' +
          '<button class="icon-btn" type="button" data-remove aria-label="' + esc(t('wRemove')) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
        '</article>';
      }).join('');
    }

    var sets = rows.reduce(function (sum, r) { return sum + (Number(r.item.sets) || 0); }, 0);
    var done = rows.filter(function (r) { return r.item.done; }).length;
    $('w-count').textContent = rows.length;
    $('w-sets').textContent = sets;
    $('w-time').textContent = rows.length ? Math.max(10, round(sets * 2.6 + rows.length * 2)) : 0;
    $('w-progress').textContent = t('wProgress', { done: done, total: rows.length });
    var progress = rows.length ? Math.round(done / rows.length * 100) : 0;
    $('w-progress').style.setProperty('--workout-progress', progress + '%');
    renderCoachWorkout();
    updateMobileBar();

}
