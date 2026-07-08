# Changelog

## 1.0.2

- New icon: the Jira mark with a view (eye) badge.
- README and manifest in English.

## 1.0.1

- The title-bar preview button opens in the current editor group
  (`Alt`+click opens to the side), matching Markdown.

## 1.0.0

- Preview Jira wiki markup (`.jira`) in a webview: `Ctrl+Shift+V` / `Ctrl+K V`
  (`Cmd` on macOS) and a title-bar button.
- Local images `!image.png!` (with `|width=..,height=..`) from the folder next
  to the file; correct resource resolution on remote/WSL.
- Attachments `[^file]` open in the OS file manager.
- Markup: headings, `*bold*` / `{*}..{*}`, `_italic_`, `+underline+`, lists,
  tables `||..||`, `{code}` / `{noformat}`, links, panels, color.
- Live preview updates, font size from `editor.fontSize`, VS Code theme.
