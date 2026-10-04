import '../../bootstrap.js';

// Keep the document small and fetch compatibility markup alongside the
// module-preloaded application. All historical binding IDs mount before init.
try {
  const response = await fetch(new URL('../../ui.html', import.meta.url));
  if (!response.ok) throw new Error(`Interface request failed: ${response.status}`);
  const source = await response.text();
  const template = document.createElement('template');
  template.innerHTML = source;
  document.getElementById('app-root').replaceWith(template.content);
  await import('../../assets/runtime/application.js');
} catch (error) {
  console.error('[MMG] shell failed', error);
  window.dispatchEvent(new CustomEvent('mmg:error', { detail: { key: 'shell' } }));
}
