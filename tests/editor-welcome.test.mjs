import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('演示按钮控制暂停、试用、导入；无效导入不关闭演示', async () => {
  const nodes = new Map();
  const classes = () => {
    const values = new Set();
    return { remove: name => values.delete(name), contains: name => values.has(name),
      toggle(name) { if (values.has(name)) { values.delete(name); return false; } values.add(name); return true; } };
  };
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: false, value: '', disabled: false, classList: classes(), attributes: {},
      addEventListener() {}, setAttribute(name, value) { this.attributes[name] = value; },
      click() { this.onclick?.(); }, focus() { this.focused = true; },
      showModal() { this.open = true; }, close() { this.open = false; },
    });
    return nodes.get(id);
  }
  const heading = {}, selected = [];
  const engine = { on() {}, getWrapper: () => ({ getId: () => 'root', find: () => [heading] }), select: value => selected.push(value) };
  const document = { getElementById: node, querySelectorAll: () => [], addEventListener() {}, body: { classList: classes() } };
  const grapesjs = { init: () => engine };
  vm.runInNewContext(await readFile(new URL('../app.js', import.meta.url), 'utf8'), {
    document, grapesjs, window: { grapesjs, DOMPurify: {} },
  });
  node('demo-pause').click();
  assert.equal(node('welcome').classList.contains('is-paused'), true);
  assert.equal(node('demo-pause').attributes['aria-label'], '播放演示');
  node('demo-pause').click();
  assert.equal(node('welcome').classList.contains('is-paused'), false);
  node('demo-import').click();
  assert.equal(node('import-dialog').open, true);
  node('import-dialog').close();
  assert.equal(node('welcome').hidden, false);
  node('import-code').value = ' ';
  node('import-apply').click();
  assert.equal(node('welcome').hidden, false);
  assert.match(node('import-error').textContent, /选择文件或粘贴/);
  node('export-open').disabled = true;
  node('demo-start').click();
  assert.equal(node('welcome').hidden, true);
  assert.equal(node('export-open').disabled, false);
  assert.equal(node('text').focused, true);
  assert.deepEqual(selected, [heading]);
});
