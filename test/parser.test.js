'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');
const path = require('node:path');

const stub = path.join(__dirname, 'vscode-stub.js');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
    return request === 'vscode' ? stub : resolveFilename.call(this, request, ...rest);
};

const { parseMarkup } = require('../out/parser');

const uri = { fsPath: '/tmp/task.jira' };
const webview = { asWebviewUri: (value) => ({ toString: () => value.toString() }) };

function render(source) {
    return parseMarkup(uri, source, webview);
}

test('italic renders on its own line', () => {
    assert.match(render('_курсив_'), /<i>курсив<\/i>/);
});

test('italic renders on the line right after a list', () => {
    assert.match(render(' - пункт\n_курсив_'), /<i>курсив<\/i>/);
});

test('italic renders inside a list item', () => {
    assert.match(render(' - пункт с _курсивом_'), /<i>курсивом<\/i>/);
});

test('italic renders on a line that also holds a link', () => {
    assert.match(render('см. [ссылку|http://x] и _курсив_'), /<i>курсив<\/i>/);
});

test('italic renders in the braced form {_}text{_}', () => {
    assert.match(render('{_}курсив{_}'), /^<div><i>курсив<\/i><\/div>$/);
});

test('italic renders in the mixed form {_}text_', () => {
    assert.match(render('{_}курсив_'), /^<div><i>курсив<\/i><\/div>$/);
});

test('strikethrough renders after a list', () => {
    assert.match(render(' - пункт\n-зачёркнуто-'), /line-through;'>зачёркнуто<\/span>/);
});

test('underscores in a link target survive', () => {
    assert.match(render('см. [отчёт|http://x/some_page_here]'), /href='http:\/\/x\/some_page_here'/);
});

test('underscores in inline monospace survive', () => {
    assert.match(render('{{_x_}}'), /<code>_x_<\/code>/);
});

test('bold still renders in link text', () => {
    assert.match(render('[*жирный*|http://x]'), /<a href='http:\/\/x'><strong>жирный<\/strong><\/a>/);
});

test('inline markup does not run inside a code block', () => {
    const html = render('{code}\n_курсив_ и *жирный*\n{code}');
    assert.doesNotMatch(html, /<i>/);
    assert.doesNotMatch(html, /<strong>/);
});

test('inline markup does not cross a table cell boundary', () => {
    const html = render('|приёма-передачи - дата|приёма-передачи - дата|');
    assert.doesNotMatch(html, /line-through/);
    assert.match(html, /<td>приёма-передачи - дата<\/td><td>приёма-передачи - дата<\/td>/);
});

test('an image on its own line renders as an img tag', () => {
    assert.match(render('!image-01.png|thumbnail!'), /<img alt="image-01\.png" src="file:\/\/\/tmp\/image-01\.png" thumbnail">/);
});

test('a heading renders at its level', () => {
    assert.match(render('h3. Описание'), /<h3 id="toc-\d+">Описание<\/h3>/);
});

test('a heading keeps a query string in a url', () => {
    assert.match(
        render('h3. Справочник (/index.php?module=Dictionaries&task=Lab) добавляем поля'),
        /<h3 id="toc-\d+">Справочник \(\/index\.php\?module=Dictionaries&task=Lab\) добавляем поля<\/h3>/
    );
});

test('a heading keeps a trailing question mark', () => {
    assert.match(render('h2. Что делать?'), /<h2 id="toc-\d+">Что делать\?<\/h2>/);
});

test('an empty code block is not rendered', () => {
    assert.strictEqual(render('{code}\n{code}'), '');
});

test('an empty titled code block is not rendered', () => {
    assert.strictEqual(render('{code:title=Пример}\n{code}'), '');
});

test('a code block with content is still rendered', () => {
    assert.match(render('{code}\nтело\n{code}'), /<pre><code>тело/);
});

test('brackets inside inline monospace do not become a link', () => {
    assert.strictEqual(
        render(' * {{result}} — {{sample.results[field_id]}}'),
        '<ul><li><code>result</code> — <code>sample.results[field_id]</code>'
    );
});

test('an exclamation pair inside inline monospace does not become an image', () => {
    assert.match(render('{{echo !file.png! done}}'), /<code>echo !file\.png! done<\/code>/);
});

test('text next to an image on the same line survives', () => {
    assert.match(render('!img.png|thumbnail! и хвост'), /<img [^>]*> и хвост/);
});

test('a link outside monospace still renders', () => {
    assert.match(render('см. [отчёт|http://x/a_b] тут'), /см\. <a href='http:\/\/x\/a_b'>отчёт<\/a> тут/);
});

test('two attachments on one line both render', () => {
    const html = render('см. [^а.xlsx] и [^б.xlsx]');
    assert.strictEqual(html.match(/class="attachment"/g).length, 2);
    assert.doesNotMatch(html, /<sup>/);
});

test('superscript still renders outside monospace', () => {
    assert.match(render('площадь 5 м^2^ всего'), /м<sup>2<\/sup> всего/);
});

test('subscript still renders outside monospace', () => {
    assert.match(render('формула H~2~S тут'), /H<sub>2<\/sub>S/);
});

test('superscript does not run inside inline monospace', () => {
    assert.match(render('{{a^b^c}} и 2^10^'), /<code>a\^b\^c<\/code> и 2<sup>10<\/sup>/);
});

test('underline does not run inside inline monospace', () => {
    assert.match(render('{{x+y+z}} и +под+'), /<code>x\+y\+z<\/code> и <u>под<\/u>/);
});

test('subscript does not run inside inline monospace', () => {
    assert.match(render('{{a~b~c}} снаружи'), /<code>a~b~c<\/code> снаружи/);
});

test('markup inside link text still renders', () => {
    assert.match(render('[+жирный+|http://x]'), /<a href='http:\/\/x'><u>жирный<\/u><\/a>/);
});

test('a blockquote keeps inline monospace inside it', () => {
    assert.match(render('bq. цитата с {{кодом}} внутри'), /<blockquote><p>цитата с <code>кодом<\/code> внутри<\/p><\/blockquote>/);
});

test('color spans still render', () => {
    assert.match(render('{color:red}красный{color}'), /<span style='color:red;'>красный<\/span>/);
});

test('inline monospace holding an asterisk renders as code', () => {
    assert.match(render('обязательные {{*}} поля'), /обязательные <code>\*<\/code> поля/);
});

test('inline monospace holding a plus renders as code', () => {
    assert.match(render('плюс {{+}} тут'), /плюс <code>\+<\/code> тут/);
});

test('braced bold is still unwrapped', () => {
    assert.match(render('текст {*}жирный{*} хвост'), /текст <strong>жирный<\/strong> хвост/);
});

test('braced underline is still unwrapped', () => {
    assert.match(render('текст {+}подчёркнуто{+} хвост'), /текст <u>подчёркнуто<\/u> хвост/);
});

test('a braced delimiter inside monospace is left literal', () => {
    assert.match(render('{{шаблон {*} внутри}}'), /<code>шаблон \{\*\} внутри<\/code>/);
});

test('the table of contents nests by heading level', () => {
    const html = render('h1. Один\nh2. Два\nh3. Три\nh2. Ещё два');
    const toc = html.slice(0, html.indexOf('</details>'));
    assert.match(toc, /<ul><li><a href="#toc-1">Один<\/a><ul><li><a href="#toc-2">Два<\/a><ul><li><a href="#toc-3">Три<\/a><\/li><\/ul><\/li><li><a href="#toc-4">Ещё два<\/a><\/li><\/ul><\/li><\/ul>/);
});

test('every heading gets the anchor its entry points at', () => {
    const html = render('h2. Раз\nh2. Два');
    assert.match(html, /<h2 id="toc-1">Раз<\/h2>/);
    assert.match(html, /<h2 id="toc-2">Два<\/h2>/);
});

test('a document without headings, links or attachments gets no table of contents', () => {
    assert.strictEqual(render('просто текст'), '<div>просто текст</div>');
});

test('a heading inside a code block stays out of the table of contents', () => {
    assert.doesNotMatch(render('{code}\nh2. Не заголовок\n{code}'), /<details/);
});

test('attachments get their own section', () => {
    const html = render('h2. Раздел\nсм. [^ФТТ.xlsx]');
    const toc = html.slice(0, html.indexOf('</details>'));
    assert.match(toc, /<div class="toc-section">Attachments<\/div>/);
    assert.match(toc, /ФТТ\.xlsx/);
});

test('links get their own section', () => {
    const html = render('h2. Раздел\nсм. [отчёт|http://x/a]');
    const toc = html.slice(0, html.indexOf('</details>'));
    assert.match(toc, /<div class="toc-section">Links<\/div>/);
    assert.match(toc, /<a href="http:\/\/x\/a">отчёт<\/a>/);
});

test('a section is left out when there is nothing for it', () => {
    const toc = render('h2. Раздел');
    assert.doesNotMatch(toc, /Attachments/);
    assert.doesNotMatch(toc, /Links/);
});

test('a link repeated in the document is listed once', () => {
    const html = render('h2. Раздел\n[отчёт|http://x/a] и снова [отчёт|http://x/a]');
    const toc = html.slice(0, html.indexOf('</details>'));
    assert.strictEqual(toc.match(/http:\/\/x\/a/g).length, 1);
});

test('markup inside a heading does not leak into its entry', () => {
    const html = render('h2. Раздел {{кода}} и *жирного*');
    const toc = html.slice(0, html.indexOf('</details>'));
    assert.match(toc, /<a href="#toc-1">Раздел кода и жирного<\/a>/);
});

test('a code block with a known language is highlighted', () => {
    const html = render('{code:sql}\nSELECT id FROM t\n{code}');
    assert.match(html, /<code class="hljs language-sql">/);
    assert.match(html, /<span class="hljs-keyword">SELECT<\/span>/);
});

test('highlighting escapes what it emits', () => {
    const html = render('{code:sql}\nWHERE x < 2\n{code}');
    assert.match(html, /&lt;<\/span>/);
    assert.match(html, /<span class="hljs-number">2<\/span>/);
    assert.doesNotMatch(html.slice(html.indexOf('language-sql')), /x <[^\/s]/);
});

test('a code block with an unknown language is left plain', () => {
    const html = render('{code:none}\nrows = []\n{code}');
    assert.match(html, /<code class="language-none">rows = \[\]/);
    assert.doesNotMatch(html, /hljs-/);
});

test('a code block without a language is left plain', () => {
    assert.match(render('{code}\nтело\n{code}'), /<pre><code>тело/);
});

test('a title and a language are read from the same fence', () => {
    const html = render('{code:title=Пример|language=php}\n$x = 1;\n{code}');
    assert.match(html, /<span class="code-title">Пример<\/span>/);
    assert.match(html, /<code class="hljs language-php">/);
});

test('markup inside a highlighted block is not parsed', () => {
    assert.doesNotMatch(render('{code:sql}\n-- *не жирный* и [не ссылка]\n{code}'), /<strong>|<a /);
});

test('a multi-line quote renders as one blockquote', () => {
    assert.strictEqual(render('{quote}\nпервая\nвторая\n{quote}'), '<blockquote><div>первая</div><div>вторая</div></blockquote>');
});

test('text on the fence lines of a quote stays inside it', () => {
    assert.strictEqual(render('{quote}начало\nконец{quote}'), '<blockquote><div>начало</div><div>конец</div></blockquote>');
});

test('a quote right under a list item is nested in that item', () => {
    assert.strictEqual(
        render('* показать:\n{quote}\nтекст\n{quote}\n* закрыть'),
        '<ul><li>показать:<blockquote><div>текст</div></blockquote></li><li>закрыть'
    );
});

test('a quote after a blank line ends the list', () => {
    assert.match(render('* показать:\n\n{quote}\nтекст\n{quote}'), /^<ul><li>показать:<\/ul><blockquote>/);
});

test('a blank line inside a quote in a list ends only the lists started in the quote', () => {
    assert.strictEqual(
        render('* пункт\n{quote}\n* вложенный\n\nабзац\n{quote}\n* следующий'),
        '<ul><li>пункт<blockquote><ul><li>вложенный</ul><div>абзац</div></blockquote></li><li>следующий'
    );
});

test('a blank line inside a panel in a list does not close the list', () => {
    assert.strictEqual(
        render('* шаг\n{panel}\nа\n\nб\n{panel}\n* дальше'),
        '<ul><li>шаг<div><div class="panel panel-body" ><div>а</div><div>б</div></div></div></li><li>дальше'
    );
});

test('a blank line inside a code block in a list stays in the code', () => {
    assert.match(render('* шаг\n{code}\nа\n\nб\n{code}\n* дальше'), /<code>а\n\nб\n<\/code><\/pre><\/div><\/li><li>дальше$/);
});

test('a quote fence inside a code block is left literal', () => {
    assert.match(render('{code}\n{quote}\nх\n{quote}\n{code}'), /<code>\{quote\}\nх\n\{quote\}\n<\/code>/);
});
