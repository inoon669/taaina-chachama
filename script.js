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
    this.SILENCE_MS = 1500; // submit after 1.5s of silence
    this.MIN_TRANSCRIPT_LENGTH = 3; // ignore transcripts shorter than this
    this.MIN_SPEECH_DURATION_MS = 400; // require this much real speech

    // Volume-based VAD (Voice Activity Detection)
    this.mediaStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.volumeData = null;
    this.vadRaf = null;
    this.NOISE_FLOOR = 12; // baseline ambient noise level (0-255)
    this.VOICE_THRESHOLD = 28; // must exceed this to count as voice
    this.smoothedVolume = 0;
    this.voiceDetectedSince = 0; // timestamp when voice first exceeded threshold
    this.totalSpeechMs = 0; // accumulated speech duration

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
  async startConversation() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.setStatus('הדפדפן לא תומך בזיהוי קולי. נסו ב-Chrome.', 'error');
      return;
    }

    try {
      this.setStatus('מבקש גישה למיקרופון...', 'connecting');

      // Open mic ONCE for the whole session — with noise suppression
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      // Set up Web Audio for VAD
      this.setupVAD();

      // Calibrate noise floor over 800ms
      this.setStatus('מכייל לרעש סביבתי...', 'connecting');
      await this.calibrateNoiseFloor();

    } catch (err) {
      console.error('Mic init error:', err);
      this.setStatus('לא ניתן לגשת למיקרופון. אפשרו הרשאה.', 'error');
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
    this.stopVAD();

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    this.startBtn.style.display = '';
    this.stopBtn.style.display = 'none';
    this.setStatus('לחצו "התחל שיחה" כדי לדבר', '');
    this.setAvatarState('');
    this.state = 'idle';
  }

  // ============================
  // Voice Activity Detection (volume-based)
  // ============================
  setupVAD() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.audioContext = new Ctx();
    const source = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.smoothingTimeConstant = 0.6;
    source.connect(this.analyser);
    this.volumeData = new Uint8Array(this.analyser.frequencyBinCount);
    this.startVADLoop();
  }

  startVADLoop() {
    const tick = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(this.volumeData);
      // Focus on speech frequencies (~85-3000Hz)
      // With fftSize=512 @ 48000Hz, each bin is ~93Hz, so bins 1-32 cover speech
      let sum = 0;
      let count = 0;
      for (let i = 1; i < 32; i++) {
        sum += this.volumeData[i];
        count++;
      }
      const currentVolume = sum / count;
      this.smoothedVolume = this.smoothedVolume * 0.8 + currentVolume * 0.2;

      // If listening, track voice activity
      if (this.state === 'listening') {
        const now = performance.now();
        if (this.smoothedVolume > this.VOICE_THRESHOLD) {
          if (!this.voiceDetectedSince) this.voiceDetectedSince = now;
          else this.totalSpeechMs += (now - this.voiceDetectedSince);
          this.voiceDetectedSince = now;
        } else {
          this.voiceDetectedSince = 0;
        }
      }

      this.vadRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  stopVAD() {
    if (this.vadRaf) cancelAnimationFrame(this.vadRaf);
    this.vadRaf = null;
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
    this.volumeData = null;
  }

  calibrateNoiseFloor() {
    return new Promise((resolve) => {
      const samples = [];
      const startTime = performance.now();
      const collect = () => {
        if (this.analyser) {
          this.analyser.getByteFrequencyData(this.volumeData);
          let sum = 0;
          for (let i = 1; i < 32; i++) sum += this.volumeData[i];
          samples.push(sum / 31);
        }
        if (performance.now() - startTime < 800) {
          setTimeout(collect, 50);
        } else {
          // Use 95th percentile as noise floor estimate
          samples.sort((a, b) => a - b);
          const floor = samples[Math.floor(samples.length * 0.95)] || 8;
          this.NOISE_FLOOR = Math.max(8, floor);
          // Threshold = noise floor + 12 (must be meaningfully louder)
          this.VOICE_THRESHOLD = this.NOISE_FLOOR + 14;
          console.log(`VAD calibrated: floor=${this.NOISE_FLOOR.toFixed(1)}, threshold=${this.VOICE_THRESHOLD.toFixed(1)}`);
          resolve();
        }
      };
      collect();
    });
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
    this.totalSpeechMs = 0;
    this.voiceDetectedSince = 0;

    this.recognition.onstart = () => {
      this.state = 'listening';
      this.setStatus('מקשיב...', 'listening');
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

      // Reset silence timer ONLY if VAD confirms real voice activity
      const hasNewText = interim.trim() || final.trim() !== this.lastFinal;
      const isRealVoice = this.smoothedVolume > this.VOICE_THRESHOLD;
      if (hasNewText && isRealVoice) {
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
    if (!this.active || this.state !== 'listening') return;

    // GUARD 1: ignore empty or too-short transcripts (noise hallucinations)
    if (!text || text.length < this.MIN_TRANSCRIPT_LENGTH) {
      console.log('Ignored: text too short:', JSON.stringify(text));
      this.resetForNext();
      return;
    }

    // GUARD 2: require actual voice activity from VAD (not just noise)
    if (this.totalSpeechMs < this.MIN_SPEECH_DURATION_MS) {
      console.log(`Ignored: not enough real voice (${this.totalSpeechMs.toFixed(0)}ms < ${this.MIN_SPEECH_DURATION_MS}ms)`);
      this.resetForNext();
      return;
    }

    // GUARD 3: filter pure noise patterns (single repeated char, etc.)
    const wordCount = text.split(/\s+/).filter((w) => w.length > 1).length;
    if (wordCount < 1) {
      console.log('Ignored: no real words');
      this.resetForNext();
      return;
    }

    // Real speech — send it
    this.stopListening();
    this.appendMessage('user', text);
    this.processMessage(text);
  }

  resetForNext() {
    this.finalTranscript = '';
    this.interimTranscript = '';
    this.totalSpeechMs = 0;
    this.lastFinal = '';
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
