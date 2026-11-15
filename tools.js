/* 浏览器本地工程存储与编辑操作，不向网站后台传输页面或图片。 */
(() => {
  function createAutosave({ read, write, changed = () => {}, delay = 700 }) {
    let timer, revision = 0, saved = 0, chain = Promise.resolve();
    const flush = () => {
      clearTimeout(timer);
      chain = chain.catch(() => {}).then(async () => {
        if (saved === revision) return;
        const version = revision, value = read();
        await write(value);
        saved = version;
        changed(saved === revision ? '已保存' : '保存中');
      });
      return chain;
    };
    return {
      touch() { revision++; changed('保存中'); clearTimeout(timer); timer = setTimeout(() => flush().catch(() => changed('保存失败')), delay); },
      flush,
      dirty: () => saved !== revision,
    };
  }
  function openStorage() {
    return new Promise((resolve, reject) => {
      const database = new URLSearchParams(location.search).has('test') ? 'eagle-huaye-test-' + crypto.randomUUID() : 'eagle-huaye';
      const request = indexedDB.open(database, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('projects');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        resolve({
          get(key) { return new Promise((ok, fail) => { const tx = db.transaction('projects'); const query = tx.objectStore('projects').get(key); query.onsuccess = () => ok(query.result); query.onerror = () => fail(query.error); }); },
          put(key, value) { return new Promise((ok, fail) => { const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(value, key); tx.oncomplete = () => ok(); tx.onerror = () => fail(tx.error); tx.onabort = () => fail(tx.error); }); },
        });
      };
    });
  }
  function imageType(bytes) {
    if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return 'image/png';
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
    if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
    throw Error('请选择 PNG、JPEG 或 WebP 图片');
  }
  function cloneSelected(editor) {
    const selected = editor.getSelected();
    if (!selected?.parent()) return;
    const clone = selected.clone();
    selected.parent().append(clone, { at: selected.index() + 1 });
    editor.select(clone);
    return clone;
  }
  async function install({ editor, getTitle, setTitle, activate, status, storageFactory = openStorage }) {
    const $ = id => document.getElementById(id);
    // 恢复完成前不接受新编辑，避免异步读取的旧工程覆盖用户刚输入的内容。
    document.body.classList.add('storage-loading');
    let restoring = false, clipboard = null, imageTarget = null, storage;
    const capture = () => ({ title: getTitle(), project: editor.getProjectData(), savedAt: Date.now() });
    const autosave = createAutosave({ read: capture, write: value => storage.put('current', value), changed: text => { $('save-state').textContent = text; } });
    const restore = async value => {
      await autosave.flush();
      restoring = true;
      try { editor.loadProjectData(value.project); setTitle(value.title); editor.UndoManager.clear(); editor.select(null); activate(); }
      finally { restoring = false; }
      autosave.touch();
    };
    editor.on('update', () => { if (storage && !restoring) autosave.touch(); });
    window.addEventListener('beforeunload', event => { if (autosave.dirty()) { event.preventDefault(); event.returnValue = ''; } });
    document.addEventListener('visibilitychange', () => { if (document.hidden && storage) autosave.flush().catch(() => status('本地保存失败，请导出页面。', true)); });
    $('save-project').onclick = async () => {
      if (!storage) return;
      try {
        autosave.touch(); await autosave.flush();
        const versions = await storage.get('versions') || [];
        versions.unshift({ ...capture(), label: $('version-name').value.trim() || getTitle() });
        await storage.put('versions', versions.slice(0, 8));
        $('version-name').value = ''; await showVersions();
      } catch { status('本地保存失败，请导出页面。', true); }
    };
    async function showVersions() {
      const list = $('version-list'); list.replaceChildren();
      for (const value of await storage.get('versions') || []) {
        const button = document.createElement('button');
        button.textContent = value.label + ' · ' + new Date(value.savedAt).toLocaleString();
        button.onclick = async () => { try { await restore(value); $('versions-dialog').close(); } catch { status('恢复未完成，请导出当前页面后重试。', true); } };
        list.append(button);
      }
    }
    $('versions-open').onclick = async () => { if (!storage) return; await showVersions(); $('versions-dialog').showModal(); };
    $('duplicate-element').onclick = () => cloneSelected(editor);
    $('layer-name').onchange = () => { const c = editor.getSelected(); if (c) c.setName($('layer-name').value.trim() || c.get('tagName')); };
    $('lock-element').onclick = () => {
      const c = editor.getSelected(); if (!c || c === editor.getWrapper()) return;
      const locked = c.get('eagleLock');
      if (locked) { c.set(locked); c.unset('eagleLock'); }
      else { c.set('eagleLock', { draggable: c.get('draggable'), resizable: c.get('resizable'), editable: c.get('editable') }); c.set({ draggable: false, resizable: false, editable: false }); }
      refresh();
    };
    $('copy-style').onclick = () => { const c = editor.getSelected(); if (c) { clipboard = { ...c.getStyle() }; refresh(); } };
    $('paste-style').onclick = () => { const c = editor.getSelected(); if (c && clipboard) c.addStyle({ ...clipboard }); };
    function refresh() {
      const c = editor.getSelected(), image = c?.is('image');
      $('layer-name').value = c?.getName() || '';
      $('element-tools').disabled = !c;
      $('properties').disabled = !c || !!c.get('eagleLock');
      $('duplicate-element').disabled = !c?.parent();
      $('lock-element').disabled = !c || c === editor.getWrapper();
      $('lock-element').textContent = c?.get('eagleLock') ? '解锁' : '锁定';
      $('paste-style').disabled = !c || !clipboard || !!c.get('eagleLock');
      $('image-tools').hidden = !image;
      if (image) { $('image-alt').value = c.getAttributes().alt || ''; $('image-fit').value = c.getStyle()['object-fit'] || 'contain'; }
    }
    editor.on('component:selected component:deselected undo redo', refresh);
    $('image-alt').onchange = () => editor.getSelected()?.addAttributes({ alt: $('image-alt').value });
    $('image-fit').onchange = () => editor.getSelected()?.addStyle({ 'object-fit': $('image-fit').value });
    const chooseImage = target => { imageTarget = target; $('image-file').value = ''; $('image-file').click(); };
    $('add-image').onclick = () => chooseImage(null);
    $('replace-image').onclick = () => chooseImage(editor.getSelected());
    $('image-file').onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      const target = imageTarget;
      try {
        if (file.size > 5 * 1024 * 1024) throw Error('图片请控制在 5 MB 内');
        const bytes = new Uint8Array(await file.arrayBuffer()), type = imageType(bytes);
        const blob = new Blob([bytes], { type });
        // 解码失败的文件不进入模型；Data URL 随 HTML 导出，不依赖临时 blob 地址。
        const bitmap = await createImageBitmap(blob); bitmap.close();
        const src = await new Promise((ok, fail) => { const reader = new FileReader(); reader.onload = () => ok(reader.result); reader.onerror = () => fail(Error('图片读取失败')); reader.readAsDataURL(blob); });
        if (target) target.addAttributes({ src });
        else { const [added] = editor.addComponents({ type: 'image', attributes: { src, alt: file.name.replace(/\.[^.]+$/, '') }, style: { 'max-width': '100%', height: 'auto', 'object-fit': 'contain' } }); editor.select(added); }
        activate(); refresh();
      } catch (error) { status(error.message, true); }
    };
    refresh();
    try {
      storage = await storageFactory();
      const current = await storage.get('current');
      if (current) { await restore(current); await autosave.flush(); }
      $('save-project').disabled = false; $('versions-open').disabled = false;
      $('save-state').textContent = current ? '已恢复' : '本地保存';
    } catch { storage = null; $('save-state').textContent = '保存不可用'; status('浏览器存储不可用，请导出页面保存修改。', true); }
    finally { document.body.classList.remove('storage-loading'); }
    return { autosave, restore, capture };
  }
  globalThis.EagleEditorTools = { createAutosave, imageType, cloneSelected, install };
})();
