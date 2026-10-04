import { normalizeRouteHash, subscribeToHashChanges } from './src/app/router.mjs';

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

  var labModulePromise = null;
  function loadLabForCurrentRoute(route) {
    if (normalizeRouteHash(route || location.hash) !== 'tools') {
      var inactiveFallback = document.getElementById('lab-load-fallback');
      if (inactiveFallback) inactiveFallback.remove();
      return;
    }
    if (typeof window.mmgLabOpen === 'function') return;
    if (labModulePromise) return labModulePromise;

    var english = document.documentElement.lang === 'en';
    var main = document.querySelector('main');
    if (main && !document.getElementById('lab-load-fallback')) {
      var loading = document.createElement('div');
      loading.id = 'lab-load-fallback';
      loading.className = 'container';
      loading.setAttribute('role', 'status');
      loading.textContent = english ? 'Loading MARKOV MADE LAB…' : 'Загружается MARKOV MADE LAB…';
      main.appendChild(loading);
    }

    labModulePromise = import('./gym-tools.js').then(function () {
      var fallback = document.getElementById('lab-load-fallback');
      if (fallback) fallback.remove();
      if (typeof window.mmgLabOpen !== 'function') throw new Error('Lab module did not initialize');
    }).catch(function () {
      labModulePromise = null;
      var fallback = document.getElementById('lab-load-fallback');
      if (!fallback || !fallback.isConnected) {
        fallback = document.createElement('section');
        fallback.id = 'lab-load-fallback';
        fallback.className = 'container';
        document.querySelector('main')?.appendChild(fallback);
      }
      fallback.setAttribute('role', 'alert');
      fallback.innerHTML = '<p>' + (english ? 'MARKOV MADE LAB could not load. Your saved data is unchanged.' : 'Не удалось загрузить MARKOV MADE LAB. Сохранённые данные не изменены.') + '</p><button type="button">' + (english ? 'Retry' : 'Повторить') + '</button>';
      fallback.querySelector('button').addEventListener('click', function () {
        fallback.remove();
        loadLabForCurrentRoute();
      }, { once: true });
      window.dispatchEvent(new CustomEvent('mmg:lab-error'));
    });
    return labModulePromise;
  }

  window.addEventListener('mmg:ready', function () { loadLabForCurrentRoute(); });
  subscribeToHashChanges(window, function () { return location.hash; }, loadLabForCurrentRoute);

  function showUpdate(registration) {
    if (!registration || !registration.waiting || document.getElementById('mmg-update')) return;
    var bar = document.createElement('div');
    bar.id = 'mmg-update';
    bar.setAttribute('role', 'status');
    bar.className = 'mmg-update';
    var english = document.documentElement.lang === 'en';
    bar.innerHTML = '<span>' + (english ? 'A new MARKOV MADE GYM version is ready.' : 'Доступна новая версия MARKOV MADE GYM.') + '</span><button type="button" class="btn btn-primary btn-sm">' + (english ? 'Update' : 'Обновить') + '</button>';
    bar.querySelector('button').addEventListener('click', function () {
      var waiting = registration.waiting;
      if (waiting) {
        reloadForUserRequestedUpdate = true;
        waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    });
    document.body.appendChild(bar);
    var placeUpdate = function () { var main = document.querySelector('main'); if (main) main.prepend(bar); };
    placeUpdate();
    window.addEventListener('mmg:ready', placeUpdate, { once: true });
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
