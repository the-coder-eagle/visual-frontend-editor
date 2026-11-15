import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {}, URL });
vm.runInContext(readFileSync(new URL('../links.js', import.meta.url), 'utf8'), context);
const { validateHref, unlink } = context.window.EagleEditorLinks;

test('链接保留网页、邮箱、电话、页内目标与相对路径', () => {
  for (const href of ['https://example.com/path?q=1#top', 'http://example.com', 'mailto:a@example.com', 'tel:123', '#章节', '../page.html', '//example.com']) {
    assert.equal(validateHref(' ' + href + ' '), href);
  }
});
test('改链接不能引入脚本、文件或可执行 data URL', () => {
  for (const href of ['', ' ', 'javascript:alert(1)', 'java\nscript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,test', 'file:///C:/test.html', 'vbscript:msgbox(1)']) {
    assert.throws(() => validateHref(href));
  }
});
test('取消链接一次更新模型，保留样式和业务属性', () => {
  const original = { href: 'https://example.com', target: '_blank', rel: 'noopener', download: '', ping: '/ping', referrerpolicy: 'origin', id: 'source', class: 'card', 'data-task': '1' };
  let result, writes = 0;
  unlink({ getAttributes: () => original, setAttributes(value) { result = value; writes++; } });
  assert.equal(writes, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { id: 'source', class: 'card', 'data-task': '1' });
  assert.equal(original.href, 'https://example.com');
});
