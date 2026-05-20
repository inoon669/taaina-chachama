export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is not configured' });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY.trim().replace(/﻿/g, '');

    // GA API: forward the SDP offer from the browser to OpenAI, return SDP answer
    // The server acts as a secure proxy — API key never leaves the server
    if (req.method === 'POST') {
      const { sdp, model } = req.body || {};

      if (!sdp) {
        return res.status(400).json({ error: 'SDP offer is required' });
      }

      const targetModel = model || 'gpt-realtime';
      const systemPrompt = process.env.SYSTEM_PROMPT
        ? process.env.SYSTEM_PROMPT.trim().replace(/﻿/g, '')
        : 'You are a helpful assistant. Respond in Hebrew.';

      const sdpResponse = await fetch(
        `https://api.openai.com/v1/realtime?model=${encodeURIComponent(targetModel)}`,
        {
          method: 'POST',
          body: sdp,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/sdp',
          },
        }
      );

      if (!sdpResponse.ok) {
        const errText = await sdpResponse.text();
        console.error('OpenAI SDP error:', errText);
        return res.status(sdpResponse.status).json({ error: errText });
      }

      const answerSdp = await sdpResponse.text();
      res.setHeader('Content-Type', 'application/sdp');
      return res.status(200).send(answerSdp);
    }

    // GET: return available models info
    return res.status(200).json({
      status: 'ok',
      models: ['gpt-realtime', 'gpt-realtime-2025-08-28', 'gpt-realtime-mini'],
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: err.message });
  }
}
