/* 元素详情只读取模型与样式；页面脚本仍作为文本，不在编辑器内执行。 */
(() => {
  function references(code, attributes) {
    const tokens = [];
    if (attributes.id) tokens.push("'" + attributes.id + "'", '"' + attributes.id + '"', '#' + attributes.id);
    for (const name of (attributes.class || '').split(/\s+/).filter(Boolean)) tokens.push('.' + name);
    for (const name of Object.keys(attributes)) if (name.startsWith('data-') && !name.startsWith('data-eagle-')) tokens.push(name);
    return code.split('\n').flatMap((line, index) => tokens.some(token => line.includes(token)) ? [index + 1] : []);
  }
  function chapters(elements, selected) {
    const found = new Map();
    for (const element of elements) {
      const page = element.getAttribute('data-page');
      if (element === selected || !/^\d+$/.test(page) || found.has(page)) continue;
      found.set(page, { value: page, label: element.textContent.trim() || '章节 ' + page });
    }
    return [...found.values()];
  }
  function install({ editor, documentSupport }) {
    const $ = id => document.getElementById(id), dialog = $('inspect-dialog');
    const attribute = EagleEditorDocument.pageAttribute;
    let selected, options = [];
    function codeAt(text) {
      dialog.close(); $('code-open').click();
      const field = $('export-code'), start = field.value.indexOf(text);
      field.focus();
      if (start >= 0) { field.setSelectionRange(start, start + text.length); field.scrollTop = field.value.slice(0, start).split('\n').length * 20; }
    }
    function open() {
      selected = editor.getSelected();
      if (!selected?.getEl() || selected === editor.getWrapper()) return;
      const el = selected.getEl(), attrs = selected.getAttributes();
      $('inspect-title').textContent = el.tagName.toLowerCase() + (attrs.id ? ' #' + attrs.id : '');
      $('inspect-html').value = selected.toHTML();
      $('inspect-attributes').value = JSON.stringify(attrs, null, 2);
      const computed = el.ownerDocument.defaultView.getComputedStyle(el);
      $('inspect-computed').value = [...computed].map(name => name + ': ' + computed.getPropertyValue(name) + ';').join('\n');
      const sheet = new CSSStyleSheet(); sheet.replaceSync(editor.getCss({ keepUnusedStyles: true }));
      function matching(rules) {
        return [...rules].flatMap(rule => {
          if (rule.selectorText) {
            // 嵌套选择器依赖父规则，保留来源文本而不错误展开。
            if (rule.selectorText.includes('&')) return [rule.cssText];
            for (let node = el; node; node = node.parentElement) if (node.matches(rule.selectorText)) return [rule.cssText];
          }
          if (rule.cssRules) {
            const children = matching(rule.cssRules);
            if (children.length) return [rule.cssText.slice(0, rule.cssText.indexOf('{') + 1) + '\n' + children.join('\n') + '\n}'];
          }
          return [];
        });
      }
      $('inspect-css').value = matching(sheet.cssRules).join('\n');
      const list = $('inspect-scripts'); list.replaceChildren();
      documentSupport.getScripts().map((script, index) => ({ script, index, lines: references(script.code, attrs) }))
        .sort((a, b) => Number(!!b.lines.length) - Number(!!a.lines.length))
        .forEach(({ script, index, lines }) => {
          const details = document.createElement('details'), summary = document.createElement('summary');
          summary.textContent = '脚本 ' + (index + 1) + (lines.length ? ' · 引用行 ' + lines.join('、') : ' · 其他脚本');
          const source = document.createElement('textarea'); source.readOnly = true; source.spellcheck = false;
          source.value = script.code; source.setAttribute('aria-label', '脚本 ' + (index + 1));
          const edit = document.createElement('button'); edit.textContent = '编辑此脚本';
          edit.onclick = () => codeAt(script.code);
          details.append(summary, source, edit); list.append(details);
        });
      if (!list.children.length) list.textContent = '没有保留的内嵌脚本';
      options = chapters(el.ownerDocument.querySelectorAll('button[data-page],a[data-page]'), el);
      const picker = $('inspect-page'); picker.replaceChildren(new Option('原有行为', ''));
      for (const option of options) picker.add(new Option(option.label, option.value));
      const current = attrs[attribute];
      if (current != null && !options.some(option => option.value === current)) picker.add(new Option('目标不存在 · ' + current, current));
      picker.value = current ?? '';
      $('inspect-action').hidden = !/^(BUTTON|A)$/.test(el.tagName) || (!options.length && current == null);
      $('inspect-apply').disabled = !!selected.get('eagleLock');
      $('inspect-error').textContent = '';
      dialog.showModal();
    }
    $('inspect-open').onclick = () => { $('link-menu').hidePopover(); open(); };
    $('inspect-edit').onclick = () => codeAt(selected.toHTML());
    $('inspect-apply').onclick = () => {
      const value = $('inspect-page').value;
      if (!selected || selected.get('eagleLock')) return;
      if (value && !options.some(option => option.value === value)) { $('inspect-error').textContent = '请选择页面中存在的章节。'; return; }
      const attrs = { ...selected.getAttributes() };
      if (value) attrs[attribute] = value; else delete attrs[attribute];
      selected.setAttributes(attrs); dialog.close();
    };
    editor.on('project:load component:remove', () => dialog.close());
    return { open };
  }
  window.EagleEditorInspect = { references, chapters, install };
})();
