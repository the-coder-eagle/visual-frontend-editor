/* 链接操作写入组件模型，沿用编辑器的撤销、保存和导出。 */
(() => {
  function validateHref(value) {
    const href = value.trim();
    if (!href) throw Error('请输入网址或页内目标。');
    const url = new URL(href, 'https://editor.invalid/');
    if (!['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol)) throw Error('请使用网页、邮箱、电话或页内链接。');
    return href;
  }
  function unlink(component) {
    const attributes = { ...component.getAttributes() };
    for (const key of ['href', 'target', 'rel', 'download', 'ping', 'referrerpolicy']) delete attributes[key];
    // 无 href 的 a 元素保留文字、嵌套格式和原有样式，不再是链接。
    component.setAttributes(attributes);
  }
  function install({ editor, reveal, status }) {
    const $ = id => document.getElementById(id);
    const menu = $('link-menu'), dialog = $('link-dialog');
    let link, selected;
    const close = () => { if (menu.matches(':popover-open')) menu.hidePopover(); };
    const find = element => {
      let found;
      editor.getWrapper().onAll(component => { if (component.getEl() === element) found = component; });
      return found;
    };
    function panel(open) {
      $('property-panel').hidden = !open;
      document.querySelector('.workspace').classList.toggle('with-properties', open);
      $('properties-toggle').setAttribute('aria-expanded', String(open));
      editor.refresh();
    }
    $('properties-toggle').onclick = () => panel($('property-panel').hidden);
    $('properties-close').onclick = () => panel(false);
    function actions(component) {
      const el = component?.getEl();
      const anchor = el?.nodeType === 1 && el.closest('a[href]');
      const linked = !!anchor, image = el?.tagName === 'IMG';
      const text = !!el?.textContent.trim() && /^(A|P|SPAN|STRONG|EM|B|I|H[1-6]|LABEL|LI|BUTTON|TD|TH)$/.test(el.tagName);
      return { linked, image, text, anchor };
    }
    function show(component, x, y) {
      close(); editor.select(component); selected = component;
      const { linked, image, text, anchor } = actions(component);
      link = linked ? find(anchor) : component;
      const locked = !!component.get('eagleLock') || !!link.get('eagleLock');
      for (const id of ['link-change', 'link-text', 'link-unlink']) $(id).disabled = locked;
      for (const id of ['link-open', 'link-change', 'link-unlink']) $(id).hidden = !linked;
      $('link-text').hidden = !text;
      $('replace-image').hidden = !image; $('replace-image').disabled = locked;
      $('link-open').textContent = (link.getAttributes().href || '').startsWith('#') ? '跳转到目标' : '打开链接 ↗';
      menu.showPopover();
      menu.style.left = Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8)) + 'px';
      menu.style.top = Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8)) + 'px';
      menu.querySelector('button:not([hidden]):not(:disabled)').focus();
    }
    function bindCanvas({ window: frameWindow } = { window: editor.Canvas.getWindow() }) {
      const doc = frameWindow.document;
      doc.addEventListener('contextmenu', event => {
        const target = event.target.closest('a[href]') || event.target;
        const component = find(target); if (!component || component === editor.getWrapper()) { close(); return; }
        event.preventDefault(); event.stopPropagation();
        const frame = editor.Canvas.getFrameEl(), rect = frame.getBoundingClientRect();
        show(component, rect.left + event.clientX * rect.width / frame.clientWidth, rect.top + event.clientY * rect.height / frame.clientHeight);
      }, true);
      doc.addEventListener('pointerdown', close, true);
      doc.addEventListener('scroll', close, true);
    }
    $('link-open').onclick = () => {
      const href = link.getAttributes().href || ''; close();
      if (href.startsWith('#')) {
        // DOM 的 hash 解码与浏览器锚点行为一致，不执行页面导航脚本。
        const hash = new URL(href, 'https://editor.invalid/').hash.slice(1);
        let id;
        try { id = decodeURIComponent(hash); } catch { status('页内目标格式无效。', true); return; }
        const target = hash ? editor.Canvas.getDocument().getElementById(id) : editor.Canvas.getBody();
        const component = target && find(target);
        if (component) reveal(component); else status('页面中没有这个目标。', true);
        return;
      }
      let safe;
      try { safe = validateHref(href); } catch (error) { status(error.message, true); return; }
      if (!/^(https?:|mailto:|tel:|\/\/)/i.test(safe)) { status('相对路径链接请导出后打开。', true); return; }
      window.open(safe.startsWith('//') ? 'https:' + safe : safe, '_blank', 'noopener,noreferrer');
    };
    $('link-change').onclick = () => {
      close(); $('link-href').value = link.getAttributes().href || '';
      $('link-error').textContent = ''; dialog.showModal(); $('link-href').select();
    };
    $('link-form').onsubmit = event => {
      event.preventDefault();
      try {
        const href = validateHref($('link-href').value);
        link.addAttributes({ href }); dialog.close();
      } catch (error) { $('link-error').textContent = error.message; }
    };
    $('link-cancel').onclick = () => dialog.close();
    $('link-text').onclick = () => {
      close(); editor.select(selected);
      // 沿用画布双击编辑，保留链接里的加粗、图标等嵌套内容。
      selected.getEl().dispatchEvent(new (editor.Canvas.getWindow().MouseEvent)('dblclick', { bubbles: true }));
    };
    $('link-unlink').onclick = () => { unlink(link); close(); };
    $('replace-image').addEventListener('click', close);
    function quick() {
      const component = editor.getSelected();
      $('selection-actions').hidden = !component || component === editor.getWrapper();
    }
    $('element-menu-open').onclick = () => {
      if (menu.matches(':popover-open')) { close(); return; }
      const component = editor.getSelected(); if (!component || component === editor.getWrapper()) return;
      const rect = $('element-menu-open').getBoundingClientRect();
      show(component, rect.left, rect.bottom + 6);
    };
    menu.addEventListener('toggle', () => $('element-menu-open').setAttribute('aria-expanded', String(menu.matches(':popover-open'))));
    editor.on('component:selected component:deselected undo redo', quick);
    editor.on('canvas:frame:load', bindCanvas);
    editor.on('component:selected canvas:refresh', close);
    editor.on('project:load component:remove', () => { close(); dialog.close(); });
    window.addEventListener('resize', close);
    bindCanvas();
    quick();
    return { show };
  }
  window.EagleEditorLinks = { validateHref, unlink, install };
})();
