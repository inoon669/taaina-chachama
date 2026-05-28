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
      formSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
// וולט — Chatbot for טעינה חכמה
// Streaming chat (SSE) + dynamic quick replies + session history
// =====================
class ChatBot {
  constructor() {
    this.history = [];
    this.streaming = false;
    this.firstOpen = true;

    this.modal = document.getElementById('chatModal');
    this.backdrop = document.getElementById('chatBackdrop');
    this.openBtn = document.getElementById('chatBtn');
    this.closeBtn = document.getElementById('chatClose');
    this.badge = document.getElementById('chatBadge');
    this.messagesEl = document.getElementById('chatMessages');
    this.qrEl = document.getElementById('chatQuickReplies');
    this.formEl = document.getElementById('chatForm');
    this.inputEl = document.getElementById('chatInput');
    this.sendBtn = document.getElementById('chatSend');
    this.contactLink = document.getElementById('chatContactLink');

    this.bindEvents();
    this.loadHistory();
  }

  bindEvents() {
    this.openBtn.addEventListener('click', () => this.open());
    this.closeBtn.addEventListener('click', () => this.close());
    this.backdrop.addEventListener('click', () => this.close());
    this.formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.inputEl.value.trim();
      if (!text || this.streaming) return;
      this.inputEl.value = '';
      this.send(text);
    });
    this.contactLink.addEventListener('click', () => this.close());
  }

  open() {
    this.modal.classList.add('open');
    this.backdrop.classList.add('open');
    requestAnimationFrame(() => {
      this.modal.classList.add('visible');
      this.backdrop.classList.add('visible');
    });
    this.badge.style.display = 'none';

    if (this.firstOpen && this.history.length === 0) {
      this.firstOpen = false;
      this.showWelcome();
    }
    setTimeout(() => this.inputEl.focus(), 350);
  }

  close() {
    this.modal.classList.remove('visible');
    this.backdrop.classList.remove('visible');
    setTimeout(() => {
      this.modal.classList.remove('open');
      this.backdrop.classList.remove('open');
    }, 280);
  }

  // ============== Welcome flow ==============
  showWelcome() {
    this.addMessage('bot', 'היי, אני וולט ⚡ העוזר הדיגיטלי של טעינה חכמה');
    setTimeout(() => {
      this.addMessage('bot', 'אשמח לעזור בכל מה שקשור להתקנת עמדת טעינה לרכב חשמלי. במה אפשר לעזור?');
      this.renderQuickReplies([
        '💰 מחירים והצעה',
        '⚡ אילו עמדות יש?',
        '⏱️ כמה זמן ההתקנה?',
        '📍 אתם מגיעים אליי?',
      ]);
    }, 600);
  }

  // ============== Send ==============
  async send(text) {
    this.addMessage('user', text);
    this.history.push({ role: 'user', content: text });
    this.clearQuickReplies();
    this.streaming = true;
    this.sendBtn.disabled = true;
    this.inputEl.disabled = true;

    const botBubble = this.addMessage('bot', '', true);
    const typingDot = this.addTypingDots(botBubble);

    let aborted = false;
    let buffer = '';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: this.history }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        sseBuf += decoder.decode(value, { stream: true });
        let lineEnd;
        while ((lineEnd = sseBuf.indexOf('\n\n')) >= 0) {
          const event = sseBuf.substring(0, lineEnd).trim();
          sseBuf = sseBuf.substring(lineEnd + 2);
          if (!event.startsWith('data:')) continue;
          try {
            const data = JSON.parse(event.substring(5).trim());
            if (data.type === 'text') {
              if (typingDot && typingDot.parentNode) typingDot.remove();
              buffer += data.content;
              botBubble.querySelector('.chat-bubble-text').textContent = buffer;
              this.scrollToBottom();
            } else if (data.type === 'qr' && Array.isArray(data.replies)) {
              this.renderQuickReplies(data.replies);
            } else if (data.type === 'error') {
              throw new Error(data.message || 'שגיאת שרת');
            } else if (data.type === 'done') {
              if (data.text) {
                this.history.push({ role: 'assistant', content: data.text });
                this.saveHistory();
              }
            }
          } catch (parseErr) {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      aborted = true;
      console.error('Chat error:', err);
      if (typingDot && typingDot.parentNode) typingDot.remove();
      botBubble.querySelector('.chat-bubble-text').textContent =
        'מצטער, חלה תקלה זמנית. נסה שוב או חייג 052-6698059.';
      this.renderQuickReplies(['📞 חייגו לנציג', '💬 WhatsApp']);
    } finally {
      // Mark streaming finished — remove cursor blink
      botBubble.classList.remove('streaming');
      this.streaming = false;
      this.sendBtn.disabled = false;
      this.inputEl.disabled = false;
      this.inputEl.focus();
    }
  }

  // ============== UI helpers ==============
  addMessage(role, text, streaming = false) {
    const msg = document.createElement('div');
    msg.className = `chat-msg chat-msg-${role}` + (streaming ? ' streaming' : '');
    msg.innerHTML = `<div class="chat-bubble"><div class="chat-bubble-text"></div></div>`;
    msg.querySelector('.chat-bubble-text').textContent = text;
    this.messagesEl.appendChild(msg);
    this.scrollToBottom();
    return msg;
  }

  addTypingDots(botBubble) {
    const dots = document.createElement('div');
    dots.className = 'chat-typing';
    dots.innerHTML = '<span></span><span></span><span></span>';
    botBubble.querySelector('.chat-bubble').appendChild(dots);
    return dots;
  }

  renderQuickReplies(replies) {
    this.clearQuickReplies();
    replies.forEach((label) => {
      const btn = document.createElement('button');
      btn.className = 'chat-qr-btn';
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        // Strip emoji prefix when sending to model (cleaner for context)
        const clean = label.replace(/^[\p{Emoji}\s]+/u, '').trim();
        this.send(clean || label);
      });
      this.qrEl.appendChild(btn);
    });
  }

  clearQuickReplies() {
    this.qrEl.innerHTML = '';
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  // ============== Persistence (sessionStorage) ==============
  saveHistory() {
    try {
      sessionStorage.setItem('voltHistory', JSON.stringify(this.history.slice(-20)));
    } catch {}
  }

  loadHistory() {
    try {
      const raw = sessionStorage.getItem('voltHistory');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length > 0) {
          this.history = arr;
          this.firstOpen = false;
          // Replay messages in UI
          arr.forEach((m) => {
            this.addMessage(m.role === 'user' ? 'user' : 'bot', m.content);
          });
        }
      }
    } catch {}
  }
}

document.addEventListener('DOMContentLoaded', () => { new ChatBot(); });
