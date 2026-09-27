(function () {
  'use strict';

  var boot = document.getElementById('mmg-boot');
  var status = document.getElementById('mmg-boot-status');
  var errorPanel = document.getElementById('mmg-boot-error');
  var retry = document.getElementById('mmg-boot-retry');
  var labels = {
    interface: 'Интерфейс',
    data: 'Локальные данные',
    workout: 'Тренировка',
    ready: 'Готово'
  };

  function setStage(key) {
    if (status) status.textContent = labels[key] || key;
  }

  function showError() {
    if (!boot) return;
    boot.dataset.error = 'true';
    if (status) status.textContent = 'Нужна повторная загрузка';
    if (errorPanel) errorPanel.focus({ preventScroll: true });
  }

  function offerUpdate(registration) {
    if (!registration || !registration.waiting || document.getElementById('mmg-update-ready')) return;
    var bar = document.createElement('div');
    bar.id = 'mmg-update-ready';
    bar.className = 'mmg-update-ready';
    bar.setAttribute('role', 'status');
    bar.innerHTML = '<div><strong>Доступно обновление</strong><span>Новая версия готова. Локальные данные сохранятся.</span></div>' +
      '<button type="button" data-mmg-update-apply>Обновить</button>' +
      '<button type="button" data-mmg-update-dismiss aria-label="Закрыть уведомление">×</button>';
    document.body.appendChild(bar);
    var apply = bar.querySelector('[data-mmg-update-apply]');
    var dismiss = bar.querySelector('[data-mmg-update-dismiss]');
    if (dismiss) dismiss.addEventListener('click', function () { bar.remove(); });
    if (apply) apply.addEventListener('click', function () {
      apply.disabled = true;
      apply.textContent = 'Обновление…';
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      }, { once: true });
      if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    });
  }

  function hide() {
    if (!boot) return;
    setStage('ready');
    requestAnimationFrame(function () {
      boot.dataset.hidden = 'true';
      window.setTimeout(function () { boot.remove(); }, 240);
    });
  }

  window.addEventListener('mmg:stage', function (event) {
    setStage(event.detail && event.detail.key || 'interface');
  });
  window.addEventListener('mmg:ready', hide, { once: true });
  window.addEventListener('mmg:error', showError, { once: true });
  if (retry) retry.addEventListener('click', function () { window.location.reload(); });

  if (navigator.serviceWorker && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (registration) {
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration);
      registration.update().catch(function () {});
      registration.addEventListener('updatefound', function () {
        var worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function () {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            offerUpdate(registration);
            window.dispatchEvent(new CustomEvent('mmg:update-ready'));
          }
        });
      });
    }).catch(function () {
      // PWA is optional at runtime; the application remains usable online.
    });
  }
})();
