/* 编辑引擎保存组件模型；属性面板修改模型，导出也从模型生成，避免预览与文件不一致。 */
(() => {
  const $ = id => document.getElementById(id);
  const status = (message, visible = false) => { $('status').textContent = message; $('status').hidden = !visible; };
  if (!window.grapesjs || !window.DOMPurify) {
    status('编辑器加载失败，请检查网络后刷新。', true);
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    return;
  }
  const sample = `<!doctype html><html lang="zh-CN"><head><title>由你定义</title><style>
    *{box-sizing:border-box}
    body{margin:0;background:#e8e0cd;color:#191a17;font-family:Arial,"Microsoft YaHei",sans-serif}
    main{max-width:960px;margin:auto;padding:48px 40px}
    .poster{display:grid;grid-template-columns:minmax(0,1fr) 28%;align-items:center;gap:32px;min-height:440px;border-top:8px solid #191a17;border-bottom:2px solid #191a17;padding:40px 0}
    h1{font-size:clamp(52px,10vw,96px);font-weight:900;line-height:1.05;letter-spacing:-.06em;margin:0 0 28px}
    p{font-size:20px;line-height:1.6;margin:0 0 28px}
    .button{display:inline-block;padding:14px 24px;background:#191a17;color:#e8e0cd;font-size:18px;text-decoration:none}
    .shape{display:flex;align-items:center;justify-content:center;min-height:220px;background:#df3926;color:#e8e0cd;transform:rotate(-8deg);font-size:100px;line-height:1}
    @media(max-width:480px){main{padding:28px 24px}.poster{grid-template-columns:1fr;gap:36px;padding:32px 0}h1{font-size:64px}.shape{width:150px;min-height:150px;justify-self:end;font-size:84px}p{font-size:18px}}
    </style></head><body><main><section class="poster"><div><h1>由你，<br>定义。</h1><p>把想法放上页面。</p><a class="button" href="#">开始 ↗</a></div><div class="shape">↗</div></section></main></body></html>`;
  let title = '由你定义';
  let previewing = false;
  let initializing = true;
  function dismissWelcome() {
    $('welcome').hidden = true;
    document.body.classList.remove('is-welcoming');
    $('export-open').disabled = false;
  }
  $('demo-start').onclick = () => {
    dismissWelcome();
    editor.select(editor.getWrapper().find('h1')[0]);
    $('text').focus();
  };
  $('demo-import').onclick = () => $('import-open').click();
  $('demo-pause').onclick = () => {
    const paused = $('welcome').classList.toggle('is-paused');
    $('demo-pause').textContent = paused ? '▶' : 'Ⅱ';
    $('demo-pause').setAttribute('aria-label', paused ? '播放演示' : '暂停演示');
  };
  const editor = grapesjs.init({
    container: '#editor', height: '100%', width: 'auto', storageManager: false,
    panels: { defaults: [] }, layerManager: { appendTo: '#layers' },
    selectorManager: { componentFirst: true }, telemetry: false, dragMode: 'translate',
    deviceManager: { devices: [{ id: 'Desktop', name: 'Desktop', width: '' }, { id: 'Mobile', name: 'Mobile', width: '390px' }] },
    // 0.23.9 没有 canvas.frameProps；在 iframe 插入页面前设置真实 sandbox。
    plugins: [instance => instance.on('frame:render', view => {
      view.el.setAttribute('sandbox', 'allow-same-origin');
      view.el.setAttribute('referrerpolicy', 'no-referrer');
    })],
    canvas: {
      allowExternalDrop: false,
      frameContent: `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src https: http: data: blob:; font-src data:; form-action 'none'; base-uri 'none'"><meta name="referrer" content="no-referrer"></head><body></body></html>`,
    },
    parser: { optionsHtml: { allowScripts: false, allowUnsafeAttr: false, allowUnsafeAttrValue: false } },
  });
  const defaultRootId = editor.getWrapper().getId();

  // 右侧、底部及右下角调节尺寸；与组件模型共用撤销历史和导出路径。
  editor.on('component:resize:init', options => {
    if (options.component !== editor.getWrapper()) {
      options.resizable = { tl: false, tc: false, tr: false, cl: false, bl: false, cr: true, bc: true, br: true };
    }
  });
  function prepareGeometry(component) {
    const el = component.getEl();
    const computed = el.ownerDocument.defaultView.getComputedStyle(el);
    const style = {};
    // 行内文字不接受位移/宽高；首次几何操作时转为行内块。
    if (computed.display === 'inline') style.display = 'inline-block';
    // 元素可能自带旋转，新增位移时保留类样式中的变换。
    if (!component.getStyle().transform && computed.transform !== 'none') style.transform = computed.transform;
    if (Object.keys(style).length) component.addStyle(style);
  }
  editor.on('component:drag:start', ({ target }) => {
    if ($('drag-mode').value === 'translate') prepareGeometry(target);
  });
  editor.on('component:resize:start', ({ component }) => prepareGeometry(component));
  function getOffset(component) {
    const transform = component.getStyle().transform || '';
    const read = axis => Number(transform.match(new RegExp(`translate${axis}\\((-?[\\d.]+)px\\)`))?.[1] || 0);
    return { x: read('X'), y: read('Y') };
  }
  function setOffset(x, y) {
    const component = editor.getSelected();
    if (!component || component === editor.getWrapper()) return;
    prepareGeometry(component);
    const base = (component.getStyle().transform || '').replace(/translate[XY]\([^)]*\)/g, '').trim();
    component.addStyle({ transform: `${base} translateX(${x}px) translateY(${y}px)`.trim() });
    refreshProperties();
  }
  $('drag-mode').onchange = () => {
    editor.setDragMode($('drag-mode').value);
  };
  ['offset-x', 'offset-y'].forEach(id => {
    $(id).onchange = () => {
      if (!$('offset-x').checkValidity() || !$('offset-y').checkValidity()) return;
      setOffset(Number($('offset-x').value), Number($('offset-y').value));
    };
  });
  $('reset-offset').onclick = () => setOffset(0, 0);
  function nudge(event) {
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const component = editor.getSelected();
    if (!moves[event.key] || !component || previewing || !$('drag-mode').value || event.ctrlKey || event.metaKey || event.altKey || component.get('eagleLock')) return;
    if (event.target.closest('input,textarea,select,[contenteditable="true"],dialog')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const { x, y } = getOffset(component);
    const [dx, dy] = moves[event.key];
    const step = event.shiftKey ? 10 : 1;
    setOffset(x + dx * step, y + dy * step);
  }
  document.addEventListener('keydown', nudge, true);
  editor.on('canvas:frame:load', ({ window: frameWindow }) => {
    const doc = frameWindow.document;
    doc.addEventListener('keydown', nudge, true);
    // 预览只展示效果；禁止链接把画布替换成其他页面，表单也不提交。
    doc.addEventListener('click', event => {
      if (event.target.closest('a,area')) event.preventDefault();
    }, true);
    doc.addEventListener('submit', event => event.preventDefault(), true);
  });
  editor.on('component:resize:end dmode:end', refreshProperties);

  function importHtml(source, name = '导入的页面') {
    if (!source.trim()) throw new Error('请先选择文件或粘贴 HTML。');
    // 用户导入的是网页文件。清理执行入口，并阻止 data-gjs-* 将输入解释为引擎配置。
    const clean = DOMPurify.sanitize(source, {
      WHOLE_DOCUMENT: true, ADD_TAGS: ['style'],
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'base', 'meta'],
      ALLOW_DATA_ATTR: false,
    });
    const doc = new DOMParser().parseFromString(clean, 'text/html');
    if (!doc.body.textContent.trim() && !doc.body.querySelector('img,svg,hr')) throw new Error('没有找到可编辑的页面内容。');
    // 构造式样式表按浏览器 CSS 语法解析，并丢弃 @import 外链。
    const sheet = new CSSStyleSheet();
    sheet.replaceSync([...doc.querySelectorAll('style')].map(node => node.textContent).join('\n'));
    const css = [...sheet.cssRules].map(rule => rule.cssText).join('\n');
    doc.querySelectorAll('style').forEach(node => node.remove());
    title = doc.title || name.replace(/\.html?$/i, '');
    // 先移除旧组件，避免它们在销毁时删掉新导入的同 ID 样式。
    editor.select(null);
    editor.setComponents('');
    const wrapper = editor.getWrapper();
    wrapper.setStyle({});
    editor.setStyle('');
    const attributes = Object.fromEntries([...doc.body.attributes].map(attr => [attr.name, attr.value]));
    const bodyStyle = attributes.style;
    wrapper.setClass(attributes.class || []);
    delete attributes.class;
    delete attributes.style;
    wrapper.setAttributes({ id: defaultRootId, ...attributes });
    // 先载入页面规则，再叠加行内样式，保持行内样式优先级。
    editor.setStyle(css);
    if (bodyStyle) wrapper.addStyle(editor.Parser.parseStyle(bodyStyle));
    editor.setComponents(doc.body.innerHTML);
    editor.UndoManager.clear();
    editor.select(null);
    $('project-name').textContent = title;
    status('已导入');
    if (!initializing) dismissWelcome();
  }

  function exportHtml() {
    const safeTitle = title.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    return `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>${editor.getCss().replace(/<\/style/gi, '<\\/style')}</style></head>${editor.getHtml()}</html>`;
  }

  const rgbHex = value => {
    const match = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return match ? '#' + match.slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join('') : '#ffffff';
  };
  const advancedFields = {
    gap: 'gap', justify: 'justify-content', items: 'align-items', 'font-family': 'font-family', 'letter-spacing': 'letter-spacing',
    opacity: 'opacity', padding: 'padding', margin: 'margin', weight: 'font-weight', 'line-height': 'line-height', border: 'border', shadow: 'box-shadow',
  };
  function refreshCustomValue() {
    const property = $('css-property').value.trim();
    $('css-value').value = editor.getSelected()?.getStyle()[property] || '';
    const el = editor.getSelected()?.getEl();
    $('css-value').placeholder = el && property ? el.ownerDocument.defaultView.getComputedStyle(el).getPropertyValue(property) || '输入 CSS 值' : 'repeat(3, 1fr)';
  }
  function refreshProperties() {
    const selected = editor.getSelected();
    $('properties').disabled = !selected || !!selected.get('eagleLock');
    $('select-parent').disabled = !selected?.parent();
    $('selected-name').textContent = selected ? selected.getName() : '选择元素';
    if (!selected || !selected.getEl()) return;
    const el = selected.getEl();
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    const textElement = /^(H[1-6]|P|SPAN|A|BUTTON|LABEL|LI|TD|TH|BLOCKQUOTE|PRE)$/.test(el.tagName) || !el.children.length && !!el.textContent.trim();
    const container = !textElement && [...el.children].some(child => child.tagName !== 'BR');
    $('typography-tools').hidden = !textElement;
    $('layout-tools').hidden = !container;
    const flex = ['flex', 'inline-flex'].includes(style.display);
    const grid = ['grid', 'inline-grid'].includes(style.display);
    const column = style.flexDirection.startsWith('column');
    $('layout-spacing').hidden = !flex && !grid;
    $('columns-field').hidden = !grid;
    $('flex-alignment').hidden = !flex;
    $('justify-label').textContent = column ? '纵向分布' : '横向分布';
    $('items-label').textContent = column ? '横向对齐' : '纵向对齐';
    const columns = (selected.getStyle()['grid-template-columns'] || '').match(/^repeat\(\s*(\d+)\s*,/);
    $('columns').value = columns ? columns[1] : '';
    document.querySelectorAll('[data-layout]').forEach(button => {
      const active = grid ? 'grid' : flex ? column ? 'column' : 'row' : '';
      button.setAttribute('aria-pressed', String(button.dataset.layout === active));
    });
    // 换行可以安全还原；其他嵌套标记仍在画布内编辑，保留其格式和图标。
    const textEditable = [...el.children].every(child => child.tagName === 'BR') && !['IMG', 'INPUT', 'HR', 'BR', 'SVG'].includes(el.tagName);
    $('text').disabled = !textEditable;
    $('text').value = textEditable ? [...el.childNodes].map(node => node.nodeName === 'BR' ? '\n' : node.textContent).join('') : '';
    $('text').placeholder = textEditable ? '输入文字' : '双击画布中的文字编辑';
    $('color').value = rgbHex(style.color);
    $('background').value = rgbHex(style.backgroundColor);
    const transparent = style.backgroundColor === 'transparent' || /^rgba\([^)]*,\s*0\s*\)$/.test(style.backgroundColor);
    $('background').classList.toggle('is-transparent', transparent);
    $('background').title = style.backgroundColor;
    $('background-transparent').setAttribute('aria-pressed', String(transparent));
    $('font-size').value = parseFloat(style.fontSize) || 16;
    $('radius').value = parseFloat(style.borderRadius) || 0;
    // 高级字段只显示当前元素的覆盖值，空值沿用导入页面的类样式。
    Object.entries(advancedFields).forEach(([id, property]) => {
      const input = $(id);
      const value = selected.getStyle()[property] || '';
      if (input.tagName === 'SELECT') {
        input.querySelector('[data-custom]')?.remove();
        if (value && ![...input.options].some(option => option.value === value)) {
          const option = new Option(value, value);
          option.dataset.custom = 'true';
          input.add(option);
        }
      } else input.placeholder = style.getPropertyValue(property);
      input.value = value;
    });
    refreshCustomValue();
    $('width').value = selected.getStyle().width || '';
    $('height').value = selected.getStyle().height || '';
    const offset = getOffset(selected);
    $('offset-x').value = offset.x;
    $('offset-y').value = offset.y;
    $('align').value = ['left', 'center', 'right'].includes(style.textAlign) ? style.textAlign : 'left';
  }
  editor.on('component:selected component:deselected', () => { $('css-message').textContent = ''; refreshProperties(); });
  // 键盘撤销、画布内改字及拖动也会改变模型，不能只在面板按钮点击时同步。
  let propertyRefreshPending = false;
  editor.on('undo redo component:styleUpdate component:update:content', () => {
    if (propertyRefreshPending) return;
    propertyRefreshPending = true;
    queueMicrotask(() => { propertyRefreshPending = false; refreshProperties(); });
  });
  editor.on('update undo redo', () => {
    $('undo').disabled = !editor.UndoManager.hasUndo();
    $('redo').disabled = !editor.UndoManager.hasRedo();
    status('');
  });
  $('text').addEventListener('change', () => {
    const selected = editor.getSelected();
    if (!selected || $('text').disabled) return;
    const span = document.createElement('span');
    $('text').value.split('\n').forEach((line, index) => {
      if (index) span.append(document.createElement('br'));
      span.append(document.createTextNode(line));
    });
    selected.components(span.innerHTML);
  });
  $('background-transparent').onclick = () => {
    const selected = editor.getSelected();
    if (!selected) return;
    selected.addStyle({ 'background-color': 'transparent' });
    refreshProperties();
  };
  $('select-parent').onclick = () => {
    const parent = editor.getSelected()?.parent();
    if (parent) editor.select(parent);
  };
  document.querySelectorAll('[data-layout]').forEach(button => {
    button.onclick = () => {
      const selected = editor.getSelected();
      if (!selected) return;
      const mode = button.dataset.layout;
      // 一次写入完成布局切换，撤销时也作为一次操作；不改子元素内容。
      selected.addStyle(mode === 'grid'
        ? { display: 'grid', 'grid-template-columns': 'repeat(3, minmax(0, 1fr))' }
        : { display: 'flex', 'flex-direction': mode, 'flex-wrap': 'wrap' });
      refreshProperties();
    };
  });
  $('columns').onchange = () => {
    const selected = editor.getSelected();
    if (!selected || !$('columns').value) return;
    if (!$('columns').checkValidity()) { $('columns').reportValidity(); return; }
    selected.addStyle({ 'grid-template-columns': `repeat(${$('columns').value}, minmax(0, 1fr))` });
    refreshProperties();
  };
  const fields = { color: 'color', background: 'background-color', 'font-size': 'font-size', radius: 'border-radius', width: 'width', height: 'height', align: 'text-align', ...advancedFields };
  Object.entries(fields).forEach(([id, property]) => {
    $(id).addEventListener('change', () => {
      const selected = editor.getSelected();
      if (!selected) return;
      const input = $(id);
      if (!input.checkValidity()) { input.reportValidity(); return; }
      const raw = input.value.trim();
      const pixelField = ['font-size', 'radius', 'width', 'height', 'gap', 'padding', 'margin', 'letter-spacing'].includes(id);
      const value = pixelField && /^-?(?:\d+\.?\d*|\.\d+)$/.test(raw) ? `${raw}px` : raw;
      if (value && !CSS.supports(property, value)) { status('格式无效，请检查输入值。尺寸可填写 240px 或 100%。', true); return; }
      if (value) {
        if (property === 'width' || property === 'height') prepareGeometry(selected);
        selected.addStyle({ [property]: value });
      }
      else selected.removeStyle(property);
      refreshProperties();
    });
  });
  $('css-property').onchange = () => { $('css-message').textContent = ''; refreshCustomValue(); };
  $('css-reset').onclick = () => {
    const selected = editor.getSelected();
    const property = $('css-property').value.trim();
    if (!selected || !Object.hasOwn(selected.getStyle(), property)) return;
    selected.removeStyle(property);
    refreshProperties();
    $('css-message').textContent = '已恢复原样式';
  };
  $('css-apply').onclick = () => {
    const selected = editor.getSelected();
    if (!selected) return;
    const property = $('css-property').value.trim();
    const value = $('css-value').value.trim();
    if (!CSS.supports(property, value || 'initial')) {
      $('css-message').textContent = '属性或值无效，未应用。';
      return;
    }
    if (value) selected.addStyle({ [property]: value });
    else selected.removeStyle(property);
    refreshProperties();
    $('css-message').textContent = value ? '已应用' : '已移除覆盖';
  };
  ['basic', 'advanced'].forEach(mode => {
    $(`${mode}-toggle`).onclick = () => {
      ['basic', 'advanced'].forEach(name => {
        $(`${name}-properties`).hidden = name !== mode;
        $(`${name}-toggle`).setAttribute('aria-pressed', String(name === mode));
      });
    };
  });
  $('layers-toggle').onclick = () => {
    const open = $('layer-panel').hidden;
    $('layer-panel').hidden = !open;
    document.querySelector('.workspace').classList.toggle('with-layers', open);
    $('layers-toggle').setAttribute('aria-expanded', String(open));
    editor.refresh();
  };
  function moveSelected(delta) {
    const selected = editor.getSelected();
    if (!selected || !selected.parent()) return;
    const parent = selected.parent();
    const index = selected.index();
    const destination = index + delta;
    if (destination < 0 || destination >= parent.components().length) return;
    selected.move(parent, { at: destination });
    editor.select(selected);
  }
  $('move-up').onclick = () => moveSelected(-1);
  $('move-down').onclick = () => moveSelected(1);
  $('undo').onclick = () => { editor.UndoManager.undo(); refreshProperties(); };
  $('redo').onclick = () => { editor.UndoManager.redo(); refreshProperties(); };
  $('device').onchange = () => editor.setDevice($('device').value);
  $('preview').onclick = () => {
    previewing = !previewing;
    if (previewing) editor.runCommand('core:preview'); else editor.stopCommand('core:preview');
    $('preview').textContent = previewing ? '返回编辑' : '预览';
  };
  const additions = {
    text: '<p style="padding:16px;color:#35543a;font-size:16px">写下一段新的文字。</p>',
    button: '<a href="#" style="display:inline-block;margin:16px;padding:12px 24px;background:#345c43;color:#fff;border-radius:6px;text-decoration:none">了解更多 ↗</a>',
    card: '<section style="margin:20px;padding:24px;background:#f1f4e8;border-radius:10px"><h2>一个新的故事</h2><p>从这里开始，描述你的想法。</p></section>',
  };
  document.querySelectorAll('[data-add]').forEach(button => {
    button.onclick = () => { const [added] = editor.addComponents(additions[button.dataset.add]); editor.select(added); added.getEl()?.scrollIntoView({ block: 'center' }); $('add-menu').hidePopover(); };
  });
  $('import-open').onclick = () => { $('import-error').textContent = ''; $('import-dialog').showModal(); };
  $('sample').onclick = () => { $('import-code').value = sample; $('file-name').textContent = '示例页面'; };
  $('file').onchange = async event => {
    const file = event.target.files[0];
    if (!file) return;
    try { $('import-code').value = await file.text(); $('file-name').textContent = file.name; }
    catch (error) { $('import-error').textContent = `文件读取失败：${error.message}`; }
  };
  $('import-apply').onclick = () => {
    try { importHtml($('import-code').value, $('file-name').textContent || '导入的页面'); $('import-dialog').close(); }
    catch (error) { $('import-error').textContent = error.message; }
  };
  $('export-open').onclick = () => { $('export-code').value = exportHtml(); $('export-dialog').showModal(); };
  $('download').onclick = () => {
    const url = URL.createObjectURL(new Blob([exportHtml()], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'edited-page.html'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('已生成 edited-page.html，请查看浏览器下载。');
  };
  editor.on('load', () => {
    importHtml(sample);
    initializing = false;
    $('demo-start').disabled = false; $('demo-import').disabled = false;
    $('undo').disabled = true; $('redo').disabled = true;
    status('示例已就绪 · 试试点选标题，或导入你自己的 HTML');
    // 测试页复用真实导入导出接口，验证模型与最终文件的行为。
    window.prototypeEditor = { editor, importHtml, exportHtml, moveSelected, getOffset, setOffset, sample };
    EagleEditorTools.install({ editor, getTitle: () => title, setTitle: value => { title = value; $('project-name').textContent = value; }, activate: dismissWelcome, status }).then(tools => { window.prototypeEditor.tools = tools; });
  });
})();
