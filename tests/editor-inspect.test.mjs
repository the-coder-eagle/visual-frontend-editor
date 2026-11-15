import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const scope = vm.createContext({ window: {} });
for (const name of ['inspect', 'document']) vm.runInContext(readFileSync(new URL('../' + name + '.js', import.meta.url), 'utf8'), scope);
const { references, chapters } = scope.window.EagleEditorInspect;
const plain = value => JSON.parse(JSON.stringify(value));
test('脚本引用列出 ID、类名及业务属性行，不执行脚本', () => {
  const code = `throw Error('不得执行');\ndocument.getElementById('continue');\nquerySelector('.action');\nquerySelector('[data-page]');`;
  assert.deepEqual(plain(references(code, { id: 'continue', class: 'action', 'data-page': '0' })), [2, 3, 4]);
  assert.deepEqual(plain(references(code, { id: 'other' })), []);
});
test('章节来自页面按钮，排除自身、重复入口和非章节值', () => {
  const node = (value, label) => ({ getAttribute: () => value, textContent: label });
  const selected = node('2', '当前按钮');
  assert.deepEqual(plain(chapters([selected, node('0', '总览'), node('3', '第三章'), node('3', '重复'), node('x', '其他')], selected)), [
    { value: '0', label: '总览' }, { value: '3', label: '第三章' },
  ]);
});
test('跳转替换原点击行为并调用已有章节按钮；循环引用不会递归', () => {
  let listener, called = 0, prevented = 0, stopped = 0;
  const source = { getAttribute: () => '3' };
  const target = { getAttribute: () => '3', click: () => { called++; } };
  scope.document = { addEventListener(name, fn, capture) { assert.equal(name, 'click'); assert.equal(capture, true); listener = fn; }, querySelectorAll: () => [target] };
  scope.window.EagleEditorDocument.pageActions();
  const event = { target: { closest: () => source }, preventDefault() { prevented++; }, stopImmediatePropagation() { stopped++; } };
  listener(event); assert.equal(called, 1); assert.equal(prevented, 1); assert.equal(stopped, 1);
  target.click = () => { called++; listener(event); };
  listener(event); assert.equal(called, 2);
  scope.document.querySelectorAll = () => [];
  listener(event); assert.equal(called, 2); assert.equal(prevented, 4);
});
