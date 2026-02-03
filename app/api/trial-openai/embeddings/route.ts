import { NextResponse } from 'next/server';

// No dynamic/revalidate: incompatible with output: 'export' (used for Electron/local builds).

export async function POST(request: Request) {
  const apiKey = process.env.TRIAL_OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Trial OpenAI API key not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') ?? 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Trial OpenAI request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
