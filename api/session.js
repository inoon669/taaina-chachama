// Vercel serverless function: pure SDP proxy to OpenAI Realtime GA API.
// Browser sends raw SDP offer → we forward to OpenAI → return raw SDP answer.
// The OpenAI API key never leaves the server.

export const config = {
  api: {
    bodyParser: false, // we read the raw body ourselves
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured on server' });
  }

  const apiKey = process.env.OPENAI_API_KEY.trim().replace(/﻿/g, '');

  // Health check: GET returns server status + first 10 chars of key (to verify it's set)
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      keyPrefix: apiKey.substring(0, 8) + '...',
      model: 'gpt-realtime',
      flow: 'POST raw SDP body → server forwards to OpenAI /v1/realtime',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sdp = await readRawBody(req);

    if (!sdp || !sdp.includes('v=')) {
      return res.status(400).json({
        error: 'Invalid SDP offer',
        received_length: sdp ? sdp.length : 0,
        hint: 'Body must be a raw SDP offer (Content-Type: application/sdp)',
      });
    }

    const model = req.query.model || 'gpt-realtime';
    const url = `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`;

    const openaiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/sdp',
      },
      body: sdp,
    });

    const responseText = await openaiRes.text();

    if (!openaiRes.ok) {
      console.error('OpenAI rejected SDP:', openaiRes.status, responseText);
      return res.status(openaiRes.status).json({
        error: 'OpenAI rejected the offer',
        openai_status: openaiRes.status,
        openai_response: responseText.substring(0, 500),
      });
    }

    res.setHeader('Content-Type', 'application/sdp');
    return res.status(200).send(responseText);

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
