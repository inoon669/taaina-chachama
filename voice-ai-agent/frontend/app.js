/**
 * Real-time Voice AI Agent — frontend
 *
 * Flow:
 *   1. User clicks mic → fetch /api/session (our backend → OpenAI → ephemeral key)
 *   2. Create RTCPeerConnection
 *   3. Get mic, add audio track to peer connection
 *   4. Set up <audio> element to play remote audio (AI's voice)
 *   5. Open data channel "oai-events" for JSON events (transcripts, etc.)
 *   6. createOffer, send SDP directly to OpenAI Realtime API with ephemeral key
 *   7. setRemoteDescription with returned SDP → media flows
 *
 * Events on the data channel let us display transcripts as they arrive.
 */

// ====== DOM ======
const micBtn      = document.getElementById('micBtn');
const statusEl    = document.getElementById('status');
const userTextEl  = document.getElementById('userText');
const aiTextEl    = document.getElementById('aiText');
const userBubble  = userTextEl.closest('.bubble');
const aiBubble    = aiTextEl.closest('.bubble');
const errorBox    = document.getElementById('errorBox');
const aiAudio     = document.getElementById('aiAudio');

// ====== State ======
let pc = null;          // RTCPeerConnection
let dc = null;          // RTCDataChannel for OpenAI events
let micStream = null;   // MediaStream from getUserMedia
let isActive = false;   // session running?
let aiPartial = '';     // accumulating AI text
let voiceProvider = 'openai';

// ====== UI helpers ======
function setStatus(text, state = 'idle') {
  statusEl.textContent = text;
  statusEl.className = `status status-${state}`;
}
function setMicState(state) {
  micBtn.className = `mic-btn ${state}`;
}
function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}
function clearError() { errorBox.hidden = true; errorBox.textContent = ''; }
function setUserText(t)  { userTextEl.textContent = t || '—'; }
function setAIText(t, streaming = false) {
  aiTextEl.textContent = t || '—';
  aiBubble.classList.toggle('streaming', streaming);
}

// ====== Main toggle ======
micBtn.addEventListener('click', () => {
  if (isActive) stopSession();
  else          startSession();
});

// ====== Start ======
async function startSession() {
  clearError();
  isActive = true;
  setStatus('מתחבר...', 'connecting');
  setMicState('connecting');

  try {
    // 1. Get ephemeral token from OUR backend (API key never reaches the browser)
    const sessionRes = await fetch('/api/session');
    if (!sessionRes.ok) {
      const err = await sessionRes.text();
      throw new Error(`Backend session error (${sessionRes.status}): ${err}`);
    }
    const session = await sessionRes.json();
    const ephemeralKey = session.client_secret?.value;
    voiceProvider = session._meta?.voice_provider || 'openai';
    const model = session._meta?.model || 'gpt-4o-realtime-preview-2024-12-17';
    if (!ephemeralKey) throw new Error('No ephemeral key returned from backend');

    // 2. Create the peer connection with a public STUN for NAT traversal
    pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // 3. Attach the remote audio track so the AI's voice plays automatically
    pc.ontrack = (event) => {
      aiAudio.srcObject = event.streams[0];
    };

    // 4. Capture the mic and add to the peer connection
    setStatus('מבקש גישה למיקרופון...', 'connecting');
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    micStream.getTracks().forEach((track) => pc.addTrack(track, micStream));

    // 5. Open the data channel — JSON events flow here
    dc = pc.createDataChannel('oai-events');
    dc.addEventListener('message', handleEvent);
    dc.addEventListener('open',  () => console.log('Data channel open'));
    dc.addEventListener('error', (e) => console.error('Data channel error', e));

    // Watch connection state
    pc.addEventListener('connectionstatechange', () => {
      console.log('PC state:', pc.connectionState);
      if (pc.connectionState === 'failed') {
        showError('החיבור נכשל. נסו שוב.');
        stopSession();
      }
    });

    // 6. Create SDP offer
    setStatus('מתחבר ל-OpenAI...', 'connecting');
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 7. POST the SDP directly to OpenAI Realtime, using ephemeral key as Bearer
    const sdpRes = await fetch(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`,
      {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      }
    );
    if (!sdpRes.ok) {
      const err = await sdpRes.text();
      throw new Error(`OpenAI rejected SDP (${sdpRes.status}): ${err}`);
    }
    const answerSdp = await sdpRes.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    setStatus('מקשיב — דברו עכשיו', 'listening');
    setMicState('listening');
    setUserText(''); setAIText('');
  } catch (err) {
    console.error(err);
    showError(prettyError(err));
    setStatus('שגיאה', 'error');
    setMicState('ended');
    stopSession(false);
  }
}

// ====== Stop ======
function stopSession(resetUI = true) {
  isActive = false;
  if (dc) { try { dc.close(); } catch {} dc = null; }
  if (pc) { try { pc.close(); } catch {} pc = null; }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
  aiAudio.srcObject = null;
  if (resetUI) {
    setStatus('מוכן להתחיל', 'idle');
    setMicState('');
  }
}

// ====== Realtime events ======
function handleEvent(msg) {
  let ev;
  try { ev = JSON.parse(msg.data); } catch { return; }

  switch (ev.type) {
    // User started speaking
    case 'input_audio_buffer.speech_started':
      setStatus('מקשיב...', 'listening');
      setMicState('listening');
      setUserText('');
      break;

    // User stopped speaking — server is now processing
    case 'input_audio_buffer.speech_stopped':
      setStatus('מעבד...', 'connecting');
      break;

    // Whisper finished transcribing what the user said
    case 'conversation.item.input_audio_transcription.completed':
      if (ev.transcript) setUserText(ev.transcript);
      break;

    // AI started responding (audio + text streaming)
    case 'response.created':
      aiPartial = '';
      setAIText('', true);
      setStatus('הסוכן עונה...', 'speaking');
      setMicState('speaking');
      break;

    // Each token of the AI's spoken transcript
    case 'response.audio_transcript.delta':
      if (ev.delta) {
        aiPartial += ev.delta;
        setAIText(aiPartial, true);
      }
      break;

    // AI finished one response — go back to listening
    case 'response.done':
      setAIText(aiPartial, false);
      setStatus('מקשיב...', 'listening');
      setMicState('listening');
      break;

    case 'error':
      console.error('OpenAI error event:', ev.error);
      showError(ev.error?.message || 'שגיאה ב-OpenAI');
      break;

    default:
      // Many other events are emitted; uncomment to debug:
      // console.log('Realtime event:', ev.type, ev);
      break;
  }
}

// ====== Error formatter ======
function prettyError(err) {
  const m = err?.message || String(err);
  if (m.includes('Permission') || m.includes('NotAllowed')) return 'אנא אפשרו גישה למיקרופון.';
  if (m.includes('NotFound')) return 'לא נמצא מיקרופון במכשיר.';
  if (m.includes('beta_api_shape_disabled')) {
    return 'החשבון שלך לא מורשה ל-Realtime API. ראה README.md לפרטים על הפתרון.';
  }
  return `שגיאה: ${m}`;
}

// ====== Cleanup on page unload ======
window.addEventListener('beforeunload', () => stopSession(false));
