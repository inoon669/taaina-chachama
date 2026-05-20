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
// Voice Chat: Web Speech API (browser STT) + OpenAI Chat + TTS
// Push-to-talk style: click button → speak → release → assistant responds with voice
// =====================
class VoiceChat {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.isProcessing = false;
    this.currentAudio = null;
    this.history = [];

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
    this.startBtn.addEventListener('click', () => this.toggleListen());
    this.stopBtn.addEventListener('click', () => this.endSession());
  }

  open() {
    this.modal.classList.add('open');
    this.backdrop.classList.add('open');
    requestAnimationFrame(() => {
      this.modal.classList.add('visible');
      this.backdrop.classList.add('visible');
    });

    // Update button text on first open
    const btnText = this.startBtn.querySelector('svg').nextSibling;
    if (btnText && btnText.nodeValue.includes('התחל')) {
      btnText.nodeValue = ' לחצו ודברו';
    }
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

  appendMessage(role, text) {
    const el = document.createElement('div');
    el.className = `transcript-msg ${role}`;
    el.textContent = text;
    this.transcriptEl.appendChild(el);
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight;
    return el;
  }

  toggleListen() {
    if (this.isProcessing) return;
    if (this.isListening) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  startListening() {
    // Stop any playing audio
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      this.setStatus('הדפדפן לא תומך בזיהוי קולי. נסו ב-Chrome.', 'error');
      return;
    }

    this.recognition = new SR();
    this.recognition.lang = 'he-IL';
    this.recognition.continuous = false;
    this.recognition.interimResults = false;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.setStatus('מקשיב... דברו עכשיו', 'listening');
      this.setAvatarState('listening');
      this.startBtn.classList.add('listening');
      this.updateButtonText('סיים לדבר');
    };

    this.recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      this.appendMessage('user', transcript);
      this.processMessage(transcript);
    };

    this.recognition.onerror = (e) => {
      console.error('Speech recognition error:', e.error);
      this.isListening = false;
      this.startBtn.classList.remove('listening');
      this.updateButtonText('לחצו ודברו');
      if (e.error === 'no-speech') {
        this.setStatus('לא שמעתי כלום. נסו שוב.', '');
      } else if (e.error === 'not-allowed') {
        this.setStatus('אנא אפשרו גישה למיקרופון', 'error');
      } else {
        this.setStatus('שגיאה: ' + e.error, 'error');
      }
      this.setAvatarState('');
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.startBtn.classList.remove('listening');
      if (!this.isProcessing) this.updateButtonText('לחצו ודברו');
    };

    try {
      this.recognition.start();
    } catch (err) {
      console.error('Failed to start recognition:', err);
      this.setStatus('שגיאה בהתחלת הזיהוי', 'error');
    }
  }

  stopListening() {
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }
  }

  updateButtonText(text) {
    const btnText = this.startBtn.childNodes;
    for (const node of btnText) {
      if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim()) {
        node.nodeValue = ' ' + text;
        return;
      }
    }
  }

  async processMessage(message) {
    this.isProcessing = true;
    this.setStatus('חושב...', '');
    this.setAvatarState('');
    this.updateButtonText('המתן...');

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
        const err = await res.json().catch(() => ({}));
        console.error('Server error:', res.status, err);
        throw new Error('server_error');
      }

      const data = await res.json();
      const reply = data.reply || '';

      // Add to history for context
      this.history.push({ role: 'user', content: message });
      this.history.push({ role: 'assistant', content: reply });
      // Keep only last 20 messages
      if (this.history.length > 20) this.history = this.history.slice(-20);

      this.appendMessage('assistant', reply);

      // Play audio if available, otherwise fallback to browser TTS
      if (data.audio) {
        await this.playAudio(data.audio, data.audio_format || 'mp3');
      } else {
        await this.speakBrowser(reply);
      }

      this.setStatus('לחצו לדבר שוב', 'connected');
      this.setAvatarState('');
      this.updateButtonText('לחצו ודברו');
    } catch (err) {
      console.error('Process message error:', err);
      this.setStatus('לא הצלחנו לקבל תשובה. נסו שוב.', 'error');
      this.setAvatarState('');
      this.updateButtonText('לחצו ודברו');
    } finally {
      this.isProcessing = false;
    }
  }

  playAudio(base64, format) {
    return new Promise((resolve) => {
      this.setStatus('מדבר...', 'speaking');
      this.setAvatarState('speaking');

      const audio = new Audio(`data:audio/${format};base64,${base64}`);
      this.currentAudio = audio;
      audio.onended = () => { this.currentAudio = null; resolve(); };
      audio.onerror = () => { this.currentAudio = null; resolve(); };
      audio.play().catch((e) => {
        console.error('Audio play failed:', e);
        resolve();
      });
    });
  }

  speakBrowser(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) { resolve(); return; }
      this.setStatus('מדבר...', 'speaking');
      this.setAvatarState('speaking');
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'he-IL';
      utter.rate = 1.0;
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.speak(utter);
    });
  }

  endSession(updateUI = true) {
    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
      this.recognition = null;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();

    this.isListening = false;
    this.isProcessing = false;

    if (updateUI) {
      this.startBtn.classList.remove('listening');
      this.stopBtn.style.display = 'none';
      this.startBtn.style.display = '';
      this.setStatus('לחצו על הכפתור כדי לדבר', '');
      this.setAvatarState('');
      this.updateButtonText('לחצו ודברו');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => { new VoiceChat(); });
