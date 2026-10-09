# Changelog

## 1.1.0

- Formatter for `.jira`: **Format Document**, Format Selection, format on save
  and format on paste.
- Blank lines around headings, lists, tables and `{code}` / panel blocks;
  list markers indented by nesting depth.
- Markup cleanup: `{{{}name{}}}` back to `{{name}}`, empty constructs dropped,
  `{*}text{*}` unwrapped to `*text*` where Jira renders both the same.
- Trimming: trailing whitespace, ends of the file, runs of spaces between words.
- Settings `jiraFormat.blankLines`, `jiraFormat.listIndent`,
  `jiraFormat.cleanupMarkup`, `jiraFormat.collapseSpaces`.
- Preview: italic and strikethrough render inside lists, in the line following a
  list, and in lines that carry a link or an attachment; `{_}text{_}` no longer
  leaks a brace. Inline markup no longer runs inside `{code}` / `{noformat}`,
  and no longer spans a table cell boundary.
- Broken code fences are repaired: Jira's `Unable to find source-code formatter
  for language: …` notice is cut from the block, the fence becomes `{code:none}`,
  an opening fence left unclosed before the next one is dropped, a closing fence
  loses its language, and an unclosed block is closed at the end of the file.
- Preview: an empty code block is no longer drawn as an empty grey frame.
- Preview: links, attachments and images no longer run inside inline monospace,
  so `{{sample.results[field_id]}}` keeps its brackets; text sharing a line with
  an image is no longer swallowed.
- Syntax highlighting for `.jira` in the editor, with the body of a `{code:lang}`
  block highlighted as that language where VS Code ships a grammar for it.
- Preview: `{code:lang}` blocks are syntax-coloured as well, in the extension
  rather than the webview, so the Content-Security-Policy still admits no script.
- Preview: a collapsible **Contents** block at the top — headings as a nested
  tree linking to in-document anchors, then the file's attachments and links.
  It sticks to the top while the document scrolls, and scrolls inside itself
  past 60% of the viewport height.
- Preview: `{{*}}` and `{{+}}` render as code — unwrapping `{*}` used to run first
  and ate the inner braces.
- Preview: superscript, subscript and underline run after attachments and links,
  so two `[^file]` attachments on one line no longer merge into a `<sup>`, and
  `{{a^b^c}}` keeps its carets.
- Preview: a heading no longer stops at the first `?`, so a URL with a query
  string stays inside it.
- Preview: `h1`–`h3` get a thin rule underneath, like Markdown.

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
