'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.activate = activate;
exports.deactivate = deactivate;

const vscode = require('vscode');
const path = require('path');
const { parseMarkup } = require('./parser');

// Корни, из которых webview разрешено грузить локальные ресурсы:
// папка самого файла (там лежат картинки/вложения), корень воркспейса и папка расширения (css).
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
    // documentUri.toString() -> WebviewPanel: одна превьюшка на файл.
    const panels = new Map();

    function openPreview(column) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Откройте .jira-файл, чтобы показать превью.');
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
            // Показать файл в системном файловом менеджере (Excel-вложения и т.п.).
            vscode.commands.executeCommand('revealFileInOS', uri);
        })
    );

    // Живое обновление превью при правке исходника.
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            const panel = panels.get(e.document.uri.toString());
            if (panel) {
                panel.webview.html = renderHtml(panel.webview, context, e.document);
            }
        })
    );
}

function deactivate() {}
