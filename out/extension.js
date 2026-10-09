'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.activate = activate;
exports.deactivate = deactivate;

const vscode = require('vscode');
const path = require('path');
const { parseMarkup } = require('./parser');
const { formatJira, isInsideVerbatim } = require('./formatter');

function formatterOptions(document) {
    const config = vscode.workspace.getConfiguration('jiraFormat', document.uri);
    return {
        blankLines: config.get('blankLines'),
        listIndent: config.get('listIndent'),
        cleanupMarkup: config.get('cleanupMarkup'),
        collapseSpaces: config.get('collapseSpaces'),
        eol: document.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n',
    };
}

const formattingProvider = {
    provideDocumentFormattingEdits(document) {
        const source = document.getText();
        const formatted = formatJira(source, formatterOptions(document));
        if (formatted === source) {
            return [];
        }
        const whole = new vscode.Range(document.positionAt(0), document.positionAt(source.length));
        return [vscode.TextEdit.replace(whole, formatted)];
    },
};

const rangeFormattingProvider = {
    provideDocumentRangeFormattingEdits(document, range) {
        const firstLine = range.start.line;
        const lastLine = range.end.character === 0 && range.end.line > firstLine ? range.end.line - 1 : range.end.line;
        if (isInsideVerbatim(document.getText(), firstLine)) {
            return [];
        }
        const lines = new vscode.Range(firstLine, 0, lastLine, document.lineAt(lastLine).text.length);
        const source = document.getText(lines);
        const formatted = formatJira(source, { ...formatterOptions(document), finalNewline: false });
        if (formatted === source) {
            return [];
        }
        return [vscode.TextEdit.replace(lines, formatted)];
    },
};

function resourceRoots(context, docUri) {
    const roots = [vscode.Uri.file(path.dirname(docUri.fsPath)), context.extensionUri];
    const ws = vscode.workspace.getWorkspaceFolder(docUri);
    if (ws) {
        roots.push(ws.uri);
    }
    return roots;
}

function renderHtml(webview, context, document) {
    const body = parseMarkup(document.uri, document.getText(), webview);
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'jira.css'));
    const csp = [
        "default-src 'none'",
        `img-src ${webview.cspSource} https: data:`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `font-src ${webview.cspSource}`,
    ].join('; ');
    const title = 'Preview ' + path.basename(document.uri.fsPath);
    return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <link rel="stylesheet" href="${cssUri}">
    <title>${title}</title>
</head>
<body>
${body}
</body>
</html>`;
}

function activate(context) {
    const panels = new Map();

    function openPreview(column) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Open .jira file for preview');
            return;
        }
        const document = editor.document;
        const key = document.uri.toString();
        let panel = panels.get(key);
        if (panel) {
            panel.reveal(column);
        } else {
            panel = vscode.window.createWebviewPanel(
                'jiraPreview',
                'Preview ' + path.basename(document.uri.fsPath),
                column,
                {
                    enableCommandUris: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: resourceRoots(context, document.uri),
                }
            );
            panels.set(key, panel);
            panel.onDidDispose(() => panels.delete(key), null, context.subscriptions);
        }
        panel.webview.html = renderHtml(panel.webview, context, document);
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('jiraPreview.showPreview', () => openPreview(vscode.ViewColumn.Active)),
        vscode.commands.registerCommand('jiraPreview.showPreviewToSide', () => openPreview(vscode.ViewColumn.Two)),
        vscode.commands.registerCommand('jiraPreview.openAttachment', (fsPath) => {
            const uri = vscode.Uri.file(fsPath);
            vscode.commands.executeCommand('revealFileInOS', uri);
        })
    );

    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider('jira', formattingProvider),
        vscode.languages.registerDocumentRangeFormattingEditProvider('jira', rangeFormattingProvider)
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            const panel = panels.get(e.document.uri.toString());
            if (panel) {
                panel.webview.html = renderHtml(panel.webview, context, e.document);
            }
        })
    );
}

function deactivate() { }
