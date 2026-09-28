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

  function showUpdate(registration) {
    if (!registration || !registration.waiting || document.getElementById('mmg-update')) return;
    var bar = document.createElement('div');
    bar.id = 'mmg-update';
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));z-index:11000;transform:translateX(-50%);display:flex;align-items:center;gap:12px;width:min(calc(100% - 24px),520px);padding:12px 14px;border:1px solid rgba(134,182,255,.32);border-radius:14px;background:#111820;color:#f6f8fb;box-shadow:0 18px 50px rgba(0,0,0,.28);font:500 13px/1.4 system-ui,sans-serif;pointer-events:none';
    bar.innerHTML = '<span style="flex:1">Доступна новая версия MARKOV MADE GYM.</span><button type="button" style="min-height:40px;padding:0 14px;border:0;border-radius:10px;background:#86b6ff;color:#07101b;font:700 13px system-ui,sans-serif;cursor:pointer">Обновить</button>';
    bar.querySelector('button').style.pointerEvents = 'auto';
    bar.querySelector('button').addEventListener('click', function () {
      var waiting = registration.waiting;
      if (waiting) {
        reloadForUserRequestedUpdate = true;
        waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    });
    document.body.appendChild(bar);
    window.dispatchEvent(new CustomEvent('mmg:update-ready'));
  }

  if (navigator.serviceWorker && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    var reloading = false;
    var reloadForUserRequestedUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      // First install also fires controllerchange. Preserve the page unless
      // the user explicitly accepted an update from the update banner.
      if (!reloadForUserRequestedUpdate) return;
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(function (registration) {
      if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration);
      registration.addEventListener('updatefound', function () {
        var worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function () {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdate(registration);
        });
      });
    }).catch(function () {
      // PWA is optional at runtime; the application remains usable online.
    });
  }
})();
