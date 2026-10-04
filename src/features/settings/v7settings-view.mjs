// Feature-owned presentation; the app supplies current state and adapters.
export function renderV7SettingsView(context) {
  const { $, S, esc, renderV7Diagnostics, v7c } = context;

    if(!$('settings'))return;
    if($('v7-language-title'))$('v7-language-title').textContent=S.lang==='en'?'Language':'Язык';
    if($('v7-language-actions'))$('v7-language-actions').setAttribute('aria-label',S.lang==='en'?'Interface language':'Язык интерфейса');
    if($('v7-language-actions'))$('v7-language-actions').innerHTML=[['ru',S.lang==='en'?'Russian':'Русский'],['en','English']].map(function(item){return'<button type="button" data-lang="'+item[0]+'" aria-pressed="'+String(S.lang===item[0])+'">'+esc(item[1])+'</button>';}).join('');
    $('v7-settings-sub').textContent=v7c('settingsSub');
    $('v7-theme-title').textContent=v7c('appearance');
    $('v7-log-title').textContent=v7c('logging');
    $('v7-coach-title').textContent=v7c('coach');
    $('v7-data-title').textContent=v7c('data');
    if($('v10-reading-title'))$('v10-reading-title').textContent=S.lang==='en'?'Readability':'Читаемость';
    if($('v10-reading-text'))$('v10-reading-text').textContent=S.lang==='en'?'Choose interface scale without changing the information structure.':'Выбери размер интерфейса без потери структуры и информации.';
    $('v7-log-text').textContent=S.lang==='en'?'RIR/RPE stay hidden unless you explicitly enable them.':'RIR/RPE скрыты, пока вы явно их не включите.';
    $('v7-coach-text').textContent=S.lang==='en'?'Show contextual explanations and guidance.':'Показывать контекстные объяснения и рекомендации.';
    $('v7-data-text').textContent=v7c('settingsDataText');
    var themes=[
      ['obsidian',S.lang==='en'?'Obsidian':'Обсидиан',S.lang==='en'?'Deep graphite · maximum contrast':'Глубокий графит · максимум контраста'],
      ['soft',S.lang==='en'?'Mist':'Туман',S.lang==='en'?'Cool soft surface · lower visual load':'Холодная мягкая поверхность · меньше визуальной нагрузки'],
      ['ivory',S.lang==='en'?'Ivory':'Слоновая кость',S.lang==='en'?'Clean editorial light · maximum clarity':'Чистая редакционная светлая · максимум ясности']
    ];
    $('v7-theme-actions').innerHTML=themes.map(function(x){var active=S.theme===x[0];return'<button class="theme-choice" type="button" data-v7-theme="'+x[0]+'" aria-pressed="'+String(active)+'"><span class="theme-choice-swatch" data-theme-preview="'+x[0]+'" aria-hidden="true"><i></i></span><span class="theme-choice-copy"><b>'+esc(x[1])+'</b><small>'+esc(x[2])+'</small></span><span class="theme-choice-check" aria-hidden="true">'+(active?'✓':'')+'</span></button>';}).join('');
    if($('v10-reading-actions')){
      var reading=[
        ['balanced',S.lang==='en'?'Balanced':'Сбалансировано',S.lang==='en'?'Flagship default':'Оптимальный баланс плотности и чтения'],
        ['comfortable',S.lang==='en'?'Comfort':'Комфорт',S.lang==='en'?'Slightly larger text and controls':'Крупнее текст и элементы управления'],
        ['large',S.lang==='en'?'Large':'Крупно',S.lang==='en'?'Maximum readability':'Максимум читаемости']
      ];
      $('v10-reading-actions').innerHTML=reading.map(function(x){var active=S.settings.reading===x[0];return'<button class="reading-choice" type="button" data-v10-reading="'+x[0]+'" aria-pressed="'+String(active)+'"><span><b>'+esc(x[1])+'</b><small>'+esc(x[2])+'</small></span><i aria-hidden="true">'+(active?'✓':'')+'</i></button>';}).join('');
    }
    $('v7-logging-actions').innerHTML='<button class="v7-setting-toggle" type="button" data-v7-setting="rir" aria-pressed="'+String(!!S.settings.rir)+'"><span>'+esc(v7c('rir'))+'</span><b>'+(S.settings.rir?'ON':'OFF')+'</b></button><button class="v7-setting-toggle" type="button" data-v7-setting="rpe" aria-pressed="'+String(!!S.settings.rpe)+'"><span>'+esc(v7c('rpe'))+'</span><b>'+(S.settings.rpe?'ON':'OFF')+'</b></button>';
    $('v7-coach-actions').innerHTML='<button class="v7-setting-toggle" type="button" data-v7-coach aria-pressed="'+String(!!S.coachOn)+'"><span>'+esc(v7c('coachOn'))+'</span><b>'+(S.coachOn?'ON':'OFF')+'</b></button>';
    $('v7-data-actions').innerHTML='<button class="btn btn-solid btn-sm" type="button" data-v7-data="export">'+esc(v7c('export'))+'</button><button class="btn btn-solid btn-sm" type="button" data-v7-data="import">'+esc(v7c('import'))+'</button><button class="btn btn-quiet btn-sm btn-danger" type="button" data-v7-data="clear">'+esc(v7c('clear'))+'</button>';
    if($('v7-diagnostics-title'))$('v7-diagnostics-title').textContent=S.lang==='en'?'On-device app diagnostics':'Диагностика приложения на этом устройстве';
    if($('v7-diagnostics-intro'))$('v7-diagnostics-intro').textContent=S.lang==='en'?'Local technical state for troubleshooting. Nothing here is sent anywhere.':'Техническое состояние для локальной проверки. Эти сведения никуда не отправляются.';
    renderV7Diagnostics();

}
