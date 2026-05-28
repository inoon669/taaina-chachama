// Vercel serverless function: streaming chatbot endpoint for "וולט"
// - Receives conversation history
// - Streams response from OpenAI Chat Completions (SSE)
// - Extracts dynamic quick-reply buttons from <<QR:a|b|c>> markers in the response
// - Forwards text deltas to client + final qr event

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } },
};

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY missing' });
  }

  const apiKey = process.env.OPENAI_API_KEY.trim().replace(/﻿/g, '');

  const { messages = [] } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const systemPrompt = (process.env.SYSTEM_PROMPT || '').trim().replace(/﻿/g, '') || DEFAULT_SYSTEM_PROMPT;

  // Open the SSE stream to the client
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  try {
    // Call OpenAI with streaming
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        stream: true,
        temperature: 0.7,
        max_tokens: 350,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-10),
        ],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => 'unknown');
      sendEvent('error', { message: `OpenAI error ${upstream.status}: ${errText.substring(0, 300)}` });
      res.end();
      return;
    }

    // QR buffer state machine
    let textBuf = '';        // pending text before potential <<QR
    let inQR = false;
    let qrBuf = '';
    let fullText = '';       // for history

    const flushSafe = () => {
      // emit everything in textBuf except last 6 chars (potential partial '<<QR:')
      const safe = Math.max(0, textBuf.length - 6);
      if (safe > 0) {
        const chunk = textBuf.substring(0, safe);
        textBuf = textBuf.substring(safe);
        sendEvent('text', { content: chunk });
        fullText += chunk;
      }
    };

    const processDelta = (delta) => {
      if (!delta) return;
      if (!inQR) {
        textBuf += delta;
        const qrStart = textBuf.indexOf('<<QR:');
        if (qrStart >= 0) {
          // emit everything before <<QR
          const before = textBuf.substring(0, qrStart);
          if (before) {
            sendEvent('text', { content: before });
            fullText += before;
          }
          qrBuf = textBuf.substring(qrStart + 5);
          textBuf = '';
          inQR = true;
          // maybe '>>' is already inside the same delta
          checkQrEnd();
        } else {
          flushSafe();
        }
      } else {
        qrBuf += delta;
        checkQrEnd();
      }
    };

    const checkQrEnd = () => {
      const end = qrBuf.indexOf('>>');
      if (end >= 0) {
        const qrText = qrBuf.substring(0, end);
        const replies = qrText.split('|').map((s) => s.trim()).filter(Boolean).slice(0, 4);
        sendEvent('qr', { replies });
        inQR = false;
        qrBuf = '';
      }
    };

    // Parse OpenAI's SSE stream
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let sseBuffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      let lineEnd;
      while ((lineEnd = sseBuffer.indexOf('\n')) >= 0) {
        const line = sseBuffer.substring(0, lineEnd).trim();
        sseBuffer = sseBuffer.substring(lineEnd + 1);
        if (!line || !line.startsWith('data:')) continue;
        const payload = line.substring(5).trim();
        if (payload === '[DONE]') break;
        try {
          const obj = JSON.parse(payload);
          const delta = obj.choices?.[0]?.delta?.content;
          if (delta) processDelta(delta);
        } catch (_) { /* skip malformed */ }
      }
    }

    // Flush remaining safe text
    if (!inQR && textBuf) {
      sendEvent('text', { content: textBuf });
      fullText += textBuf;
      textBuf = '';
    }

    sendEvent('done', { text: fullText });
    res.end();

  } catch (err) {
    console.error('Chat handler error:', err);
    try {
      sendEvent('error', { message: err.message || 'server_error' });
    } catch {}
    res.end();
  }
}

const DEFAULT_SYSTEM_PROMPT = 'אתה וולט, העוזר הדיגיטלי של טעינה חכמה.';
