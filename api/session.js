// Voice chat backend: takes user message + history → returns assistant response + spoken audio.
// Uses OpenAI chat completion + TTS (since this account doesn't have Realtime API access).

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
  }

  const apiKey = process.env.OPENAI_API_KEY.trim().replace(/﻿/g, '');

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', mode: 'chat+tts' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history = [], audio = true } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message is required' });

    const systemPrompt = (process.env.SYSTEM_PROMPT || 'You are a helpful Hebrew-speaking assistant.')
      .trim()
      .replace(/﻿/g, '');

    // 1. Get text response from chat model
    const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.slice(-10), // keep last 10 messages for context
          { role: 'user', content: message },
        ],
        temperature: 0.7,
        max_tokens: 250,
      }),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      console.error('Chat error:', errText);
      return res.status(chatRes.status).json({ error: 'chat_failed', details: errText.substring(0, 300) });
    }

    const chatData = await chatRes.json();
    const reply = chatData.choices?.[0]?.message?.content || '';

    // 2. (Optional) Get TTS audio
    let audioBase64 = null;
    if (audio && reply) {
      try {
        const ttsRes = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini-tts',
            voice: 'shimmer',
            input: reply,
            response_format: 'mp3',
          }),
        });

        if (ttsRes.ok) {
          const arrayBuf = await ttsRes.arrayBuffer();
          audioBase64 = Buffer.from(arrayBuf).toString('base64');
        } else {
          console.error('TTS failed, returning text only:', await ttsRes.text());
        }
      } catch (ttsErr) {
        console.error('TTS error:', ttsErr.message);
      }
    }

    return res.status(200).json({
      reply,
      audio: audioBase64,
      audio_format: audioBase64 ? 'mp3' : null,
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'server_error', message: err.message });
  }
}
