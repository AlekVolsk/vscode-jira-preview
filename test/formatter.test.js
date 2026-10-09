'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { formatJira, isInsideVerbatim } = require('../out/formatter');

function format(text, options) {
    return formatJira(text, options);
}

test('empty separators inside monospace are dropped', () => {
    assert.strictEqual(format('Таблица {{{}wp_certifications{}}} удалить.\n'), 'Таблица {{wp_certifications}} удалить.\n');
});

test('empty separator between two identical delimiters is kept', () => {
    assert.strictEqual(format('*раз*{}*два*\n'), '*раз*{}*два*\n');
});

test('empty separator before a closing brace is dropped', () => {
    assert.strictEqual(format('стиль {{{}tm-*{}}}, Options API\n'), 'стиль {{tm-*}}, Options API\n');
});

test('empty separator next to plain text is dropped', () => {
    assert.strictEqual(format('текст {}ещё текст\n'), 'текст ещё текст\n');
});

test('constructs with no content are removed', () => {
    assert.strictEqual(format('было {{}} и {color:red}{color} и {*}{*} стало\n'), 'было и и стало\n');
});

test('braced delimiters are unwrapped where the plain form renders the same', () => {
    assert.strictEqual(format('пересчитывать, {*}если не вручную{*}.\n'), 'пересчитывать, *если не вручную*.\n');
});

test('braced delimiters adjacent to word characters are kept', () => {
    assert.strictEqual(format('сло{*}во{*}рот\n'), 'сло{*}во{*}рот\n');
});

test('braced delimiter at line start is kept so it stays out of list syntax', () => {
    assert.strictEqual(format('{*}Первичное завершение{*} работ\n'), '{*}Первичное завершение{*} работ\n');
});

test('adjacent braced delimiters are not merged into a broken run', () => {
    assert.strictEqual(format('текст {*}раз{*}{*}два{*} конец\n'), 'текст *раз*{*}два{*} конец\n');
});

test('cleanupMarkup=empty leaves braced delimiters alone', () => {
    assert.strictEqual(
        format('{{{}name{}}} и {*}жирный{*}.\n', { cleanupMarkup: 'empty' }),
        '{{name}} и {*}жирный{*}.\n'
    );
});

test('cleanupMarkup=off leaves every construct alone', () => {
    assert.strictEqual(format('{{{}name{}}}\n', { cleanupMarkup: 'off' }), '{{{}name{}}}\n');
});

test('list markers are indented by nesting depth', () => {
    assert.strictEqual(
        format(' * раз\n ** два\n *** три\n # нумерованный\n'),
        '* раз\n ** два\n  *** три\n\n# нумерованный\n'
    );
});

test('listIndent=space puts one space before every marker', () => {
    assert.strictEqual(format('* раз\n** два\n', { listIndent: 'space' }), ' * раз\n ** два\n');
});

test('listIndent=flush puts every marker at column zero', () => {
    assert.strictEqual(format(' * раз\n ** два\n', { listIndent: 'flush' }), '* раз\n** два\n');
});

test('spacing after a list marker is normalized to one space', () => {
    assert.strictEqual(format('*     раз\n', { listIndent: 'flush' }), '* раз\n');
});

test('a bold line is not mistaken for a list item', () => {
    assert.strictEqual(format('*2.1. Вкладки*\n'), '*2.1. Вкладки*\n');
});

test('headings get a blank line before and after', () => {
    assert.strictEqual(
        format('текст\nh2. Контекст\nещё текст\n'),
        'текст\n\nh2. Контекст\n\nещё текст\n'
    );
});

test('heading spacing is normalized', () => {
    assert.strictEqual(format('h3.Описание\n'), 'h3. Описание\n');
});

test('blank lines inside a list are removed', () => {
    assert.strictEqual(format('* раз\n\n* два\n', { listIndent: 'flush' }), '* раз\n* два\n');
});

test('a continuation line stays attached to its list item', () => {
    assert.strictEqual(
        format('* В справочнике убрать поля:\n!image-01.png|thumbnail!\n* Убрать справочник\n', { listIndent: 'flush' }),
        '* В справочнике убрать поля:\n!image-01.png|thumbnail!\n* Убрать справочник\n'
    );
});

test('paragraphs keep their own split', () => {
    assert.strictEqual(format('первый абзац\n\nвторой абзац\n'), 'первый абзац\n\nвторой абзац\n');
});

test('runs of blank lines collapse to one', () => {
    assert.strictEqual(format('первый\n\n\n\nвторой\n'), 'первый\n\nвторой\n');
});

test('a list block is separated from the text above it', () => {
    assert.strictEqual(
        format('Правила:\n* раз\n* два\n\nПосле списка\n', { listIndent: 'flush' }),
        'Правила:\n\n* раз\n* два\n\nПосле списка\n'
    );
});

test('text glued to the last list item stays glued', () => {
    assert.strictEqual(
        format('Правила:\n* раз\n* два\nПосле списка\n', { listIndent: 'flush' }),
        'Правила:\n\n* раз\n* два\nПосле списка\n'
    );
});

test('code blocks are copied verbatim', () => {
    const source = 'текст\n{code:sql}\nSELECT  1\n\n    WHERE x = 2   \n{code}\nхвост\n';
    assert.strictEqual(
        format(source),
        'текст\n\n{code:sql}\nSELECT  1\n\n    WHERE x = 2   \n{code}\n\nхвост\n'
    );
});

test('markup inside a code block is left alone', () => {
    assert.strictEqual(
        format('{noformat}\n{{{}name{}}} и {*}жирный{*}\n{noformat}\n'),
        '{noformat}\n{{{}name{}}} и {*}жирный{*}\n{noformat}\n'
    );
});

test('panel content is formatted but not detached from its fences', () => {
    assert.strictEqual(
        format('{panel:title=Итог}\nтекст  с  пробелами\n{panel}\n'),
        '{panel:title=Итог}\nтекст с пробелами\n{panel}\n'
    );
});

test('a block right under a list item stays inside the list', () => {
    assert.strictEqual(
        format('* показать:\n{quote}\nтекст\n{quote}\n* закрыть\n', { listIndent: 'flush' }),
        '* показать:\n{quote}\nтекст\n{quote}\n* закрыть\n'
    );
});

test('a block under a list continuation line stays inside the list', () => {
    assert.strictEqual(
        format('* шаг\nпояснение\n{code:sql}\nSELECT 1\n{code}\n* дальше\n', { listIndent: 'flush' }),
        '* шаг\nпояснение\n{code:sql}\nSELECT 1\n{code}\n* дальше\n'
    );
});

test('blank lines the author put around a block in a list are kept', () => {
    assert.strictEqual(
        format('* показать:\n\n{quote}\nтекст\n{quote}\n\n* закрыть\n', { listIndent: 'flush' }),
        '* показать:\n\n{quote}\nтекст\n{quote}\n\n* закрыть\n'
    );
});

test('a block outside a list is still separated from text', () => {
    assert.strictEqual(format('текст\n{quote}\nцитата\n{quote}\nхвост\n'), 'текст\n\n{quote}\nцитата\n{quote}\n\nхвост\n');
});

test('table rows stay together and keep their inner spacing', () => {
    assert.strictEqual(
        format('Список:\n||№  ||Вкладка||\n|1  |Не завершённый|\nПосле\n'),
        'Список:\n\n||№  ||Вкладка||\n|1  |Не завершённый|\n\nПосле\n'
    );
});

test('trailing whitespace and the ends of the file are trimmed', () => {
    assert.strictEqual(format('\n\n  текст   \n\t\n\n'), 'текст\n');
});

test('a non-breaking space followed by a space collapses', () => {
    assert.strictEqual(format('активен),  который уже нет\n'), 'активен), который уже нет\n');
});

test('a lone non-breaking space is preserved', () => {
    assert.strictEqual(format('10 кг\n'), '10 кг\n');
});

test('collapseSpaces=false keeps runs of spaces', () => {
    assert.strictEqual(format('текст  с  пробелами\n', { collapseSpaces: false }), 'текст  с  пробелами\n');
});

test('inline monospace keeps its spacing', () => {
    assert.strictEqual(format('строка {{a  b}} конец\n'), 'строка {{a  b}} конец\n');
});

test('a horizontal rule is normalized', () => {
    assert.strictEqual(format('текст\n------\nещё\n'), 'текст\n\n----\n\nещё\n');
});

test('blankLines=minimal only collapses and trims', () => {
    assert.strictEqual(
        format('текст\nh2. Контекст\n\n\nещё\n', { blankLines: 'minimal', listIndent: 'flush' }),
        'текст\nh2. Контекст\n\nещё\n'
    );
});

test('blankLines=headings does not split a heading from what follows', () => {
    assert.strictEqual(
        format('текст\nh2. Контекст\nещё\n', { blankLines: 'headings' }),
        'текст\n\nh2. Контекст\nещё\n'
    );
});

test('the requested line ending is used', () => {
    assert.strictEqual(format('h2. A\nтекст\n', { eol: '\r\n' }), 'h2. A\r\n\r\nтекст\r\n');
});

test('finalNewline=false formats a fragment without adding one', () => {
    assert.strictEqual(format('* раз\n* два', { finalNewline: false, listIndent: 'flush' }), '* раз\n* два');
});

test('an empty document stays empty', () => {
    assert.strictEqual(format('   \n\n'), '');
});

test('formatting is idempotent', () => {
    const source = [
        'h2. Модули',
        '/index.php?module=WorkPermit — Наряд-допуск',
        'h2. Контекст',
        '',
        'Объект {{{}wp_departments_objects.id=208{}}},  уже не активен.',
        'h3. 1. Убрать настройки',
        ' * В справочнике убрать поля:',
        '!image-01.png|thumbnail!',
        ' * Убрать справочник',
        '',
        ' ** Вложенный пункт   ',
        '{code:sql}',
        'SELECT  1',
        '{code}',
        '||Колонка  ||Вторая||',
        '|значение|ещё|',
        'Хвост {*}жирный{*}.',
        '* показать уведомление:',
        '{quote}',
        'Не удалось сохранить.',
        '{quote}',
        '* закрыть форму',
        '',
        '',
    ].join('\n');
    const once = format(source);
    assert.strictEqual(format(once), once);
});

test('isInsideVerbatim reports lines within a code block', () => {
    const source = 'текст\n{code}\nтело\n{code}\nхвост\n';
    assert.strictEqual(isInsideVerbatim(source, 0), false);
    assert.strictEqual(isInsideVerbatim(source, 2), true);
    assert.strictEqual(isInsideVerbatim(source, 3), true);
    assert.strictEqual(isInsideVerbatim(source, 4), false);
});

test('adjacent lists of different types are separated', () => {
    assert.strictEqual(
        format('* раз\n* два\n# другой список\n', { listIndent: 'flush' }),
        '* раз\n* два\n\n# другой список\n'
    );
});

test('empty pairs of bare delimiters are removed', () => {
    assert.strictEqual(format('статусы. *__* \n'), 'статусы.\n');
});

test('bare delimiters inside words are left alone', () => {
    assert.strictEqual(format('*a**b* и C++ и col__name\n'), '*a**b* и C++ и col__name\n');
});

test('markdown-style bold is not mistaken for an empty pair', () => {
    assert.strictEqual(format('**жирный**\n'), '**жирный**\n');
});

const NOTICE = 'Unable to find source-code formatter for language: code. Available languages are: '
    + 'actionscript, ada, applescript, bash, c, c#, c++, cpp, css, erlang, go, groovy, haskell, html, '
    + 'java, javascript, js, json, lua, none, nyan, objc, perl, php, python, r, rainbow, ruby, scala, '
    + 'sh, sql, swift, visualbasic, xml, yaml';

test("Jira's formatter notice is cut and the language becomes none", () => {
    assert.strictEqual(
        format(`{code:java}\n${NOTICE}GET /settings\nPOST /export\n{code}\n`),
        '{code:none}\nGET /settings\nPOST /export\n{code}\n'
    );
});

test('content welded to the notice in lower case survives', () => {
    assert.strictEqual(
        format(`{code:java}\n${NOTICE}rows = []\n{code}\n`),
        '{code:none}\nrows = []\n{code}\n'
    );
});

test('an opening fence left unclosed before the next one is dropped', () => {
    assert.strictEqual(
        format('{code:java}\nh3. Заголовок\n\nтекст\n\n{code:sql}\nSELECT 1\n{code}\n'),
        'h3. Заголовок\n\nтекст\n\n{code:sql}\nSELECT 1\n{code}\n'
    );
});

test('a closing fence is written without a language', () => {
    assert.strictEqual(format('{code:sql}\nSELECT 1\n{code:sql}\n'), '{code:sql}\nSELECT 1\n{code}\n');
});

test('a language Jira cannot highlight becomes none', () => {
    assert.strictEqual(format('{code:code}\nтело\n{code}\n'), '{code:none}\nтело\n{code}\n');
});

test('a language Jira knows is kept', () => {
    assert.strictEqual(format('{code:sql}\nSELECT 1\n{code}\n'), '{code:sql}\nSELECT 1\n{code}\n');
});

test('a panel title is not treated as a language', () => {
    assert.strictEqual(format('{panel:title=Итог}\nтекст\n{panel}\n'), '{panel:title=Итог}\nтекст\n{panel}\n');
});

test('an unclosed code block is closed at the end of the file', () => {
    assert.strictEqual(format('текст\n\n{code}\nтело\n'), 'текст\n\n{code}\nтело\n{code}\n');
});

test('cleanupMarkup=off leaves broken fences alone', () => {
    const source = `{code:java}\n${NOTICE}rows = []\n{code}\n`;
    assert.strictEqual(format(source, { cleanupMarkup: 'off' }), source);
});

test('a fence with a language that has no closing fence ahead is treated as closing', () => {
    assert.strictEqual(format('{code:sql}\nSELECT 1\n{code:sql}\n'), '{code:sql}\nSELECT 1\n{code}\n');
});

test('an empty code block is left in the source', () => {
    assert.strictEqual(format('{code}\n{code}\n'), '{code}\n{code}\n');
});
