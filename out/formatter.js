'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.formatJira = formatJira;
exports.isInsideVerbatim = isInsideVerbatim;

const DEFAULTS = {
    blankLines: 'full',
    listIndent: 'depth',
    cleanupMarkup: 'full',
    collapseSpaces: true,
    eol: '\n',
    finalNewline: true,
};

const HEADING_RE = /^h([1-6])\.[ \t\u00a0]*(.*)$/;
const LIST_RE = /^([*#-]+)[ \t\u00a0]+(.*)$/;
const HR_RE = /^-{4,}$/;
const BQ_RE = /^bq\.[ \t\u00a0]*(.*)$/;
const FENCE_RE = /^\{(code|noformat|panel|quote|tip|info|note|warning)(?::[^}]*)?\}$/;
const PROTECT_RE = /\{\{[\s\S]*?\}\}|\{(code|noformat)(?::[^}]*)?\}[\s\S]*?\{\1\}|\[[^\]]*\]|![^\s!][^!]*!|\{[a-zA-Z]+(?::[^}]*)?\}/g;
const WORD_RE = /[\p{L}\p{N}_]/u;

const VERBATIM_MACROS = new Set(['code', 'noformat']);
const MARKUP_CHARS = new Set(['*', '_', '+', '-', '^', '~', '{', '}', '[', ']', '!', '|', '?', '#']);

/**
 * `{}` is Jira's empty separator: it renders as nothing and only matters between two
 * identical delimiters, which would otherwise merge into a pair (`*a*{}*b*`). Anywhere
 * else it goes, which is what turns `{{{}table_name{}}}` back into `{{table_name}}`
 * and `{{{}tm-*{}}}` into `{{tm-*}}`.
 */
const JIRA_LANGUAGES = [
    'actionscript', 'ada', 'applescript', 'bash', 'c', 'c#', 'c++', 'cpp', 'css', 'erlang', 'go',
    'groovy', 'haskell', 'html', 'java', 'javascript', 'js', 'json', 'lua', 'none', 'nyan', 'objc',
    'perl', 'php', 'python', 'r', 'rainbow', 'ruby', 'scala', 'sh', 'sql', 'swift', 'visualbasic',
    'xml', 'yaml',
];
/**
 * Jira answers an unknown `{code:lang}` by rewriting the fence to `{code:java}` and
 * pasting its complaint into the block, welded to the first real line with no
 * separator (`…, xml, yamlrows = []`). The language list is alphabetical and ends
 * at `yaml`, so that is the anchor the weld is cut at.
 */
const NOTICE_RE = /^Unable to find source-code formatter for language: [^.]*\. Available languages are: .*?yaml/;

function stripFormatterNotice(line) {
    const notice = line.match(NOTICE_RE);
    return notice === null ? null : line.slice(notice[0].length);
}

function fenceParts(trimmed) {
    const match = trimmed.match(/^\{(code|noformat|panel|quote|tip|info|note|warning)(?::([^}]*))?\}$/);
    if (match === null) {
        return null;
    }
    return { macro: match[1], params: match[2] === undefined ? null : match[2] };
}

/**
 * `{panel:title=…}` carries a title, not a language: only a code fence has its
 * parameter checked against what Jira can highlight.
 */
function fenceParams(fence) {
    if (fence.params === null) {
        return '';
    }
    if (!VERBATIM_MACROS.has(fence.macro)) {
        return ':' + fence.params;
    }
    return JIRA_LANGUAGES.includes(fence.params.toLowerCase()) ? ':' + fence.params : ':none';
}

/**
 * A fence carrying a parameter is an opening one — Jira writes a closing fence bare.
 * So an opening fence met while a block is already open means the closing fence was
 * lost, and the stale opening one is dropped: its body was never code. The exception
 * is a fence that has no closing fence of its own ahead, which was meant as a closing
 * one and merely kept its language.
 */
function fenceRoles(positions) {
    const roles = new Map();
    const dropped = new Set();
    let open = -1;
    for (let i = 0; i < positions.length; i += 1) {
        const fence = positions[i];
        if (open === -1 || positions[open].macro !== fence.macro) {
            roles.set(fence.line, 'open');
            open = i;
            continue;
        }
        if (fence.params === null) {
            roles.set(fence.line, 'close');
            open = -1;
            continue;
        }
        const next = positions[i + 1];
        if (next !== undefined && next.macro === fence.macro && next.params === null) {
            dropped.add(positions[open].line);
            roles.delete(positions[open].line);
            roles.set(fence.line, 'open');
            open = i;
            continue;
        }
        roles.set(fence.line, 'close');
        open = -1;
    }
    return { roles, dropped };
}

/**
 * Fences are repaired before anything else looks at the document: the notice is cut,
 * a language Jira does not know becomes `none`, and a closing fence is written bare.
 */
function repairFences(lines) {
    const cleaned = [];
    for (const raw of lines) {
        const stripped = stripFormatterNotice(raw.trim());
        if (stripped === null) {
            cleaned.push(raw);
            continue;
        }
        const previous = cleaned.length - 1;
        const fence = previous >= 0 ? fenceParts(cleaned[previous].trim()) : null;
        if (fence !== null && VERBATIM_MACROS.has(fence.macro)) {
            cleaned[previous] = `{${fence.macro}:none}`;
        }
        if (stripped !== '') {
            cleaned.push(stripped);
        }
    }

    const positions = [];
    cleaned.forEach((line, index) => {
        const fence = fenceParts(line.trim());
        if (fence !== null) {
            positions.push({ line: index, macro: fence.macro, params: fence.params });
        }
    });
    const { roles, dropped } = fenceRoles(positions);

    const out = [];
    const unclosed = [];
    cleaned.forEach((line, index) => {
        if (dropped.has(index)) {
            return;
        }
        const role = roles.get(index);
        if (role === undefined) {
            out.push(line);
            return;
        }
        const fence = fenceParts(line.trim());
        if (role === 'close') {
            unclosed.pop();
            out.push(`{${fence.macro}}`);
            return;
        }
        unclosed.push(fence.macro);
        out.push(`{${fence.macro}${fenceParams(fence)}}`);
    });
    while (unclosed.length > 0) {
        while (out.length > 0 && out[out.length - 1].trim() === '') {
            out.pop();
        }
        out.push(`{${unclosed.pop()}}`);
    }
    return out;
}

function removeEmptySeparators(text) {
    let out = '';
    let i = 0;
    while (i < text.length) {
        if (text[i] === '{' && text[i + 1] === '}' && text[i - 1] !== '\\') {
            const prev = out.length > 0 ? out[out.length - 1] : '';
            const next = i + 2 < text.length ? text[i + 2] : '';
            if (!(prev === next && MARKUP_CHARS.has(prev))) {
                i += 2;
                continue;
            }
        }
        out += text[i];
        i += 1;
    }
    return out;
}

/**
 * `{*}` both opens and closes, so `{*}a{*}{*}b{*}` holds a closing and an opening
 * token side by side, not an empty pair. Tokens are paired in order of appearance
 * and only a pair with nothing between its halves is dropped.
 */
function removeEmptyBracedPairs(text) {
    const re = /\{([*_+^~-])\}/g;
    const seen = new Map();
    let match;
    while ((match = re.exec(text)) !== null) {
        const found = seen.get(match[1]);
        if (found === undefined) {
            seen.set(match[1], [match.index]);
        } else {
            found.push(match.index);
        }
    }
    const cuts = [];
    for (const positions of seen.values()) {
        for (let i = 0; i + 1 < positions.length; i += 2) {
            if (positions[i + 1] === positions[i] + 3) {
                cuts.push([positions[i], positions[i] + 6]);
            }
        }
    }
    if (cuts.length === 0) {
        return text;
    }
    cuts.sort((a, b) => a[0] - b[0]);
    let out = '';
    let last = 0;
    for (const [start, end] of cuts) {
        out += text.slice(last, start);
        last = end;
    }
    return out + text.slice(last);
}

const EMPTY_PAIR_RES = [
    /(?<![\p{L}\p{N}_*])\*\*(?![\p{L}\p{N}_*])/gu,
    /(?<![\p{L}\p{N}_])__(?![\p{L}\p{N}_])/gu,
    /(?<![\p{L}\p{N}_+])\+\+(?![\p{L}\p{N}_+])/gu,
];

/**
 * A pair of delimiters with nothing between them renders as nothing but leaks its
 * characters into the text. `--` is left alone: it is a dash, not empty markup.
 */
function removeEmptyPairs(text) {
    let out = text;
    for (let pass = 0; pass < 4; pass += 1) {
        let next = out;
        for (const re of EMPTY_PAIR_RES) {
            next = next.replace(re, '');
        }
        if (next === out) {
            return out;
        }
        out = next;
    }
    return out;
}

function removeEmptyConstructs(text) {
    return removeEmptyPairs(removeEmptyBracedPairs(text))
        .replace(/\{\{\{\}\}\}/g, '')
        .replace(/\{\{\}\}/g, '')
        .replace(/\{color:[^}]*\}\{color\}/g, '');
}

function cleanupEmpty(text) {
    return removeEmptyConstructs(removeEmptySeparators(removeEmptyConstructs(text)));
}

function canUnwrap(delim, body, prev, next, atLineStart) {
    if (body === '' || body.includes(delim)) {
        return false;
    }
    if (/^\s/.test(body) || /\s$/.test(body)) {
        return false;
    }
    if (atLineStart && (delim === '*' || delim === '-' || delim === '#')) {
        return false;
    }
    if (prev !== '' && (WORD_RE.test(prev) || prev === delim)) {
        return false;
    }
    if (next !== '' && (WORD_RE.test(next) || next === delim)) {
        return false;
    }
    return true;
}

/**
 * `{*}text{*}` is the escaped form of `*text*`, needed only when a neighbouring
 * character would swallow the bare delimiter. Where the plain form renders the
 * same, the braces are noise.
 */
function unwrapBraceDelimiters(segment, context) {
    const re = /\{([*_+^~-])\}(.+?)\{\1\}/g;
    let out = '';
    let last = 0;
    let match;
    while ((match = re.exec(segment)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const delim = match[1];
        const body = match[2];
        let prev;
        if (start === 0) {
            prev = context.prevChar;
        } else if (last === start && out.length > 0) {
            prev = out[out.length - 1];
        } else {
            prev = segment[start - 1];
        }
        const next = end < segment.length ? segment[end] : context.nextChar;
        const atLineStart = context.lineStart && prev === '' && /^[ \t\u00a0]*$/.test(segment.slice(0, start));
        if (!canUnwrap(delim, body, prev, next, atLineStart)) {
            continue;
        }
        out += segment.slice(last, start) + delim + body + delim;
        last = end;
    }
    return out + segment.slice(last);
}

function protectedRanges(line) {
    const ranges = [];
    PROTECT_RE.lastIndex = 0;
    let match;
    while ((match = PROTECT_RE.exec(line)) !== null) {
        ranges.push([match.index, match.index + match[0].length]);
    }
    return ranges;
}

function applyToFreeText(line, atLineStart, transform) {
    let out = '';
    let last = 0;
    for (const [start, end] of protectedRanges(line)) {
        out += transform(line.slice(last, start), {
            prevChar: last > 0 ? line[last - 1] : '',
            nextChar: line[start],
            lineStart: atLineStart && last === 0,
        });
        out += line.slice(start, end);
        last = end;
    }
    out += transform(line.slice(last), {
        prevChar: last > 0 ? line[last - 1] : '',
        nextChar: '',
        lineStart: atLineStart && last === 0,
    });
    return out;
}

function normalizeInline(line, options, atLineStart, isTable) {
    let text = line;
    if (options.cleanupMarkup !== 'off') {
        text = cleanupEmpty(text);
    }
    return applyToFreeText(text, atLineStart, (segment, context) => {
        let part = segment;
        if (options.cleanupMarkup === 'full') {
            part = unwrapBraceDelimiters(part, context);
        }
        if (options.collapseSpaces && !isTable) {
            part = part.replace(/[ \t\u00a0]{2,}/g, ' ');
        }
        return part;
    });
}

function listPrefix(marker, options) {
    if (options.listIndent === 'flush') {
        return marker;
    }
    if (options.listIndent === 'space') {
        return ' ' + marker;
    }
    return ' '.repeat(marker.length - 1) + marker;
}

function fenceName(trimmed) {
    const match = trimmed.match(FENCE_RE);
    return match ? match[1] : null;
}

function classify(trimmed, options, previous) {
    if (HR_RE.test(trimmed)) {
        return { kind: 'hr', text: '----' };
    }
    const heading = trimmed.match(HEADING_RE);
    if (heading) {
        return { kind: 'heading', text: `h${heading[1]}. ${normalizeInline(heading[2], options, false, false)}`.trim() };
    }
    if (trimmed.startsWith('|')) {
        return { kind: 'table', text: normalizeInline(trimmed, options, true, true).trim() };
    }
    const list = trimmed.match(LIST_RE);
    if (list) {
        return { kind: 'list', marker: list[1], text: `${listPrefix(list[1], options)} ${normalizeInline(list[2], options, false, false)}`.trimEnd() };
    }
    const quote = trimmed.match(BQ_RE);
    if (quote) {
        return { kind: 'text', text: `bq. ${normalizeInline(quote[1], options, false, false)}`.trim() };
    }
    const kind = previous !== null && (previous.kind === 'list' || previous.kind === 'listcont') ? 'listcont' : 'text';
    return { kind, text: normalizeInline(trimmed, options, true, false).trim() };
}

function needBlank(prev, current, hadBlank, options) {
    if (options.blankLines === 'minimal') {
        return hadBlank;
    }
    if (prev.kind === 'verbatim' || current.kind === 'verbatim') {
        return false;
    }
    if (prev.kind === 'fenceOpen' || current.kind === 'fenceClose') {
        return false;
    }
    if (current.kind === 'fenceOpen' && current.inList) {
        return false;
    }
    if (prev.kind === 'fenceClose' && prev.inList && current.kind === 'list') {
        return hadBlank;
    }
    if (current.kind === 'heading') {
        return true;
    }
    if (prev.kind === 'heading') {
        return options.blankLines === 'full';
    }
    if (current.kind === 'listcont') {
        return false;
    }
    if (prev.kind === 'listcont' && current.kind === 'list') {
        return false;
    }
    if (prev.kind === current.kind) {
        if (current.kind === 'list') {
            return prev.marker[0] !== current.marker[0];
        }
        return current.kind === 'table' ? false : hadBlank;
    }
    return true;
}

/**
 * A block opened right under a list item, with no blank line between them, belongs to
 * that item. A blank line there would end the list in Jira, so none is inserted around
 * the block — only the ones its author wrote are kept.
 */
function continuesList(previous) {
    if (previous === null) {
        return false;
    }
    return previous.kind === 'list' || previous.kind === 'listcont' || (previous.kind === 'fenceClose' && previous.inList);
}

function collect(text, options) {
    const items = [];
    const fences = [];
    let pendingBlank = false;
    const source = text.split(/\r\n|\r|\n/);
    for (const raw of options.cleanupMarkup === 'off' ? source : repairFences(source)) {
        const open = fences.length > 0 ? fences[fences.length - 1] : null;
        const trimmed = raw.trim();
        if (open !== null && VERBATIM_MACROS.has(open.macro)) {
            if (trimmed === `{${open.macro}}`) {
                fences.pop();
                items.push({ kind: 'fenceClose', text: trimmed, blankBefore: false, inList: open.inList });
            } else {
                items.push({ kind: 'verbatim', text: raw, blankBefore: false });
            }
            continue;
        }
        if (trimmed === '') {
            pendingBlank = true;
            continue;
        }
        const previous = items.length > 0 && !pendingBlank ? items[items.length - 1] : null;
        const fence = fenceName(trimmed);
        if (fence !== null) {
            if (open !== null && open.macro === fence) {
                fences.pop();
                items.push({ kind: 'fenceClose', text: trimmed, blankBefore: pendingBlank, inList: open.inList });
            } else {
                const inList = continuesList(previous);
                fences.push({ macro: fence, inList });
                items.push({ kind: 'fenceOpen', text: trimmed, blankBefore: pendingBlank, inList });
            }
            pendingBlank = false;
            continue;
        }
        const item = classify(trimmed, options, previous);
        if (item.text === '') {
            pendingBlank = true;
            continue;
        }
        items.push({ kind: item.kind, marker: item.marker, text: item.text, blankBefore: pendingBlank });
        pendingBlank = false;
    }
    return items;
}

function formatJira(text, options) {
    const settings = { ...DEFAULTS, ...options };
    const items = collect(text, settings);
    const lines = [];
    for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.kind === 'verbatim') {
            lines.push(item.text);
            continue;
        }
        if (lines.length > 0 && needBlank(items[i - 1], item, item.blankBefore, settings)) {
            lines.push('');
        }
        lines.push(item.text);
    }
    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    if (lines.length === 0) {
        return '';
    }
    return lines.join(settings.eol) + (settings.finalNewline ? settings.eol : '');
}

function isInsideVerbatim(text, lineIndex) {
    const fences = [];
    const lines = text.split(/\r\n|\r|\n/);
    for (let i = 0; i < lineIndex && i < lines.length; i += 1) {
        const trimmed = lines[i].trim();
        const open = fences.length > 0 ? fences[fences.length - 1] : null;
        if (open !== null && VERBATIM_MACROS.has(open)) {
            if (trimmed === `{${open}}`) {
                fences.pop();
            }
            continue;
        }
        const fence = fenceName(trimmed);
        if (fence === null) {
            continue;
        }
        if (open === fence) {
            fences.pop();
        } else {
            fences.push(fence);
        }
    }
    return fences.length > 0 && VERBATIM_MACROS.has(fences[fences.length - 1]);
}
