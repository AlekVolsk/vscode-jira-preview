# Changelog

## 1.1.2 — 2026-10-27

- Regression in 1.1.1 fixed: the extension activates when a `.jira` file is opened again, so the formatter is available without opening the preview first.
- A link or an attachment whose name holds paired square brackets (`[^ФТ_ред1 [0od1gH].pdf]`) is no longer cut at the first `]` in the preview, the formatter and the editor highlighting. An attachment name is shown as is, without italic or other inline markup.

## 1.1.1 — 2026-10-26

- License changed from MIT to BSD 3-Clause.
- The README states that the extension is developed and maintained with the help of AI tools.
- The sources are type-checked in strict mode; no change in behaviour.

## 1.1.0 — 2026-10-09

- Formatter for `.jira`: **Format Document**, Format Selection, format on save and format on paste.
- Blank lines around headings, lists, tables and `{code}` / panel blocks; runs of blank lines collapse into one, blank lines inside a list are removed, adjacent lists of different types (`*` and `#`) are separated. A block written right under a list item stays attached to it: no blank line is inserted around it.
- List markers indented by nesting depth, with one space after the marker.
- Markup cleanup: `{{{}name{}}}` back to `{{name}}`, empty constructs dropped, `{*}text{*}` unwrapped to `*text*` where Jira renders both the same.
- Trimming: trailing whitespace, blank lines at the ends of the file, runs of spaces between words.
- `{code}` and `{noformat}` bodies are left as they are; Format Selection does nothing when the selection starts inside one.
- Settings `jiraFormat.blankLines`, `jiraFormat.listIndent`, `jiraFormat.cleanupMarkup`, `jiraFormat.collapseSpaces`.
- Preview: italic and strikethrough render inside lists, in the line following a list, and in lines that carry a link or an attachment; `{_}text{_}` no longer leaks a brace. Inline markup no longer runs inside `{code}` / `{noformat}`, and no longer spans a table cell boundary.
- Broken code fences are repaired: Jira's `Unable to find source-code formatter for language: …` notice is cut from the block, the fence becomes `{code:none}`, an opening fence left unclosed before the next one is dropped, a closing fence loses its language, and an unclosed block is closed at the end of the file.
- Preview: an empty code block is no longer drawn as an empty grey frame.
- Preview: links, attachments and images no longer run inside inline monospace, so `{{sample.results[field_id]}}` keeps its brackets; text sharing a line with an image is no longer swallowed.
- Preview: a multi-line `{quote}` block renders as a quote, and a blank line inside a panel, quote or code block under a list item no longer ends the list around it.
- Syntax highlighting for `.jira` in the editor, with the body of a `{code:lang}` block highlighted as that language where VS Code ships a grammar for it.
- Preview: `{code:lang}` blocks are syntax-coloured as well, in the extension rather than the webview, so the Content-Security-Policy still admits no script.
- Preview: a collapsible **Contents** block at the top — headings as a nested tree linking to in-document anchors, then the file's attachments and links. It sticks to the top while the document scrolls, and scrolls inside itself past 60% of the viewport height.
- Preview: `{{*}}` and `{{+}}` render as code — unwrapping `{*}` used to run first and ate the inner braces.
- Preview: superscript, subscript and underline run after attachments and links, so two `[^file]` attachments on one line no longer merge into a `<sup>`, and `{{a^b^c}}` keeps its carets.
- Preview: a heading no longer stops at the first `?`, so a URL with a query string stays inside it.
- Preview: `h1`–`h4` get a thin rule underneath, like Markdown; horizontal rules are thicker.

## 1.0.2 — 2026-07-08

- New icon: the Jira mark with a view (eye) badge.
- README, manifest and the "no file open" message in English.

## 1.0.1

- The title-bar preview button opens in the current editor group (`Alt`+click opens to the side), matching Markdown.

## 1.0.0

- Preview Jira wiki markup (`.jira`) in a webview: `Ctrl+Shift+V` / `Ctrl+K V` (`Cmd` on macOS) and a title-bar button.
- Local images `!image.png!` (with `|width=..,height=..`) from the folder next to the file; correct resource resolution on remote/WSL.
- Attachments `[^file]` open in the OS file manager.
- Markup: headings, `*bold*` / `{*}..{*}`, `_italic_`, `+underline+`, lists, tables `||..||`, `{code}` / `{noformat}`, links, panels, color.
- Live preview updates, font size from `editor.fontSize`, VS Code theme.
