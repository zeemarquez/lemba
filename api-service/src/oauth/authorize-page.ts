interface AuthorizePageParams {
    clientName: string;
    client_id: string;
    redirect_uri: string;
    state: string;
    code_challenge: string;
    error?: string;
}

function escape(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildAuthorizePage(params: AuthorizePageParams): string {
    const { clientName, client_id, redirect_uri, state, code_challenge, error } = params;
    const webAppUrl = process.env.WEBAPP_URL ?? 'https://app.modernmarkdowneditor.com';
    const settingsUrl = `${webAppUrl}/settings`;

    const errorBanner = error
        ? `<div class="error">${escape(error)}</div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Authorize — Modern Markdown Editor</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    background: #0f1117;
    color: #e2e8f0;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .card {
    background: #1a1d27;
    border: 1px solid #2d3148;
    border-radius: 12px;
    padding: 2rem;
    width: 100%;
    max-width: 420px;
  }
  .logo { font-size: 0.85rem; color: #7c85a2; margin-bottom: 1.5rem; }
  h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.4rem; }
  .subtitle { font-size: 0.9rem; color: #7c85a2; margin-bottom: 1.75rem; }
  .client-name { color: #a78bfa; font-weight: 600; }
  label { display: block; font-size: 0.85rem; color: #94a3b8; margin-bottom: 0.4rem; }
  input[type="password"] {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid #2d3148;
    border-radius: 8px;
    background: #0f1117;
    color: #e2e8f0;
    font-size: 0.95rem;
    outline: none;
  }
  input[type="password"]:focus { border-color: #a78bfa; }
  .hint { font-size: 0.8rem; color: #7c85a2; margin-top: 0.5rem; }
  .hint a { color: #a78bfa; text-decoration: none; }
  .hint a:hover { text-decoration: underline; }
  button {
    display: block;
    width: 100%;
    margin-top: 1.5rem;
    padding: 0.65rem;
    background: #7c3aed;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
  }
  button:hover { background: #6d28d9; }
  .error {
    background: #3b1414;
    border: 1px solid #7f1d1d;
    color: #fca5a5;
    border-radius: 8px;
    padding: 0.6rem 0.75rem;
    font-size: 0.85rem;
    margin-bottom: 1rem;
  }
</style>
</head>
<body>
<div class="card">
  <div class="logo">Modern Markdown Editor</div>
  <h1>Authorize access</h1>
  <p class="subtitle"><span class="client-name">${escape(clientName)}</span> is requesting access to your account.</p>
  ${errorBanner}
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="client_id" value="${escape(client_id)}">
    <input type="hidden" name="redirect_uri" value="${escape(redirect_uri)}">
    <input type="hidden" name="state" value="${escape(state)}">
    <input type="hidden" name="code_challenge" value="${escape(code_challenge)}">
    <label for="api_key">Your API key</label>
    <input type="password" id="api_key" name="api_key" placeholder="mme_..." autocomplete="current-password" required>
    <p class="hint">
      Generate a key in the editor under
      <a href="${escape(settingsUrl)}" target="_blank" rel="noopener noreferrer">Settings → API Service</a>.
    </p>
    <button type="submit">Authorize</button>
  </form>
</div>
</body>
</html>`;
}
