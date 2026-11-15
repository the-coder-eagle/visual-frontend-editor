/* 本页只在不含 allow-same-origin 的沙箱内运行。预览数据不读写主站存储。 */
(() => {
  function storage() {
    const values = new Map();
    return {
      get length() { return values.size; },
      key(index) { return [...values.keys()][Number(index)] ?? null; },
      getItem(key) { return values.get(String(key)) ?? null; },
      setItem(key, value) { values.set(String(key), String(value)); },
      removeItem(key) { values.delete(String(key)); },
      clear() { values.clear(); },
    };
  }
  function bootstrap(createStorage) {
    Object.defineProperty(window, 'localStorage', { value: createStorage(), configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: createStorage(), configurable: true });
    window.addEventListener('error', event => parent.postMessage({ type: 'eagle-preview-error', message: event.message }, '*'));
    document.addEventListener('click', event => {
      const link = event.target.closest?.('a[href]');
      if (link && !link.getAttribute('href').startsWith('#')) event.preventDefault();
    }, true);
  }
  function load(event) {
    if (event.source !== parent || event.data?.type !== 'eagle-preview' || typeof event.data.html !== 'string') return;
    window.removeEventListener('message', load);
    const doc = new DOMParser().parseFromString(event.data.html, 'text/html');
    const policy = doc.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'";
    const setup = doc.createElement('script');
    setup.textContent = '(' + bootstrap.toString() + ')(' + storage.toString() + ');';
    doc.head.prepend(policy, setup);
    document.open(); document.write('<!doctype html>\n' + doc.documentElement.outerHTML); document.close();
  }
  window.addEventListener('message', load);
})();
