'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.parseMarkup = parseMarkup;

const vscode = require('vscode');
const path = require('path');
const hljs = require('../lib/hljs/core');

const HLJS_LANGUAGES = [
    'sql', 'java', 'javascript', 'json', 'php', 'python', 'xml', 'css',
    'bash', 'yaml', 'go', 'ruby', 'c', 'cpp', 'groovy', 'scala',
];
for (const language of HLJS_LANGUAGES) {
    hljs.registerLanguage(language, require(`../lib/hljs/languages/${language}`));
}

let currentWebview = null;

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Inline markup is applied to text only: HTML tags built earlier in the pass carry
 * `_` and `-` inside hrefs, filenames and titles, and `<code>` holds text that is
 * quoted verbatim.
 */
function replaceOutsideHtml(text, replacer) {
    const re = /<code>[\s\S]*?<\/code>|<[^>]*>/g;
    let out = '';
    let last = 0;
    let match;
    while ((match = re.exec(text)) !== null) {
        out += replacer(text.slice(last, match.index)) + match[0];
        last = match.index + match[0].length;
    }
    return out + replacer(text.slice(last));
}

function resolveResource(searchUri, link) {
    if (/^(https?|ftps?):\/\//i.test(link)) {
        return link;
    }
    const abs = path.isAbsolute(link)
        ? link
        : path.join(path.dirname(searchUri.fsPath), link);
    return currentWebview.asWebviewUri(vscode.Uri.file(abs)).toString();
}

function tocText(html) {
    return escapeHtml(html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
}

function renderTocTree(entries) {
    const parts = [];
    const open = [];
    for (const entry of entries) {
        while (open.length > 0 && entry.level < open[open.length - 1]) {
            parts.push('</li></ul>');
            open.pop();
        }
        if (open.length > 0 && entry.level === open[open.length - 1]) {
            parts.push('</li>');
        } else {
            parts.push('<ul>');
            open.push(entry.level);
        }
        parts.push(`<li><a href="#${entry.id}">${entry.text}</a>`);
    }
    while (open.length > 0) {
        parts.push('</li></ul>');
        open.pop();
    }
    return parts.join('');
}

function renderTocFlat(title, items) {
    if (items.length === 0) {
        return '';
    }
    const rows = items.map((item) => `<li><a href="${item.href}">${item.text}</a></li>`).join('');
    return `<div class="toc-section">${title}</div><ul class="toc-flat">${rows}</ul>`;
}

function collect(html, re, build) {
    const items = [];
    const seen = new Set();
    let match;
    re.lastIndex = 0;
    while ((match = re.exec(html)) !== null) {
        const item = build(match);
        if (!seen.has(item.href)) {
            seen.add(item.href);
            items.push(item);
        }
    }
    return items;
}

/**
 * The table of contents is built from the finished HTML rather than while lines are
 * being parsed: by then a heading holds its inline markup, and headings that only
 * look like headings — the ones inside `{code}` — are already escaped and invisible
 * to this pass.
 */
function buildToc(html) {
    const headings = [];
    const anchored = html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (whole, level, inner) => {
        const id = `toc-${headings.length + 1}`;
        headings.push({ level: Number(level), id, text: tocText(inner) });
        return `<h${level} id="${id}">${inner}</h${level}>`;
    });
    const attachments = collect(
        anchored,
        /<a class="attachment" href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
        (match) => ({ href: match[1], text: tocText(match[2]) })
    );
    const links = collect(
        anchored,
        /<a href='([^']*)'>([\s\S]*?)<\/a>/g,
        (match) => ({ href: match[1], text: tocText(match[2]) })
    );
    if (headings.length === 0 && attachments.length === 0 && links.length === 0) {
        return anchored;
    }
    const tree = headings.length === 0 ? '' : `<div class="toc-tree">${renderTocTree(headings)}</div>`;
    const extras = renderTocFlat('Attachments', attachments) + renderTocFlat('Links', links);
    return `<details class="toc" open><summary>Contents</summary>${tree}${extras}</details>${anchored}`;
}

/**
 * The preview carries no script — the CSP admits none — so a code block is coloured
 * here and reaches the webview as finished markup. The body arrives with `<` already
 * escaped; highlight.js needs the source, and escapes what it returns itself.
 */
function highlightCodeBlocks(html) {
    return html.replace(/<pre><code class="language-([^"]+)">([\s\S]*?)<\/code><\/pre>/g, (whole, language, body) => {
        if (hljs.getLanguage(language) === undefined) {
            return whole;
        }
        const source = body.replace(/&lt;/g, '<');
        const coloured = hljs.highlight(source, { language, ignoreIllegals: true }).value;
        return `<pre><code class="hljs language-${language}">${coloured}</code></pre>`;
    });
}

/**
 * An empty code block is a grey frame around nothing — an export artefact rather
 * than content. It is hidden here instead of being cut from the source, so the
 * file keeps what its author wrote.
 */
function dropEmptyCodeBlocks(html) {
    return html.replace(
        /<div class="code-block">(?:<span class="code-title">[^<]*<\/span>)?<pre><code[^>]*>\s*<\/code><\/pre><\/div>/g,
        ''
    );
}

function closeLists(listArr) {
    return listArr.length === 0 ? '' : '</' + listArr.slice().reverse().join('></li></') + '>';
}

/**
 * A panel or a quote opened under a list item belongs to that item, and its body keeps
 * a list state of its own: a blank line inside the block ends only the lists started
 * in it, never the one around it.
 */
function parseMarkup(sourceUri, sourceText, webview) {
    currentWebview = webview;
    let result = '';
    let listTag = '';
    let listStyle = '';
    let codeTagFlag = false;
    let panelTagFlag = false;
    let quoteTagFlag = false;
    let tableFlag = false;
    let listFlag = false;
    let listArr = [];
    const outerLists = [];
    const enterBlock = () => {
        outerLists.push({ listArr, listFlag });
        listArr = [];
        listFlag = false;
    };
    const leaveBlock = (closingTag) => {
        const html = closeLists(listArr) + closingTag;
        ({ listArr, listFlag } = outerLists.pop() ?? { listArr: [], listFlag: false });
        return listFlag ? `${html}</li>` : html;
    };

    for (const entry of sourceText.split(/\r?\n|\r/gi)) {
        let tag = entry;
        if (!codeTagFlag) {
            tag = tag.trim();
        }
        if (tag.length === 0 && !listFlag && !tableFlag && !codeTagFlag) {
            continue;
        }
        if (!codeTagFlag) {
            tag = tag.replace(/\\}/g, '&rbrace;').replace(/\{{2}(.*?)\}{2}/g, '<code>$1</code>');
            tag = replaceOutsideHtml(tag, (text) => text.replace(/\{([*+])\}/g, '$1'));

            tag = tag.replace(/h(\d+)\.\s([^\r\n]+)/g, '<h$1>$2</h$1>');
            tag = tag.replace(/\?{2}(.*)\?{2}/g, '<cite>$1</cite>');
            tag = tag.replace(/bq. (.*)/g, '<blockquote><p>$1</p></blockquote>');
            tag = tag.replace(/\{quote\}(.*)\{quote\}/g, '<blockquote><p>$1</p></blockquote>');
            tag = replaceOutsideHtml(tag, (text) => text
                .replace(/\{color:([^}]+)\}/g, "<span style='color:$1;'>")
                .replace(/\{color\}/g, '</span>')
                .replace(/\\\\/gi, '<br>'));

            const attach_re = /\[\^([^\]]+)\]/g;
            tag = replaceOutsideHtml(tag, (text) => text.replace(attach_re, function (m0, fname) {
                const name = fname.trim();
                const abs = path.isAbsolute(name)
                    ? name
                    : path.join(path.dirname(sourceUri.fsPath), name);
                const arg = encodeURIComponent(JSON.stringify([abs]));
                return `<a class="attachment" href="command:jiraPreview.openAttachment?${arg}" title="${escapeHtml(abs)}">📎&nbsp;${escapeHtml(name)}</a>`;
            }));

            const re_href = /\[([^||\]]*)\|?([^[||]*)?\]/g;
            tag = replaceOutsideHtml(tag, (text) => text.replace(re_href, function (m0, m1, m2) {
                if (m1 !== undefined && (m1.startsWith(' ') || m1.endsWith('\\'))) {
                    return m0.replace(/\\/g, '').replace(/\|/g, '&vert;');
                }
                if (m2 !== undefined && m2.endsWith('\\')) {
                    return m0.replace(/\\/g, '').replace(/\|/g, '&vert;');
                }
                if (m2 != undefined) {
                    return "<a href='" + m2 + "'>" + m1 + '</a>';
                }
                return "<a href='" + m1 + "'>" + m1 + '</a>';
            }));

            const img_re = /!([^|]*)\|?(.*)!/;
            tag = replaceOutsideHtml(tag, (text) => text.replace(img_re, function (m0, link, attrs) {
                let imgAttr = '';
                if (attrs.length != 0) {
                    imgAttr = attrs.replace(/=/gi, '="').replace(/,/gi, '" ') + '"';
                }
                const imageLink = resolveResource(sourceUri, link);
                const imgAlt = link.substring(link.lastIndexOf('/') + 1);
                return `<img alt="${escapeHtml(imgAlt)}" src="${imageLink}" ${imgAttr}>`;
            }));

            tag = replaceOutsideHtml(tag, (text) => text
                .replace(/\+([^+]*)\+/g, '<u>$1</u>')
                .replace(/\^([^^]*)\^/g, '<sup>$1</sup>')
                .replace(/~([^~]*)~/g, '<sub>$1</sub>'));

            const tab_th_re = /\s*[^{]*\|{2}[^}]*$/gi;
            const tab_td_re = /\s*[^{]*\|[^}]*$/gi;
            if (tag.match(tab_th_re) || tag.match(tab_td_re)) {
                let closeTableCell = '';
                if (tag.match(tab_th_re)) {
                    tag = tag.replace(/^\|{2,}/, '||');
                    tag = tag.replace(/^\|{2}/, '<th>');
                    tag = tag.replace(/\|{2}$/, '</th>');
                    tag = tag.replace(/\|{2}/gi, '</th><th>');
                    tag = tag.replace(/\|/, '</th><td>');
                    closeTableCell = '</th>';
                }
                if (tag.match(tab_td_re)) {
                    tag = tag.replace(/^\|/, '<td>');
                    tag = tag.replace(/\|$/, '</td>');
                    tag = tag.replace(/\|/gi, '</td><td>');
                    closeTableCell = '</td>';
                }
                if (!tag.endsWith('</th>') && !tag.endsWith('</td>')) {
                    tag += closeTableCell;
                }
                tag = '<tr>' + tag + '</tr>';
                if (tableFlag == false) {
                    tag = '<div><table><tbody>' + tag;
                }
                tableFlag = true;
            }
        }

        tag = tag.replace(/\{(noformat|code)[^}]*\}(.*)\{(noformat|code)\}/, function (m0, m1, m2) {
            return `<div class="code-block"><pre><code>${m2.replace(/</gi, '&lt;')}</code></pre></div>`;
        });
        const code_re = /\{(noformat|code)([^}]*)\}/;
        const code_match = tag.match(code_re);
        if (code_match) {
            if (!codeTagFlag) {
                tag = tag.replace(code_re, function (m0, m1, m2) {
                    let title = '';
                    let language = '';
                    m2.split(/[|:]/).forEach((el) => {
                        const elems = el.split('=');
                        if (elems[0] === 'title') {
                            title = `<span class="code-title">${elems[1]}</span>`;
                        } else if (elems[0] === 'language' && elems[1] !== undefined) {
                            language = elems[1];
                        } else if (elems.length === 1 && elems[0] !== '') {
                            language = elems[0];
                        }
                    });
                    const attr = language === '' ? '' : ` class="language-${escapeHtml(language)}"`;
                    return `<div class="code-block">${title}<pre><code${attr}>`;
                });
                codeTagFlag = true;
            } else {
                tag = '</code></pre></div>';
                if (listFlag) {
                    tag = `${tag}</li>`;
                }
                codeTagFlag = false;
            }
        }
        if (codeTagFlag && !code_match) {
            tag = tag.replace(/</gi, '&lt;');
        }

        const panel_re = /\{(panel|tip|info|note|warning)(.*)}/;
        if (!codeTagFlag && tag.match(panel_re)) {
            if (!panelTagFlag) {
                let panelStyle = '';
                let titleStyle = '';
                let iconlessFlag = '';
                tag = tag.replace(panel_re, function (m0, m1, m2) {
                    const panelClass = m1;
                    let res = `<div class="${panelClass} ${panelClass}-body" $panelStyle>`;
                    const splits = m2.split(/[|:]/);
                    splits.forEach((el) => {
                        const elems = el.split('=');
                        switch (elems[0]) {
                            case 'title':
                                res = `<div><div class="${panelClass} ${panelClass}-title$iconlessFlag" $titleStyle>${elems[1]}</div>${res}`;
                                break;
                            case 'titleBGColor':
                                titleStyle += `background-color: ${elems[1]}; `;
                                break;
                            case 'bgColor':
                                panelStyle += `background-color: ${elems[1]}; `;
                                break;
                            case 'borderStyle':
                                panelStyle += `border-style: ${elems[1]}; `;
                                titleStyle += `border-style: ${elems[1]}; border-bottom:none; `;
                                break;
                            case 'borderColor':
                                panelStyle += `border-color: ${elems[1]}; `;
                                titleStyle += `border-color: ${elems[1]}; `;
                                break;
                            case 'borderWidth':
                                panelStyle += `border-width: ${elems[1]}; `;
                                titleStyle += `border-width: ${elems[1]}; `;
                                break;
                            case 'icon':
                                iconlessFlag = elems[1] === 'false' ? '-iconless' : '';
                                break;
                        }
                    });
                    if (titleStyle.length > 0) {
                        titleStyle = `style='${titleStyle.trim()}'`;
                    }
                    if (panelStyle.length > 0) {
                        panelStyle = `style='${panelStyle.trim()}'`;
                    }
                    if (panelClass != 'panel') {
                        panelStyle = '';
                        titleStyle = '';
                        if (!res.match(`${panelClass}-title`)) {
                            res = `<div><div class="${panelClass} ${panelClass}-title$iconlessFlag"></div>${res}`;
                        }
                    } else {
                        if (!res.match(`${panelClass}-title`)) {
                            res = `<div>${res}`;
                        }
                    }
                    res = res.replace('$iconlessFlag', iconlessFlag);
                    res = res.replace('$titleStyle', titleStyle);
                    res = res.replace('$panelStyle', panelStyle);
                    return res;
                });
                enterBlock();
                panelTagFlag = true;
            } else {
                tag = leaveBlock('</div></div>');
                panelTagFlag = false;
            }
        }

        if (!codeTagFlag) {
            const quoteFence = quoteTagFlag ? tag.match(/^(.*)\{quote\}$/) : tag.match(/^\{quote\}(.*)$/);
            if (quoteFence) {
                const text = quoteFence[1].trim();
                const body = text === '' ? '' : `<div>${text}</div>`;
                if (quoteTagFlag) {
                    tag = leaveBlock(`${body}</blockquote>`);
                } else {
                    enterBlock();
                    tag = `<blockquote>${body}`;
                }
                quoteTagFlag = !quoteTagFlag;
            }
        }

        const li_re = /^([-*#]+)\s(.*)/;
        const li_match = tag.match(li_re);
        if (li_match) {
            listFlag = true;
            listStyle = '';
            tag = '';
            if (li_match[1].match(/#$/)) {
                listTag = 'ol';
                if ((li_match[1].length + (li_match[1].match(/[-*]/g) || []).length) % 3 === 1) {
                    listStyle = ' class="initial"';
                }
            }
            if (li_match[1].match(/[-*]$/)) {
                listTag = 'ul';
            }
            if (li_match[1].match(/-$/)) {
                listStyle = ' class="alternate"';
            }
            if (li_match[1].length > listArr.length) {
                tag = '<' + listTag + listStyle + '>';
                listArr.push(listTag);
            }
            if (li_match[1].length < listArr.length) {
                tag = '</' + listArr.slice(li_match[1].length, listArr.length).reverse().join('></') + '>';
                listArr = listArr.slice(0, li_match[1].length);
            }
            tag += '<li>' + li_match[2];
        }
        if (tag.length === 0 && listArr.length > 0 && !codeTagFlag) {
            tag = closeLists(listArr);
            listArr = [];
            listFlag = false;
        }
        if (!codeTagFlag && !listFlag) {
            tag = tag.replace(/-{4,}/gi, '<hr>');
            tag = tag.replace(/-{3}/gi, '&mdash;');
            tag = tag.replace(/-{2}/gi, '&ndash;');
        }
        if (!codeTagFlag) {
            tag = replaceOutsideHtml(tag, (text) => text
                .replace(/\*([^*]*)\*/g, '<strong>$1</strong>')
                .replace(/\{_\}(.*?)\{_\}/g, '<i>$1</i>')
                .replace(/\{_\}([^_]*)_/g, '<i>$1</i>')
                .replace(/\B-((\([^)]*\)|{[^}]*}|\[[^]]+\]){0,3})(\S.*?\S|\S)-\B/g, " <span style='text-decoration: line-through;'>$3</span> ")
                .replace(/(?:\b)_((\([^)]*\)|{[^}]*}|\[[^]]+\]){0,3})(\S.*?\S|\S)_(?:\b)/g, '<i>$3</i>'));
        }
        if (!tag.match(/<\/tr>$/) && tableFlag) {
            tag = '</tbody></table></div>' + tag;
            tableFlag = false;
        }
        if (!tag.match(/<\/?code|<\/?pre>|<\/?table>|<\/?t[r|d|h]|<\/?li|<\/?ul|<\/?ol|<\/?div|<\/?blockquote/) && !codeTagFlag) {
            tag = `<div>${tag}</div>`;
        } else if (codeTagFlag && tag.indexOf('<') < 0) {
            tag = `${tag}\n`;
        }
        result += `${tag}`;
    }
    return buildToc(highlightCodeBlocks(dropEmptyCodeBlocks(result)));
}
