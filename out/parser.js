'use strict';
// Парсер Jira/Confluence wiki markup -> HTML.
// В основе — markupParser из denco.confluence-markup (MIT, (c) Denis Baumgärtner),
// адаптирован для корректного резолва локальных ресурсов в webview на remote/WSL
// (webview.asWebviewUri вместо хардкода authority) + правки Jira-специфики
// (вложения [^file], форс-жирный {*}).
Object.defineProperty(exports, '__esModule', { value: true });
exports.parseMarkup = parseMarkup;

const vscode = require('vscode');
const path = require('path');

// Устанавливается на каждый вызов parseMarkup: нужен для asWebviewUri.
let currentWebview = null;

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Абсолютный/относительный локальный путь -> webview-URI; внешние ссылки — как есть.
function resolveResource(searchUri, link) {
    if (/^(https?|ftps?):\/\//i.test(link)) {
        return link;
    }
    const abs = path.isAbsolute(link)
        ? link
        : path.join(path.dirname(searchUri.fsPath), link);
    return currentWebview.asWebviewUri(vscode.Uri.file(abs)).toString();
}

function parseMarkup(sourceUri, sourceText, webview) {
    currentWebview = webview;
    let result = '';
    let listTag = '';
    let listStyle = '';
    let codeTagFlag = false;
    let panelTagFlag = false;
    let tableFlag = false;
    let listFlag = false;
    let listArr = [];
    for (const entry of sourceText.split(/\r?\n|\r/gi)) {
        let tag = entry;
        if (!codeTagFlag) {
            tag = tag.trim();
        }
        let html_tag = false;
        if (tag.length === 0 && !listFlag && !tableFlag && !codeTagFlag) {
            continue;
        }
        if (!codeTagFlag) {
            // Форс-жирный/курсив Jira: {*}text{*} -> *text*, {+}..{+} и т.п.
            tag = tag.replace(/\{([*+])\}/g, '$1');

            tag = tag.replace(/h(\d+)\.\s([^\r?\n]+)/g, '<h$1>$2</h$1>');
            tag = tag.replace(/\+([^+]*)\+/g, '<u>$1</u>');
            tag = tag.replace(/\^([^^]*)\^/g, '<sup>$1</sup>');
            tag = tag.replace(/~([^~]*)~/g, '<sub>$1</sub>');
            tag = tag.replace(/\\}/g, '&rbrace;').replace(/\{{2}(.*?)\}{2}/g, '<code>$1</code>');
            tag = tag.replace(/\?{2}(.*)\?{2}/g, '<cite>$1</cite>');
            tag = tag.replace(/\{color:([^}]+)\}/g, "<span style='color:$1;'>").replace(/\{color\}/g, '</span>');
            tag = tag.replace(/bq. (.*)/g, '<blockquote><p>$1</p></blockquote>');
            tag = tag.replace(/\{quote\}(.*)\{quote\}/g, '<blockquote><p>$1</p></blockquote>');
            tag = tag.replace(/\\\\/gi, '<br>');

            // Вложения Jira: [^имя-файла] -> ссылка, открывающая файл в ОС.
            const attach_re = /\[\^([^\]]+)\]/g;
            if (tag.match(attach_re)) {
                tag = tag.replace(attach_re, function (m0, fname) {
                    const name = fname.trim();
                    const abs = path.isAbsolute(name)
                        ? name
                        : path.join(path.dirname(sourceUri.fsPath), name);
                    const arg = encodeURIComponent(JSON.stringify([abs]));
                    return `<a class="attachment" href="command:jiraPreview.openAttachment?${arg}" title="${escapeHtml(abs)}">📎&nbsp;${escapeHtml(name)}</a>`;
                });
                html_tag = true;
            }

            // Ссылки: [text|url] и [url]
            const re_href = /\[([^||\]]*)\|?([^[||]*)?\]/g;
            if (tag.match(re_href)) {
                tag = tag.replace(re_href, function (m0, m1, m2) {
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
                });
                html_tag = true;
            }

            // Картинки: !file! и !file|width=..,height=..!
            const img_re = /!([^|]*)\|?(.*)!/;
            const img_match = tag.match(img_re);
            if (img_match) {
                let imgAttr = '';
                if (img_match[2].length != 0) {
                    imgAttr = img_match[2].replace(/=/gi, '="').replace(/,/gi, '" ') + '"';
                }
                const imageLink = resolveResource(sourceUri, img_match[1]);
                const imgAlt = img_match[1].substring(img_match[1].lastIndexOf('/') + 1);
                tag = `<img alt="${escapeHtml(imgAlt)}" src="${imageLink}" ${imgAttr}>`;
                html_tag = true;
            }

            // Таблицы
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

        // Однострочные {code}/{noformat}
        tag = tag.replace(/\{(noformat|code)[^}]*\}(.*)\{(noformat|code)\}/, function (m0, m1, m2) {
            return `<div class="code-block"><pre><code>${m2.replace(/</gi, '&lt;')}</code></pre></div>`;
        });
        // Многострочные {code}/{noformat}
        const code_re = /\{(noformat|code)([^}]*)\}/;
        const code_match = tag.match(code_re);
        if (code_match) {
            if (!codeTagFlag) {
                tag = tag.replace(code_re, function (m0, m1, m2) {
                    let res = '<pre><code>';
                    const splits = m2.split(/[|:]/);
                    splits.forEach((el) => {
                        const elems = el.split('=');
                        if (elems[0] === 'title') {
                            res = `<span class="code-title">${elems[1]}</span>${res}`;
                        }
                    });
                    res = `<div class="code-block">${res.trim()}`;
                    return res;
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

        // Панели: {panel}/{info}/{note}/{warning}/{tip}
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
                panelTagFlag = true;
            } else {
                tag = '</div></div>';
                if (listFlag) {
                    tag = `${tag}</li>`;
                }
                panelTagFlag = false;
            }
        }

        // Списки: * - #
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
        if (tag.length === 0 && listArr.length > 0) {
            tag = '</' + listArr.reverse().join('></li></') + '>';
            listArr = [];
            listFlag = false;
        }
        if (!codeTagFlag && !listFlag) {
            tag = tag.replace(/-{4,}/gi, '<hr>');
            tag = tag.replace(/-{3}/gi, '&mdash;');
            tag = tag.replace(/-{2}/gi, '&ndash;');
        }
        // Жирный
        tag = tag.replace(/\*([^*]*)\*/g, '<strong>$1</strong>');
        // Курсив/зачёркнутый (не трогаем html-строки, картинки, списки)
        if (!html_tag && !tag.match('<img') && !listFlag) {
            tag = tag.replace(/{_}([^_]*)_/g, '<i>$1</i>');
            tag = tag.replace(/\B-((\([^)]*\)|{[^}]*}|\[[^]]+\]){0,3})(\S.*?\S|\S)-\B/g, " <span style='text-decoration: line-through;'>$3</span> ");
            tag = tag.replace(/(?:\b)_((\([^)]*\)|{[^}]*}|\[[^]]+\]){0,3})(\S.*?\S|\S)_(?:\b)/g, '<i>$3</i>');
        }
        // Закрыть таблицу
        if (!tag.match(/<\/tr>$/) && tableFlag) {
            tag = '</tbody></table></div>' + tag;
            tableFlag = false;
        }
        if (!tag.match(/<\/?code|<\/?pre>|<\/?table>|<\/?t[r|d|h]|<\/?li|<\/?ul|<\/?ol|<\/?div/) && !codeTagFlag) {
            tag = `<div>${tag}</div>`;
        } else if (codeTagFlag && tag.indexOf('<') < 0) {
            tag = `${tag}\n`;
        }
        result += `${tag}`;
    }
    return result;
}
