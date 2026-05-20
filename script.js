// Header scroll effect
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 20);
});

// Mobile menu
const menuToggle = document.getElementById('menuToggle');
const nav = document.getElementById('nav');
menuToggle.addEventListener('click', () => {
  menuToggle.classList.toggle('open');
  nav.classList.toggle('open');
});
nav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    menuToggle.classList.remove('open');
    nav.classList.remove('open');
  });
});

// Reveal on scroll
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

// Active nav link on scroll
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.id;
      navLinks.forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === '#' + id);
      });
    }
  });
}, { threshold: 0.4 });
sections.forEach(s => sectionObserver.observe(s));

// Contact form
const form = document.getElementById('contactForm');
const formSuccess = document.getElementById('formSuccess');
const formError = document.getElementById('formError');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  form.classList.remove('success', 'error');
  form.classList.add('loading');

  const data = new FormData(form);

  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: data,
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      form.classList.remove('loading');
      form.classList.add('success');
      form.reset();
      // Scroll the success message into view
      formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Optional: track conversion in analytics
      if (window.gtag) gtag('event', 'lead_submit');
    } else {
      throw new Error('Submission failed');
    }
  } catch (err) {
    form.classList.remove('loading');
    form.classList.add('error');
    console.error(err);
  }
});

// Subtle parallax for hero image
const heroImage = document.querySelector('.hero-image');
if (heroImage && window.matchMedia('(min-width: 960px)').matches) {
  window.addEventListener('scroll', () => {
    const offset = window.scrollY * 0.04;
    heroImage.style.transform = `translateY(${offset}px)`;
  }, { passive: true });
}

// =====================
// Voice Chat (OpenAI Realtime API — WebRTC)
// =====================
class VoiceChat {
  constructor() {
    this.pc = null;
    this.dc = null;
    this.audioEl = null;
    this.mediaStream = null;
    this.isConnected = false;
    this.currentAssistantMsg = null;
    this.currentUserMsg = null;

    this.modal = document.getElementById('voiceModal');
    this.backdrop = document.getElementById('voiceBackdrop');
    this.voiceBtn = document.getElementById('voiceBtn');
    this.closeBtn = document.getElementById('voiceClose');
    this.statusEl = document.getElementById('voiceStatus');
    this.startBtn = document.getElementById('voiceStartBtn');
    this.stopBtn = document.getElementById('voiceStopBtn');
    this.transcriptEl = document.getElementById('voiceTranscript');
    this.wavesEl = document.getElementById('voiceWaves');
    this.avatarEl = document.getElementById('voiceAvatar');

    this.bindEvents();
  }

  bindEvents() {
    this.voiceBtn.addEventListener('click', () => this.open());
    this.closeBtn.addEventListener('click', () => this.close());
    this.backdrop.addEventListener('click', () => this.close());
    this.startBtn.addEventListener('click', () => this.startSession());
    this.stopBtn.addEventListener('click', () => this.endSession());
  }

  open() {
    this.modal.classList.add('open');
    this.backdrop.classList.add('open');
    requestAnimationFrame(() => {
      this.modal.classList.add('visible');
      this.backdrop.classList.add('visible');
    });
  }

  close() {
    this.modal.classList.remove('visible');
    this.backdrop.classList.remove('visible');
    setTimeout(() => {
      this.modal.classList.remove('open');
      this.backdrop.classList.remove('open');
    }, 350);
    this.endSession();
  }

  setStatus(text, state = '') {
    this.statusEl.textContent = text;
    this.statusEl.className = `voice-status ${state}`;
  }

  setAvatarState(state) {
    this.avatarEl.className = `voice-avatar-wrap ${state}`;
    this.wavesEl.className = `voice-waves ${state === 'speaking' || state === 'listening' ? state + ' active' : ''}`;
  }

  appendMessage(role, text, append = false) {
    if (append) {
      const last = role === 'assistant' ? this.currentAssistantMsg : this.currentUserMsg;
      if (last) { last.textContent += text; this.scrollTranscript(); return last; }
    }
    const el = document.createElement('div');
    el.className = `transcript-msg ${role}`;
    el.textContent = text;
    this.transcriptEl.appendChild(el);
    this.scrollTranscript();
    if (role === 'assistant') this.currentAssistantMsg = el;
    else this.currentUserMsg = el;
    return el;
  }

  scrollTranscript() {
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
  }

  async startSession() {
    this.startBtn.style.display = 'none';
    this.setStatus('מתחבר...', 'connecting');

    try {
      // 1. Set up WebRTC
      this.pc = new RTCPeerConnection();

      // Audio output
      this.audioEl = document.createElement('audio');
      this.audioEl.autoplay = true;
      document.body.appendChild(this.audioEl);
      this.pc.ontrack = (e) => { this.audioEl.srcObject = e.streams[0]; };

      // Mic input
      this.setStatus('מבקש הרשאת מיקרופון...', 'connecting');
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream.getTracks().forEach(t => this.pc.addTrack(t, this.mediaStream));

      // Data channel for events
      this.dc = this.pc.createDataChannel('oai-events');
      this.dc.onopen = () => {
        this.isConnected = true;
        this.setStatus('מחובר — דבר בחופשיות', 'connected');
        this.setAvatarState('connected');
        this.stopBtn.style.display = '';
      };
      this.dc.onmessage = (e) => this.handleEvent(JSON.parse(e.data));

      // 2. Create SDP offer
      this.setStatus('מחבר לעוזר הקולי...', 'connecting');
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // 3. Send SDP to OUR server — server proxies to OpenAI (API key stays on server!)
      const sdpRes = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sdp: offer.sdp, model: 'gpt-realtime' }),
      });

      if (!sdpRes.ok) {
        const err = await sdpRes.json().catch(() => ({}));
        throw new Error(err.error || `שגיאת שרת ${sdpRes.status}`);
      }

      const answerSdp = await sdpRes.text();
      await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    } catch (err) {
      console.error(err);
      this.setStatus('שגיאה: ' + err.message, 'error');
      this.startBtn.style.display = '';
      this.endSession(false);
    }
  }

  handleEvent(ev) {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started':
        this.setStatus('מקשיב...', 'listening');
        this.setAvatarState('listening');
        this.currentUserMsg = null;
        break;
      case 'input_audio_buffer.speech_stopped':
        this.setStatus('מעבד...', '');
        this.setAvatarState('');
        break;
      case 'conversation.item.input_audio_transcription.completed':
        if (ev.transcript) this.appendMessage('user', ev.transcript);
        break;
      case 'response.audio_transcript.delta':
        if (ev.delta) {
          if (!this.currentAssistantMsg) this.appendMessage('assistant', ev.delta);
          else this.appendMessage('assistant', ev.delta, true);
        }
        break;
      case 'response.audio.started':
      case 'response.created':
        this.setStatus('מדבר...', 'speaking');
        this.setAvatarState('speaking');
        this.currentAssistantMsg = null;
        break;
      case 'response.done':
      case 'response.audio.done':
        this.setStatus('מחובר — דבר בחופשיות', 'connected');
        this.setAvatarState('connected');
        break;
      case 'error':
        console.error('Realtime error:', ev.error);
        this.setStatus('שגיאה: ' + (ev.error?.message || 'לא ידועה'), 'error');
        break;
    }
  }

  endSession(updateUI = true) {
    if (this.pc) { this.pc.close(); this.pc = null; }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
    if (this.audioEl) { this.audioEl.srcObject = null; this.audioEl.remove(); this.audioEl = null; }
    this.dc = null;
    this.isConnected = false;

    if (updateUI) {
      this.stopBtn.style.display = 'none';
      this.startBtn.style.display = '';
      this.setStatus('לחץ להתחיל שיחה', '');
      this.setAvatarState('');
      this.currentAssistantMsg = null;
      this.currentUserMsg = null;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => { new VoiceChat(); });
