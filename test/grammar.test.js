'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let vsctm = null;
let oniguruma = null;
try {
    vsctm = require('vscode-textmate');
    oniguruma = require('vscode-oniguruma');
} catch {
    test('grammar tests need `npm i vscode-textmate vscode-oniguruma`', { skip: true }, () => {});
}

if (vsctm !== null) {
    const grammarPath = path.join(__dirname, '..', 'syntaxes', 'jira.tmLanguage.json');
    const wasm = fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm'));
    const onigLib = oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength)).then(() => ({
        createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
        createOnigString: (line) => new oniguruma.OnigString(line),
    }));
    const registry = new vsctm.Registry({
        onigLib,
        // Grammars of embedded languages are a boundary: VS Code ships them, the test
        // stands in for them, and without a stand-in vsctm drops the rule that includes one.
        loadGrammar: async (scopeName) => (scopeName === 'text.jira'
            ? vsctm.parseRawGrammar(fs.readFileSync(grammarPath, 'utf8'), grammarPath)
            : vsctm.parseRawGrammar(JSON.stringify({ scopeName, patterns: [] }), `${scopeName}.json`)),
    });

    let grammar = null;
    const load = async () => {
        if (grammar === null) {
            grammar = await registry.loadGrammar('text.jira');
        }
        return grammar;
    };

    /** Scopes covering the first occurrence of `needle` in the given source. */
    async function scopesOf(source, needle) {
        const jira = await load();
        let stack = vsctm.INITIAL;
        for (const line of source.split('\n')) {
            const result = jira.tokenizeLine(line, stack);
            stack = result.ruleStack;
            const at = line.indexOf(needle);
            if (at < 0) {
                continue;
            }
            const token = result.tokens.find((item) => item.startIndex <= at && at < item.endIndex);
            return token === undefined ? [] : token.scopes;
        }
        return [];
    }

    const hasScope = (scopes, name) => scopes.some((scope) => scope.startsWith(name));

    test('a heading is scoped as a heading', async () => {
        assert.ok(hasScope(await scopesOf('h2. Контекст', 'Контекст'), 'markup.heading'));
    });

    test('bold is scoped as bold', async () => {
        assert.ok(hasScope(await scopesOf('текст *жирный* хвост', 'жирный'), 'markup.bold'));
    });

    test('braced bold is scoped as bold', async () => {
        assert.ok(hasScope(await scopesOf('текст {*}жирный{*} хвост', 'жирный'), 'markup.bold'));
    });

    test('italic is scoped as italic', async () => {
        assert.ok(hasScope(await scopesOf('текст _курсив_ хвост', 'курсив'), 'markup.italic'));
    });

    test('an underscore inside a word is not italic', async () => {
        assert.ok(!hasScope(await scopesOf('поле wp_certifications_replacement тут', 'certifications'), 'markup.italic'));
    });

    test('inline monospace is scoped as raw', async () => {
        assert.ok(hasScope(await scopesOf('таблица {{wp_data}} тут', 'wp_data'), 'markup.inline.raw'));
    });

    test('a list marker is scoped as a list', async () => {
        assert.ok(hasScope(await scopesOf(' * пункт списка', '*'), 'punctuation.definition.list'));
    });

    test('a list marker is not read as bold', async () => {
        assert.ok(!hasScope(await scopesOf(' * пункт списка', 'пункт'), 'markup.bold'));
    });

    test('a numbered list marker is scoped as numbered', async () => {
        assert.ok(hasScope(await scopesOf(' # пункт', '#'), 'markup.list.numbered'));
    });

    test('a link target is scoped as a link', async () => {
        assert.ok(hasScope(await scopesOf('см. [отчёт|http://x/a] тут', 'http://x/a'), 'markup.underline.link'));
    });

    test('an attachment is scoped as an attachment link', async () => {
        assert.ok(hasScope(await scopesOf('файл [^ФТТ.xlsx] тут', 'ФТТ.xlsx'), 'markup.underline.link.attachment'));
    });

    test('an image name is scoped as a link', async () => {
        assert.ok(hasScope(await scopesOf('!image-01.png|thumbnail!', 'image-01.png'), 'markup.underline.link.image'));
    });

    test('a table header row is scoped as a header', async () => {
        assert.ok(hasScope(await scopesOf('||Колонка||Вторая||', 'Колонка'), 'markup.bold.table'));
    });

    test('a horizontal rule is scoped as a separator', async () => {
        assert.ok(hasScope(await scopesOf('----', '----'), 'meta.separator'));
    });

    test('a code block body is raw, not markup', async () => {
        const scopes = await scopesOf('{code}\n*не жирный* и _не курсив_\n{code}', 'не жирный');
        assert.ok(hasScope(scopes, 'markup.raw.block'));
        assert.ok(!hasScope(scopes, 'markup.bold'));
    });

    test('a noformat body is raw', async () => {
        assert.ok(hasScope(await scopesOf('{noformat}\n{{не код}}\n{noformat}', 'не код'), 'markup.raw.block'));
    });

    test('a code block with a language marks its body as embedded', async () => {
        assert.ok(hasScope(await scopesOf('{code:sql}\nSELECT 1\n{code}', 'SELECT'), 'meta.embedded.block.sql'));
    });

    test('a code fence is scoped as a tag', async () => {
        assert.ok(hasScope(await scopesOf('{code:none}\nтело\n{code}', '{code:none}'), 'entity.name.tag.block'));
    });

    test('a panel macro is scoped as a tag', async () => {
        assert.ok(hasScope(await scopesOf('{panel:title=Итог}', 'panel'), 'entity.name.tag.block'));
    });

    test('an escaped brace is scoped as an escape', async () => {
        assert.ok(hasScope(await scopesOf('текст \\{year} тут', '\\{'), 'constant.character.escape'));
    });
}
