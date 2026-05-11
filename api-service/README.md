# Modern Markdown Editor — PDF API

A stand-alone HTTP service that converts Markdown documents into PDF using
the exact same Typst compilation pipeline as the
[Modern Markdown Editor](../README.md) desktop / web app.

It is fully independent of the app: it has its own `package.json`,
TypeScript config and entry point, and only reuses the conversion source
files by copy. The desktop app keeps working unchanged.

---

## Features

- **Same output as the app.** Templates, headers/footers, front pages,
  outlines, tables, code blocks, alerts, math (KaTeX → Typst) and emojis
  are all handled identically.
- **Bring your own template.** Upload a `.mdt` template file (the same
  format the editor saves) or send the JSON inline.
- **Variables.** Override `{{var:name}}` placeholders without rewriting
  the frontmatter.
- **Custom fonts.** Reference TTF / OTF / WOFF fonts by URL or upload
  them as files.
- **Two transports.** JSON (`POST /v1/convert`) for programmatic use and
  `multipart/form-data` (`POST /v1/convert/multipart`) for direct file
  uploads.
- **Two output modes.** Raw `application/pdf` bytes (default) or
  base64-wrapped JSON (`output: "base64"`).
- **Interactive API docs.** [Swagger UI](https://swagger.io/tools/swagger-ui/) at **`/docs`**, OpenAPI 3 JSON at **`/openapi.json`** (disable with `DOCS_ENABLED=false`).

---

## Quick start

```bash
cd api-service
npm install
cp .env.example .env       # optional, fine to skip
npm run dev                # tsx watch (auto-reload)
# or: npm run build && npm run start:prod
```

The server listens on `http://localhost:4000` by default. Verify it is up:

```bash
curl http://localhost:4000/health
```

Open **interactive docs** in the browser: [http://localhost:4000/docs](http://localhost:4000/docs).  
Machine-readable spec: `GET /openapi.json`.

```json
{ "status": "ok", "service": "modern-markdown-editor-api", "version": "0.1.0" }
```

> **Node version.** Node **18 or later** is required for the global
> `fetch` and `atob` used by the Typst WASM compiler when downloading
> assets from the CDN at first compile.

---

## Deploy on Render (recommended)

This service is a long-lived **Express** app. [Render](https://render.com)
**Web Services** (created from the dashboard) match that model. The
steps below use a normal Web Service only — **no Blueprint** (`render.yaml`)
is required, including on workspaces where Blueprints are not available.

### Create a Web Service (dashboard only)

1. In the [Render Dashboard](https://dashboard.render.com), click **New →
   Web Service** and connect this Git repository.
2. **Name:** e.g. `modern-markdown-editor-api` (any unique name).
3. **Root Directory:** enter **`api-service`** so Render builds and runs
   only this folder (not the Next.js app at the repo root).
4. **Runtime:** **Node** (pick **Node 20** or newer if the UI offers a
   version selector).
5. **Build Command:**

   ```bash
   npm install --include=dev && npm run build
   ```

   `typescript` is a **devDependency**; `--include=dev` ensures `tsc` is
   installed during the build. The running process only executes
   `node dist/index.js`.

6. **Start Command:**

   ```bash
   npm run start:prod
   ```

7. **Health check path:** `/health` (used for deploys and instance health).
8. **Instance type:** choose the free or paid tier that fits your workload
   (PDF + Typst can use noticeable CPU/RAM on large documents).

Click **Create Web Service** and wait for the first deploy.

### Smoke-test

```bash
curl https://<your-service-name>.onrender.com/health
```

### Environment variables (Render → Environment)

In the service → **Environment**, add the same keys you use locally (see
**Configuration (.env)** below). Suggested:

| Key | Notes |
| --- | --- |
| `API_KEY` | Strongly recommended in production. |
| `MAX_UPLOAD_SIZE_MB` | e.g. `25`; increase if you send large JSON bodies. |
| `FONT_FETCH_TIMEOUT_MS` / `IMAGE_FETCH_TIMEOUT_MS` | Optional. |
| `DOCS_ENABLED` | Set `false` to disable **`/docs`** only. |

**`PORT`** is set automatically by Render; do not override it unless you
know what you are doing. **`HOST`** defaults to `0.0.0.0` in the app, which
is correct for Render.

### Free tier note

If the service **spins down** after idle time on a free or low tier, the
**first request after sleep** pays a cold start (npm is already built;
the Typst WASM download may still run on first compile). Upgrade to a
**paid instance** if you need always-on or predictable latency.

---

## Deploy on Vercel (second project)

Alternative to Render: serverless deployment with different limits and
cold-start behaviour. Prefer **Render** above for this API unless you
already standardise on Vercel.

Use a **separate Vercel project** from your main Next.js app, with the
**repository root** set to this folder.

### 1. Create the project

1. In [Vercel](https://vercel.com), **Add New… → Project**.
2. Import the **same Git repository** as the editor app.
3. Under **Root Directory**, click **Edit** and set it to **`api-service`**
   (not the monorepo root).
4. **Framework Preset:** choose **Other** (or leave auto-detect; this
   package is not Next.js).
5. **Build Command:** `npm run build`  
   (Runs `tsc`; the live API is bundled from `api/index.ts` + `src/`.)
6. **Output Directory:** leave **empty** — do not set `dist`; Vercel
   serves this deployment as **serverless functions**, not static files.
7. **Install Command:** `npm install` (default).
8. **Start Command:** leave **empty** (ignored for this setup; local
   `npm run dev` / `npm run start:prod` still use `src/index.ts` on your
   machine).

### 2. Routing (`vercel.json`)

This repo includes `vercel.json` so every path (`/health`, `/v1/convert`,
etc.) is **rewritten** to the single serverless handler at **`/api`**
(`api/index.ts`), which mounts the same Express app as locally.

### 3. Environment variables

In the Vercel project → **Settings → Environment Variables**, add any of
these you use locally (same names as in the **Configuration (.env)**
section below):

| Name | Example | Notes |
|------|---------|--------|
| `API_KEY` | long random string | Recommended in production |
| `MAX_UPLOAD_SIZE_MB` | `25` | Body / JSON size cap |
| `FONT_FETCH_TIMEOUT_MS` | `15000` | |
| `IMAGE_FETCH_TIMEOUT_MS` | `15000` | |
| `DOCS_ENABLED` | _(omit)_ | Set `false` to hide `/docs` on Vercel too |

Vercel sets `VERCEL=1` automatically; you do not need to set it.

### 4. Timeouts and plans

`vercel.json` sets **`maxDuration`: 60** seconds for `api/index.ts`.
PDF + WASM cold starts can take several seconds; large documents may
need the full window.

- On **Hobby**, the maximum execution time for a function may be lower
  than 60s depending on your account — check
  [Vercel function limits](https://vercel.com/docs/functions/runtimes#max-duration).
- If builds fail the limit, upgrade to **Pro** or reduce `maxDuration` to
  match your plan.

### 5. Smoke-test the deployment

After deploy, your API base URL will look like
`https://<project>.vercel.app` (or your custom domain):

```bash
curl https://<project>.vercel.app/health
curl -X POST https://<project>.vercel.app/v1/convert \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Hello","title":"Test"}' \
  --output test.pdf
```

Point your editor or backend integrations at this base URL instead of
`http://localhost:4000`.

---

## Configuration (`.env`)

| Variable                  | Default     | Description                                                  |
| ------------------------- | ----------- | ------------------------------------------------------------ |
| `PORT`                    | `4000`      | HTTP port (Render sets this automatically — do not override) |
| `HOST`                    | `0.0.0.0`   | HTTP bind address (default is fine on Render)               |
| `MAX_UPLOAD_SIZE_MB`      | `25`        | Body/file size limit                                         |
| `API_KEY`                 | _(empty)_   | If set, callers must send `Authorization: Bearer <key>` or `x-api-key` |
| `FONT_FETCH_TIMEOUT_MS`   | `15000`     | Timeout when downloading remote fonts                         |
| `IMAGE_FETCH_TIMEOUT_MS`  | `15000`     | Timeout when downloading remote images                        |
| `DOCS_ENABLED`            | _(unset)_   | Set to `false` to disable **`/docs`** ( **`/openapi.json`** stays enabled) |

---

## OpenAPI & Swagger UI

| URL | Description |
| --- | --- |
| **`GET /docs`** | Interactive Swagger UI (Try it out). Does **not** require `API_KEY`; use **Authorize** if your server enforces one. |
| **`GET /openapi.json`** | OpenAPI 3.0 document for codegen and tooling. Always served. |

Set **`DOCS_ENABLED=false`** to hide the UI (e.g. production hardening). The JSON spec remains at `/openapi.json`.

---

## Endpoints

### `GET /health`

Liveness probe. Returns `{ status: "ok" }`.

### `POST /v1/convert` — JSON

```jsonc
{
  "markdown":  "# Hello {{var:name}}",            // required
  "template":  { "settings": { /* ...mdt... */ } }, // optional
  "title":     "My report",                        // optional, available as {{title}}
  "variables": { "name": "World" },                // optional, overrides frontmatter
  "fonts":     [                                   // optional
    { "family": "Inter", "url": "https://example.com/Inter-Regular.ttf" }
  ],
  "output":    "binary",                           // "binary" (default) or "base64"
  "debug":     false,                              // include generated Typst source?
  "filename":  "report.pdf"                        // for Content-Disposition / base64
}
```

**Response — `output: "binary"` (default)**

- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="..."`
- Body: raw PDF bytes

**Response — `output: "base64"`**

```json
{
  "filename":   "report.pdf",
  "mimeType":   "application/pdf",
  "base64":     "JVBERi0xLjcK...",
  "byteLength": 12345,
  "typstSource": "..."   // only when debug=true
}
```

### `POST /v1/convert/multipart` — `multipart/form-data`

| Field        | Type                | Notes                                                              |
| ------------ | ------------------- | ------------------------------------------------------------------ |
| `markdown`   | file _or_ text      | The Markdown document. Required.                                   |
| `template`   | file _or_ text JSON | The `.mdt` template. Optional.                                     |
| `title`      | text                | Optional document title.                                           |
| `variables`  | text (JSON object)  | Optional overrides for `{{var:NAME}}`.                             |
| `fonts`      | text (JSON array)   | Optional `[ { "family": "Inter", "url": "https://..." } ]`.        |
| `fontFiles`  | one or more files   | Optional raw font uploads. Family = filename (no extension).       |
| `output`     | text                | `binary` (default) or `base64`.                                    |
| `debug`      | text                | `1` / `true` to include Typst source.                              |
| `filename`   | text                | Output PDF filename.                                               |

---

## Examples

The [`examples/`](./examples) folder ships with copy-pasteable clients.

### cURL — JSON, raw PDF

```bash
curl -X POST http://localhost:4000/v1/convert \
  -H "Content-Type: application/json" \
  -d '{
    "markdown": "# Hello {{var:name}}\n\nThis was generated via the API.",
    "title":    "My API report",
    "variables": { "name": "World" }
  }' \
  --output report.pdf
```

### cURL — multipart with template + custom font

```bash
curl -X POST http://localhost:4000/v1/convert/multipart \
  -F "markdown=@./examples/sample.md" \
  -F "template=@../public/preloaded/Default Templates/Modern.mdt" \
  -F 'variables={"author":"Jane Doe"}' \
  -F 'fonts=[{"family":"Inter","url":"https://github.com/rsms/inter/raw/master/docs/font-files/Inter-Regular.ttf"}]' \
  -F "title=Quarterly Report" \
  --output report.pdf
```

### Node (fetch)

```js
import fs from 'node:fs/promises';

const r = await fetch('http://localhost:4000/v1/convert', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    markdown: await fs.readFile('./report.md', 'utf8'),
    template: JSON.parse(await fs.readFile('./Modern.mdt', 'utf8')),
    variables: { author: 'Jane Doe' },
    fonts: [{ family: 'Inter', url: 'https://example.com/Inter-Regular.ttf' }],
  }),
});
if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
await fs.writeFile('out.pdf', Buffer.from(await r.arrayBuffer()));
```

### Python (`requests`)

```python
import json, requests, pathlib

resp = requests.post(
    "http://localhost:4000/v1/convert",
    json={
        "markdown":  pathlib.Path("report.md").read_text(encoding="utf-8"),
        "template":  json.loads(pathlib.Path("Modern.mdt").read_text(encoding="utf-8")),
        "variables": {"author": "Jane Doe"},
    },
    timeout=120,
)
resp.raise_for_status()
pathlib.Path("out.pdf").write_bytes(resp.content)
```

---

## Authoring templates

The `template` payload accepts the **same `.mdt` file** the editor saves.
A minimal template is just a JSON object with a `settings` field — see
`public/preloaded/Default Templates/Basic.mdt` in the repository for a
fully populated example.

```json
{
  "id":   "Templates/MyTemplate.mdt",
  "name": "My Template",
  "settings": {
    "fontFamily": "Inter",
    "fontSize":   "12px",
    "textColor":  "#1f2937",
    "margins":    { "top": "25mm", "bottom": "25mm", "left": "25mm", "right": "25mm" },
    "pageSize":   { "preset": "a4" },
    "h1": { "fontSize": "30px", "fontWeight": "700" }
  }
}
```

All template settings supported by the editor are forwarded verbatim, so
features like headers/footers (`settings.header`), front pages
(`settings.frontPage`), outlines (`settings.outline`), heading
numbering, alerts and code-block styling all just work.

---

## Variables and placeholders

Documents can embed:

- `{{title}}` — replaced by `title` from the request body.
- `{{date}}`, `{{date:iso|long|short}}` — the current date.
- `{{page}}`, `{{page:upper-roman|...}}` — current page in headers/footers.
- `{{totalPages}}` — total page count.
- `{{var:NAME}}` — looks up `NAME` in `variables` (with frontmatter
  `variables:` block as fallback).

---

## Architecture

```
api-service/
├── api/
│   └── index.ts                # Vercel serverless entry (re-exports Express app)
├── vercel.json                 # Vercel only: rewrites → /api + function limits
├── src/
│   ├── openapi/
│   │   └── spec.ts             # OpenAPI 3 document (also served at /openapi.json)
│   ├── app.ts                  # Express app (shared: local + Vercel)
│   ├── index.ts                # Local only: app.listen(PORT)
│   ├── middleware/auth.ts      # Optional API-key check
│   ├── routes/
│   │   ├── convert.ts          # POST /v1/convert + /v1/convert/multipart
│   │   └── docs.ts             # GET /docs — Swagger UI
│   └── lib/
│       ├── converter.ts        # High-level conversion API
│       ├── frontmatter.ts      # gray-matter helpers (copied from app)
│       └── typst/
│           ├── compiler.ts         # WASM Typst init + compile
│           ├── images.ts           # Inline remote / data: images
│           ├── markdown-to-typst.ts
│           ├── lucide-svg.ts
│           ├── build-source.ts
│           └── fonts.ts
├── examples/                   # Sample clients (curl, node, python)
└── package.json
```

The Typst WASM module and font assets are loaded lazily from
`cdn.jsdelivr.net` on the first request — expect a slightly longer
first compile (~1 s of cold start), then very fast subsequent
compilations.

---

## Production notes

- The Typst WASM compiler is a singleton **per running Node process**.
  Concurrent requests in that process are serialized internally to avoid
  corrupting compiler state (font registration mutates global state).
  On **Vercel**, each warm serverless instance is one process; under load,
  Vercel scales out to more instances. On a **VM / container**, run more
  replicas behind a load balancer (PM2, Kubernetes, etc.) for throughput.
- The service is stateless. Mounting a persistent disk is **not**
  required.
- Set `API_KEY` in production. On Vercel, TLS and HTTPS are provided
  automatically; on your own host, terminate TLS (Caddy, nginx, Traefik,
  etc.).
