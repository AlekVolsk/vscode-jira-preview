# Jira Markup Preview

A local preview for **Jira wiki markup** (`.jira`) files — like the built-in Markdown preview. Works fully offline: it parses the file text into HTML and renders it in a webview. **No Jira access, tokens, or network required.**

## Features

- Preview via `Ctrl+Shift+V` / `Cmd+Shift+V` (in the current editor group) and `Ctrl+K V` / `Cmd+K V` (to the side), plus a button in the editor title bar: click opens in the current group, `Alt`+click opens to the side.
- Local images `!image.png!` and `!image.png|width=760,height=400!` — resolved from the folder next to the `.jira` file.
- Attachments `[^file.xlsx]` — a clickable chip that reveals the file in the OS file manager.
- Markup: headings `h1.`–`h6.`, `*bold*` / `{*}bold{*}`, `_italic_`, `+underline+`, lists `*` / `-` / `#`, tables `||…||`, `{code:java}…{code}` blocks, links `[text|url]`, panels `{info}` / `{note}` / `{warning}` / `{tip}`, color `{color:…}`.
- Live preview updates as you edit the source.
- Font size follows the editor setting (`editor.fontSize`); styles adapt to the VS Code light/dark theme.

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
