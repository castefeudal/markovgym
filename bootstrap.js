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
      registration.addEventListener('updatefound', function () {
        var worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function () {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            window.dispatchEvent(new CustomEvent('mmg:update-ready'));
          }
        });
      });
    }).catch(function () {
      // PWA is optional at runtime; the application remains usable online.
    });
  }
})();
