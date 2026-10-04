// DOM adapter: domain rules and persistence remain in their existing modules.
  export function cardHtmlView(context, ex) {
    const { S, esc, exName, labelZone, labelMu, labelEq, isFav, inWorkout, exStill, STAR_SVG, premiumIcon, t, exercisePreference, exercisePreferenceLabel, C, detailKindLabel, detailLevelLabel } = context;
    var fav = isFav(ex.id);
    var added = inWorkout(ex.id);
    var name = exName(ex);
    var kind = detailKindLabel(ex);
    var level = detailLevelLabel(ex);
    var meta = ex.secondary.slice(0, 2).map(function (m) {
      return '<span class="meta-tag">+ ' + esc(labelMu(m)) + '</span>';
    }).join('');
    return '<article class="card' + (added ? ' in-workout' : '') + '" data-id="' + esc(ex.id) + '">' +
      '<div class="card-media">' +
        '<img src="' + esc(exStill(ex)) + '" data-still="' + esc(exStill(ex)) + '" data-ex-media alt="' + esc(name) + '" width="320" height="240" loading="lazy" decoding="async">' +
        '<span class="card-badge">' + esc(labelZone(ex.zone)) + '</span>' +
        (added ? '<span class="card-status">' + esc(t('inWorkout')) + '</span>' : '') +
        '<button class="fav-btn" type="button" data-fav="' + esc(ex.id) + '" aria-pressed="' + fav + '" aria-label="' +
          esc(fav ? t('favRemove') : t('favAdd')) + '">' + STAR_SVG + '</button>' +
      '</div>' +
      '<div class="card-body">' +
        '<p class="card-target">' + esc(labelMu(ex.target)) + '</p>' +
        '<h3 class="card-title">' + esc(name) + '</h3>' +
        '<div class="card-specs"><span>' + esc(kind) + '</span><span>' + esc(level) + '</span></div>' +
        '<div class="card-meta"><span class="meta-tag">' + premiumIcon('equipment') + esc(labelEq(ex.equip)) + '</span>' + meta + '</div>' +
        '<button class="btn btn-quiet btn-sm exercise-preference-trigger" type="button" data-pref-toggle="' + esc(ex.id) + '" aria-label="' + esc((S.lang === 'en' ? 'Set preference for ' : 'Настроить предпочтение: ') + name) + '" title="' + esc(S.lang === 'en' ? 'Personal exercise preference' : 'Личное предпочтение упражнения') + '">' + esc(exercisePreferenceLabel(exercisePreference(ex.id))) + '</button>' +
        '<div class="card-actions">' +
          '<button class="btn btn-solid btn-sm" type="button" data-open="' + esc(ex.id) + '">' + esc(t('openTechnique')) + '</button>' +
          '<button class="btn btn-sm btn-add' + (added ? ' btn-primary' : ' btn-solid') + '" type="button" data-add="' + esc(ex.id) + '" aria-label="' +
            esc(added ? (S.lang === 'en' ? 'Remove from workout' : 'Убрать из тренировки') : t('addToWorkout')) + '" title="' + esc(added ? t('inWorkout') : t('addToWorkout')) + '">' +
            (added ? premiumIcon('check') : '+') + '</button>' +
        '</div>' +
      '</div>' +
    '</article>';
  }
