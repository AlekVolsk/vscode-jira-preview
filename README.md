# Jira Markup Preview

A local preview and formatter for **Jira wiki markup** (`.jira`) files — like the built-in Markdown preview. Works fully offline: it parses the file text into HTML and renders it in a webview. **No Jira access, tokens, or network required.**

## Features

- Preview via `Ctrl+Shift+V` / `Cmd+Shift+V` (in the current editor group) and `Ctrl+K V` / `Cmd+K V` (to the side), plus a button in the editor title bar: click opens in the current group, `Alt`+click opens to the side.
- Local images `!image.png!` and `!image.png|width=760,height=400!` — resolved from the folder next to the `.jira` file.
- Attachments `[^file.xlsx]` — a clickable chip that reveals the file in the OS file manager.
- Markup: headings `h1.`–`h6.`, `*bold*` / `{*}bold{*}`, `_italic_`, `+underline+`, lists `*` / `-` / `#`, tables `||…||`, `{code:java}…{code}` blocks, links `[text|url]`, panels `{info}` / `{note}` / `{warning}` / `{tip}`, color `{color:…}`.
- Inline monospace `{{ }}` is left alone: brackets, pipes and exclamation marks inside it stay literal.
- A collapsible **Contents** block at the top: headings as a nested tree, each entry an in-document anchor, followed by the attachments and links the file holds (each section appears only when there is something in it).
- Live preview updates as you edit the source.
- Font size follows the editor setting (`editor.fontSize`); styles adapt to the VS Code light/dark theme.
- **Format Document** (`Shift+Alt+F`), Format Selection, format on save and format on paste — see below.

## Syntax highlighting

`.jira` files are highlighted in the editor: headings, emphasis in both its bare and braced forms, monospace, lists, tables, links, attachments, images, macros and escapes. The body of a `{code}` block stays unhighlighted as raw text, and when the fence names a language VS Code ships a grammar for — `sql`, `java`, `javascript`, `json`, `php`, `python`, `xml`, `html`, `css`, `bash`, `yaml`, `go`, `ruby`, `c`, `cpp`, `groovy`, `scala` — the body is highlighted as that language.

The preview colours those blocks too, from the same list of languages. It carries no script — the Content-Security-Policy admits none — so the colouring is done in the extension and reaches the webview as finished markup, and the palette follows the editor's light or dark theme.

## Formatting

Markup pasted out of Jira arrives with cosmetic noise: escaped constructs that leak their braces, missing blank lines, list markers at random indents, stray spaces. **Format Document** (`Shift+Alt+F`) cleans that up; Format Selection, `editor.formatOnSave` and `editor.formatOnPaste` work too.

What it does:

- **Blank lines.** One before and after every heading, and around lists, tables, `{code}` / `{noformat}` / panel blocks. Runs of blank lines collapse into one; blank lines inside a list are removed, because in Jira they break the list.
- **Lists.** One space after the marker; markers indented by nesting depth, so a level-2 item sits one column in. Adjacent lists of different types (`*` and `#`) are separated.
- **Markup cleanup.** `{}` is Jira's empty separator, and its own export scatters it around: `{{{}table_name{}}}` becomes `{{table_name}}`. Constructs with nothing in them (`{{}}`, `{color:red}{color}`, `*__*`) are dropped, and `{*}text{*}` is unwrapped to `*text*` wherever Jira renders both the same — never where a neighbouring character would swallow the bare delimiter, and never at the start of a line, where `*` would read as a list marker.
- **Trimming.** Trailing whitespace, blank lines at the ends of the file, and runs of spaces between words (a non-breaking space followed by a plain one included).
- **Broken code fences.** When a `{code:lang}` names a language Jira cannot highlight, Jira rewrites the fence to `{code:java}` and pastes `Unable to find source-code formatter for language: …` into the block, welded to the first real line. That notice is cut and the fence becomes `{code:none}`. A fence carrying a parameter is an opening one — Jira writes closing fences bare — so meeting one while a block is still open means the closing fence was lost: the stale opening fence is dropped and its body returns to being text. A fence with a language that has no closing fence of its own ahead was meant as a closing one and is written bare. An unclosed block is closed at the end of the file. Empty blocks are left in the source and hidden by the preview instead.

Left untouched: everything inside `{code}` and `{noformat}`, spacing inside inline monospace `{{ }}` and table cells, escaped braces `\{`, and a lone non-breaking space.

Settings (`jiraFormat.blankLines`, `jiraFormat.listIndent`, `jiraFormat.cleanupMarkup`, `jiraFormat.collapseSpaces`) turn each of those down or off.

## Installation

```bash
code --install-extension jira-preview.vsix
```

Or in VS Code: **Extensions** panel → `...` menu → **Install from VSIX…**. After installing, reload the window (**Developer: Reload Window**).

## Usage

Open any `.jira` file and press `Ctrl+Shift+V` (`Cmd+Shift+V` on macOS).

Images (`!image.png!`) and attachments (`[^file]`) are resolved relative to the folder of the open file — keep them next to the `.jira` file, which is how it naturally works out when the markup and its attachments are saved from Jira into one folder.

Non-image files open in the OS file manager.

## License

MIT. The markup parser is based on `markupParser` from the `denco.confluence-markup` extension (MIT, © Denis Baumgärtner).
