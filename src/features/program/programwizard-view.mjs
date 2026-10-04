// Feature-owned presentation; the app supplies current state and adapters.
export function renderProgramWizardView(context) {
  const { $, S, esc, qs, qsa, wizardState, wizardStepTitles } = context;

    var wiz=$('plan-wizard'); if(!wiz) return;
    var titles=wizardStepTitles(), count=titles.length, stepNav=qs('.wizard-steps',wiz);
    if(stepNav)stepNav.setAttribute('aria-label',S.lang==='en'?'Programme steps':'Шаги программы');
    qsa('.wizard-tab',wiz).forEach(function(b,i){b.innerHTML='<b>'+String(i+1).padStart(2,'0')+'</b>'+esc(titles[i]);b.setAttribute('aria-current',i===wizardState.step?'step':'false');});
    qsa('.wizard-pane',wiz).forEach(function(p,i){p.dataset.active=String(i===wizardState.step);p.hidden=i!==wizardState.step;});
    var bar=qs('.wizard-progress>i',wiz);if(bar)bar.style.width=((wizardState.step+1)/count*100)+'%';
    $('wizard-back').hidden=wizardState.step===0;$('wizard-next').hidden=wizardState.step===count-1;$('plan-build').hidden=wizardState.step!==count-1;
    $('wizard-back').textContent=S.lang==='en'?'Back':'Назад';$('wizard-next').textContent=S.lang==='en'?'Continue':'Продолжить';
    $('wizard-status').textContent=(wizardState.step+1)+' / '+count;
    var selected=function(id){var el=$(id);return el&&el.selectedOptions&&el.selectedOptions[0]?el.selectedOptions[0].textContent:'—';};
    $('wizard-summary').innerHTML='<div class="wizard-summary-item"><span>'+esc(S.lang==='en'?'Goal':'Цель')+'</span><b>'+esc(selected('p-goal'))+'</b></div><div class="wizard-summary-item"><span>'+esc(S.lang==='en'?'Schedule':'График')+'</span><b>'+esc(selected('p-days'))+' × '+esc(selected('p-time'))+'</b></div><div class="wizard-summary-item"><span>'+esc(S.lang==='en'?'Place':'Место')+'</span><b>'+esc(selected('p-place'))+'</b></div><div class="wizard-summary-item"><span>'+esc(S.lang==='en'?'Priority':'Приоритет')+'</span><b>'+esc(selected('p-focus'))+'</b></div>';

}
