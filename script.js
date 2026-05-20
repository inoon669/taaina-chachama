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
// Voice Chat: Continuous conversation
// Web Speech API (continuous STT) + auto-VAD + OpenAI Chat + TTS
// User clicks Start → mic stays open → bot detects pauses → responds → mic reopens
// =====================
class VoiceChat {
  constructor() {
    this.recognition = null;
    this.history = [];
    this.state = 'idle'; // idle | listening | processing | speaking
    this.active = false; // session active flag

    this.interimTranscript = '';
    this.finalTranscript = '';
    this.silenceTimer = null;
    this.SILENCE_MS = 1300; // submit after 1.3s of silence

    this.currentAudio = null;
    this.shouldRestart = false;

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
    this.startBtn.addEventListener('click', () => this.startConversation());
    this.stopBtn.addEventListener('click', () => this.endConversation());
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
    this.endConversation();
  }

  setStatus(text, state = '') {
    this.statusEl.textContent = text;
    this.statusEl.className = `voice-status ${state}`;
  }

  setAvatarState(state) {
    this.avatarEl.className = `voice-avatar-wrap ${state}`;
    this.wavesEl.className = `voice-waves ${state === 'speaking' || state === 'listening' ? state + ' active' : ''}`;
  }

  appendMessage(role, text) {
    const el = document.createElement('div');
    el.className = `transcript-msg ${role}`;
    el.textContent = text;
    this.transcriptEl.appendChild(el);
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
    return el;
  }

  // ============================
  // Conversation lifecycle
  // ============================
  startConversation() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.setStatus('הדפדפן לא תומך בזיהוי קולי. נסו ב-Chrome.', 'error');
      return;
    }

    this.active = true;
    this.history = [];
    this.startBtn.style.display = 'none';
    this.stopBtn.style.display = '';
    this.startListening();
  }

  endConversation() {
    this.active = false;
    this.shouldRestart = false;
    this.stopListening();
    this.stopAudio();

    this.startBtn.style.display = '';
    this.stopBtn.style.display = 'none';
    this.setStatus('לחצו "התחל שיחה" כדי לדבר', '');
    this.setAvatarState('');
    this.state = 'idle';
  }

  // ============================
  // Listening
  // ============================
  startListening() {
    if (!this.active) return;
    if (this.state === 'speaking' || this.state === 'processing') return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SR();
    this.recognition.lang = 'he-IL';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.interimTranscript = '';
    this.finalTranscript = '';

    this.recognition.onstart = () => {
      this.state = 'listening';
      this.setStatus('מקשיב... דברו בחופשיות', 'listening');
      this.setAvatarState('listening');
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = this.finalTranscript;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      this.finalTranscript = final;
      this.interimTranscript = interim;

      // Reset silence timer whenever user is speaking
      if (interim.trim() || final.trim() !== this.lastFinal) {
        this.lastFinal = final.trim();
        this.resetSilenceTimer();
      }
    };

    this.recognition.onerror = (e) => {
      console.error('Recognition error:', e.error);
      if (e.error === 'not-allowed') {
        this.setStatus('אנא אפשרו גישה למיקרופון', 'error');
        this.endConversation();
      } else if (e.error === 'no-speech' || e.error === 'aborted') {
        // ignore, will auto-restart
      } else {
        console.warn('Recognition warning:', e.error);
      }
    };

    this.recognition.onend = () => {
      // Auto-restart if conversation is still active and not in another state
      if (this.active && this.shouldRestart && this.state === 'listening') {
        this.shouldRestart = false;
        try {
          this.recognition.start();
        } catch (e) {
          // already started or invalid state
          setTimeout(() => this.startListening(), 200);
        }
      }
    };

    try {
      this.shouldRestart = true;
      this.recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      // Recognition might be still alive from previous session
      setTimeout(() => this.startListening(), 300);
    }
  }

  stopListening() {
    this.shouldRestart = false;
    this.clearSilenceTimer();
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
      try { this.recognition.abort(); } catch (e) {}
      this.recognition = null;
    }
  }

  // ============================
  // Silence detection (VAD-lite)
  // ============================
  resetSilenceTimer() {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => this.onSilence(), this.SILENCE_MS);
  }

  clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  onSilence() {
    const text = (this.finalTranscript + ' ' + this.interimTranscript).trim();
    if (!text || !this.active || this.state !== 'listening') return;

    // Stop listening before processing
    this.stopListening();
    this.appendMessage('user', text);
    this.processMessage(text);
  }

  // ============================
  // Processing & speaking
  // ============================
  async processMessage(message) {
    this.state = 'processing';
    this.setStatus('חושב...', '');
    this.setAvatarState('');

    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          history: this.history,
          audio: true,
        }),
      });

      if (!res.ok) {
        console.error('Server error:', res.status);
        throw new Error('server_error');
      }

      const data = await res.json();
      const reply = data.reply || '';

      this.history.push({ role: 'user', content: message });
      this.history.push({ role: 'assistant', content: reply });
      if (this.history.length > 20) this.history = this.history.slice(-20);

      this.appendMessage('assistant', reply);

      if (!this.active) return;

      // Play audio (mic is muted via stopListening above)
      if (data.audio) {
        await this.playAudio(data.audio, data.audio_format || 'mp3');
      } else {
        await this.speakBrowser(reply);
      }

      // Resume listening if still active
      if (this.active) {
        this.state = 'listening';
        setTimeout(() => this.startListening(), 300);
      }
    } catch (err) {
      console.error('Process error:', err);
      this.setStatus('שגיאה. ממשיך להאזין...', 'error');
      if (this.active) {
        setTimeout(() => {
          this.state = 'listening';
          this.startListening();
        }, 1500);
      }
    }
  }

  playAudio(base64, format) {
    return new Promise((resolve) => {
      this.state = 'speaking';
      this.setStatus('מדבר...', 'speaking');
      this.setAvatarState('speaking');

      const audio = new Audio(`data:audio/${format};base64,${base64}`);
      this.currentAudio = audio;
      audio.onended = () => { this.currentAudio = null; resolve(); };
      audio.onerror = (e) => { console.error('Audio error:', e); this.currentAudio = null; resolve(); };
      audio.play().catch((e) => {
        console.error('Audio play failed:', e);
        resolve();
      });
    });
  }

  speakBrowser(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      this.state = 'speaking';
      this.setStatus('מדבר...', 'speaking');
      this.setAvatarState('speaking');
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'he-IL';
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.speak(utter);
    });
  }

  stopAudio() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
}

document.addEventListener('DOMContentLoaded', () => { new VoiceChat(); });
