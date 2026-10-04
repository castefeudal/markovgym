/** Preserve entered values before closing a session or suspending the page. */
export function bindSessionLifecycle({ window, document, isActive, saveDraft, saveSession, persistTimer, flush, onError }) {
  const persist = () => {
    if (isActive()) {
      saveDraft();
      saveSession();
    }
    persistTimer();
    Promise.resolve().then(flush).catch(onError);
  };
  const onHidden = () => { if (document.visibilityState === 'hidden') persist(); };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', persist);
  return () => {
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', persist);
  };
}
