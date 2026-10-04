// Feature-owned presentation; the app supplies current state and adapters.
export function renderExerciseTechniqueView(context, ex) {
  const { $, C, L, detailAlertCard, detailCueCard, detailKindLabel, detailLevelLabel, detailStepLabel, detailText, esc, exCardZone, exerciseTechniqueModel, factRow, labelEq, labelMu, labelZone, qsa, setModalTabActive, t } = context;

    var model = exerciseTechniqueModel(ex);
    var zone = C && C.card ? exCardZone(ex) : null;
    var kindLabel = detailKindLabel(ex);
    var levelLabel = detailLevelLabel(ex);
    var secondary = ex.secondary.length ? ex.secondary.map(labelMu).join(', ') : detailText('нет выраженных вторичных', 'no major secondary muscles');

    $('modal-head-sub').textContent = detailText('Полный разбор техники, контроля и прогрессии', 'Complete technique, control and progression breakdown');
    $('modal-media-status').textContent = ex.custom ? detailText('Свое изображение', 'Custom image') : detailText('GIF · полный кадр', 'GIF · full frame');
    $('modal-media-expand-label').textContent = detailText('Развернуть', 'Expand');
    $('modal-media-expand').setAttribute('aria-label', detailText('Развернуть демонстрацию упражнения', 'Expand exercise demonstration'));

    var tabLabels = {
      'modal-technique': detailText('Техника', 'Technique'),
      'modal-cues-section': detailText('Подсказки', 'Cues'),
      'modal-errors-section': detailText('Ошибки', 'Errors'),
      'modal-dose-section': detailText('Прогрессия', 'Progression'),
      'modal-swap-section': detailText('Замены', 'Substitutes')
    };
    qsa('[data-modal-jump]', $('modal-tabs')).forEach(function (button) {
      button.textContent = tabLabels[button.dataset.modalJump] || button.textContent;
    });

    $('modal-overview-kicker').textContent = detailText('Профиль движения', 'Movement profile');
    $('modal-overview-title').textContent = detailText('Что важно знать до первого повтора', 'What to know before the first rep');
    $('modal-technique-kicker').textContent = detailText('Пошагово', 'Step by step');
    $('modal-technique-title').textContent = detailText('Техника выполнения', 'Execution technique');
    $('modal-technique-lede').textContent = detailText('Сначала посмотри полный цикл на GIF, затем пройди шаги сверху вниз. Повторяй только ту амплитуду, которую можешь контролировать.', 'Watch the full GIF cycle first, then work through the steps from top to bottom. Repeat only the range you can control.');
    $('modal-cues-kicker').textContent = detailText('Контроль движения', 'Movement control');
    $('modal-cues-title').textContent = detailText('Ключевые подсказки', 'Key cues');
    $('modal-errors-kicker').textContent = detailText('Самопроверка', 'Self-check');
    $('modal-errors-title').textContent = detailText('Частые ошибки и когда остановиться', 'Common errors and when to stop');
    $('modal-dose-kicker').textContent = detailText('Нагрузка', 'Loading');
    $('modal-dose-title').textContent = detailText('Дозировка и прогрессия', 'Dosing and progression');
    $('modal-swap-kicker').textContent = detailText('Альтернатива', 'Alternative');
    $('modal-swap-title').textContent = detailText('Нужна замена', 'Need a substitute');
    $('modal-swap-lede').textContent = detailText('Выбери причину — покажем ближайшие варианты по целевой мышце и доступному оборудованию.', 'Pick a reason and we will show the closest options for the same target and available equipment.');

    $('modal-quick').innerHTML =
      '<div><span>' + esc(detailText('Уровень', 'Level')) + '</span><b>' + esc(levelLabel) + '</b></div>' +
      '<div><span>' + esc(detailText('Тип', 'Type')) + '</span><b>' + esc(kindLabel) + '</b></div>' +
      '<div><span>' + esc(detailText('Цель', 'Target')) + '</span><b>' + esc(labelMu(ex.target)) + '</b></div>';

    var facts = factRow(t('zoneLabel'), labelZone(ex.zone)) +
      factRow(t('muscleLabel'), labelMu(ex.target)) +
      factRow(t('equipmentLabel'), labelEq(ex.equip)) +
      factRow(t('kindLabel'), kindLabel) +
      factRow(t('levelLabel'), levelLabel) +
      factRow(t('secondaryLabel'), secondary);
    $('modal-facts').innerHTML = facts;

    $('modal-steps').innerHTML = model.steps.map(function (step, index) {
      return '<li><div class="modal-step-copy"><span class="modal-step-stage">' +
        esc(detailStepLabel(index, model.steps.length)) + '</span><p>' + esc(step) + '</p></div></li>';
    }).join('');

    var cueCards = [
      detailCueCard(detailText('Исходное положение', 'Set-up'), model.setup, 'setup'),
      detailCueCard(detailText('Главный ориентир', 'Primary cue'), model.cues[0] || (zone && zone.key ? L(zone.key) : model.control), 'key'),
      detailCueCard(detailText('Дыхание и брейс', 'Breathing & brace'), model.breathing, 'breath'),
      detailCueCard(detailText('Амплитуда', 'Range'), model.range, 'range'),
      detailCueCard(detailText('Темп и контроль', 'Tempo & control'), model.control, 'control')
    ];
    if (model.tips.length > 1) cueCards.push(detailCueCard(detailText('Дополнительный ориентир', 'Extra cue'), model.tips.slice(1).join(' '), 'tip'));
    $('modal-cues').innerHTML = cueCards.join('');

    var errors = [];
    model.mistakes.forEach(function (item) {
      errors.push(detailAlertCard(detailText('Частая ошибка', 'Common error'), item, 'warning'));
    });
    model.contra.forEach(function (item) {
      errors.push(detailAlertCard(detailText('Когда остановиться / заменить', 'When to stop / substitute'), item, 'safety'));
    });
    if (!errors.length) {
      errors.push(detailAlertCard(detailText('Самопроверка', 'Self-check'), detailText('Если траектория, положение корпуса или амплитуда заметно меняются от повтора к повтору — снизь нагрузку и верни контроль.', 'If path, body position or range changes noticeably from rep to rep, reduce the load and regain control.'), 'warning'));
    }
    $('modal-errors').innerHTML = errors.join('');
    setModalTabActive('modal-technique');

}
