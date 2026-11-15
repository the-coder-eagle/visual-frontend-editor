/* 脚本只以文本保存；临时显示只修改画布视图，导出仍读取组件模型。 */
(() => {
  const slotAttribute = 'data-eagle-script-slot';
  const pageAttribute = 'data-eagle-click-page';
  // 复用已有章节按钮，保留它更新进度、标题和导航状态的逻辑。
  function pageActions() {
    const active = new Set();
    document.addEventListener('click', event => {
      const source = event.target.closest?.('[data-eagle-click-page]');
      if (!source) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (active.has(source)) return;
      const page = source.getAttribute('data-eagle-click-page');
      const target = [...document.querySelectorAll('button[data-page],a[data-page]')]
        .find(node => node !== source && node.getAttribute('data-page') === page);
      if (!target) return;
      active.add(source);
      try { target.click(); } finally { active.delete(source); }
    }, true);
  }
  const actionsCode = '(' + pageActions.toString() + ')();';
  function prepare(source, preserveScripts = false) {
    const original = new DOMParser().parseFromString(source, 'text/html');
    for (const element of original.querySelectorAll('*')) {
      if (!preserveScripts) element.removeAttribute(pageAttribute);
      for (const { name } of [...element.attributes]) {
        if (name.startsWith('data-gjs-') || name === slotAttribute) element.removeAttribute(name);
      }
    }
    const scripts = [];
    for (const node of original.querySelectorAll('script')) {
      if (node.hasAttribute('data-eagle-actions') && node.textContent === actionsCode) { node.remove(); continue; }
      if (preserveScripts && !node.hasAttribute('src') && node.namespaceURI === 'http://www.w3.org/1999/xhtml') {
        const script = { slot: crypto.randomUUID(), head: original.head.contains(node), code: node.textContent,
          attributes: [...node.attributes].filter(a => ['id', 'type', 'nomodule', 'async', 'defer'].includes(a.name)).map(a => [a.name, a.value]) };
        scripts.push(script);
        if (!script.head) {
          const placeholder = original.createElement('span');
          placeholder.hidden = true; placeholder.setAttribute(slotAttribute, script.slot);
          node.replaceWith(placeholder);
        } else node.remove();
      } else node.remove();
    }
    const clean = DOMPurify.sanitize(original.documentElement.outerHTML, {
      WHOLE_DOCUMENT: true, ADD_TAGS: ['style'],
      // reset 等合法 ID 是原脚本的接口。结果仅进入隔离画布，不插入主站 DOM。
      SANITIZE_DOM: false,
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'base', 'meta'], ALLOW_DATA_ATTR: true,
    });
    return { doc: new DOMParser().parseFromString(clean, 'text/html'), scripts };
  }

  function serialize(html, css, title, scripts) {
    const doc = new DOMParser().parseFromString('<!doctype html><html lang="zh-CN"><head></head>' + html + '</html>', 'text/html');
    const charset = doc.createElement('meta'); charset.setAttribute('charset', 'UTF-8'); doc.head.append(charset);
    const viewport = doc.createElement('meta'); viewport.name = 'viewport'; viewport.content = 'width=device-width,initial-scale=1'; doc.head.append(viewport);
    const heading = doc.createElement('title'); heading.textContent = title; doc.head.append(heading);
    const style = doc.createElement('style'); style.textContent = css.replace(/<\/style/gi, '<\\/style'); doc.head.append(style);
    for (const saved of scripts) {
      const slot = [...doc.querySelectorAll('[' + slotAttribute + ']')].find(node => node.getAttribute(slotAttribute) === saved.slot);
      if (!saved.head && !slot) continue;
      const script = doc.createElement('script');
      for (const [name, value] of saved.attributes) script.setAttribute(name, value);
      script.textContent = saved.code;
      if (saved.head) doc.head.append(script); else slot.replaceWith(script);
    }
    doc.querySelectorAll('[' + slotAttribute + ']').forEach(node => node.remove());
    if (doc.querySelector('[' + pageAttribute + ']')) {
      const actions = doc.createElement('script');
      actions.setAttribute('data-eagle-actions', ''); actions.textContent = actionsCode;
      doc.head.insertBefore(actions, doc.head.querySelector('script'));
    }
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }

  function install(editor, select) {
    let scripts = [], selected = null, sheet = null, entries = new Map();
    const walk = (component, visit) => { visit(component); component.components().forEach(child => walk(child, visit)); };
    function clearView() { if (sheet) { sheet.remove(); sheet = null; } }
    function selectorFor(element) {
      const path = [];
      while (element && element.tagName !== 'BODY') {
        path.unshift(':nth-child(' + ([...element.parentElement.children].indexOf(element) + 1) + ')');
        element = element.parentElement;
      }
      return 'html body' + (path.length ? ' > ' + path.join(' > ') : '');
    }
    function refresh() {
      clearView(); entries = new Map();
      const doc = editor.Canvas.getDocument(); if (!doc?.body) return;
      walk(editor.getWrapper(), component => {
        const element = component.getEl();
        if (element?.nodeType !== 1 || element.hasAttribute(slotAttribute) || component === editor.getWrapper()) return;
        // 章节入口只收有内容的区块；空的进度圆点等装饰仍留在图层中。
        if (!element.textContent.trim() && !element.querySelector('img,video,canvas,input,textarea')) return;
        const style = doc.defaultView.getComputedStyle(element);
        if (element.hidden || style.display === 'none' || style.visibility === 'hidden') entries.set(component.cid, component);
      });
      select.replaceChildren();
      const normal = document.createElement('option'); normal.value = ''; normal.textContent = '正常视图'; select.append(normal);
      for (const [id, component] of entries) {
        const element = component.getEl(), option = document.createElement('option'); option.value = id;
        option.textContent = (element.querySelector('h1,h2,h3')?.textContent || element.getAttribute('aria-label') || element.id || component.getName()).trim().slice(0, 60);
        select.append(option);
      }
      select.disabled = !entries.size;
      select.hidden = !entries.size;
      if (!selected || !entries.has(selected.cid)) { selected = null; return; }
      select.value = selected.cid;
      const rules = [];
      for (let component = selected; component; component = component.parent()) {
        const element = component.getEl(); if (!element) continue;
        const style = doc.defaultView.getComputedStyle(element);
        if (element.hidden || style.display === 'none' || style.visibility === 'hidden') {
          rules.push(selectorFor(element) + '{' + (style.display === 'none' ? 'display:block!important;' : '') + 'visibility:visible!important;}');
        }
      }
      sheet = doc.createElement('style'); sheet.textContent = rules.join('\n'); doc.head.append(sheet);
    }
    select.onchange = () => {
      selected = entries.get(select.value) || null; refresh();
      if (selected) { editor.select(selected); selected.getEl()?.scrollIntoView({ block: 'center' }); }
    };
    editor.on('project:get', ({ project }) => { project.eagleDocument = { scripts }; });
    editor.on('project:load', ({ project }) => { scripts = project.eagleDocument?.scripts || []; selected = null; clearView(); });
    editor.on('update undo redo canvas:frame:load project:loaded', refresh);
    return { refresh, getScripts: () => scripts, setScripts(value) { scripts = value; selected = null; refresh(); },
      reveal(component) {
        refresh(); selected = null;
        for (let node = component; node; node = node.parent()) {
          if (entries.has(node.cid)) { selected = node; break; }
        }
        refresh(); editor.select(component); component.getEl()?.scrollIntoView({ block: 'center' });
      } };
  }
  window.EagleEditorDocument = { prepare, serialize, install, pageAttribute, pageActions };
})();
