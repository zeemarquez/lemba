---
variables:
  author: Jane Doe
  project: Modern Markdown Editor
---

# {{title}}

Authored by **{{var:author}}** for the *{{var:project}}* team on {{date:long}}.

## Introduction

This document is rendered server-side by the `modern-markdown-editor-api`
service. It uses the same Typst compilation pipeline as the desktop app,
so anything that renders in the editor renders here too:

- Lists like this one
- `inline code`
- [Links](https://example.com)
- Math: $E = m c^{2}$

## Code

```ts
function greet(name: string) {
  console.log(`Hello, ${name}!`);
}
```

## Alerts

> [!NOTE]
> Need to reference a value from the request? Use `{{var:author}}`.

> [!TIP]
> Templates can be uploaded as `.mdt` files exported from the editor.

## Tables

| Feature       | Status |
| ------------- | :----: |
| JSON endpoint |   OK   |
| Multipart     |   OK   |
| Custom fonts  |   OK   |

---

Page {{page}} of {{totalPages}}.
