# 🎙️ Voice AI Agent — OpenAI Realtime + WebRTC

סוכן AI קולי בזמן אמת. המשתמש נכנס לאתר, לוחץ על מיקרופון, ומדבר בשיחה טבעית עם הסוכן.

---

## 🏗️ ארכיטקטורה

```
┌──────────────┐    ① GET /api/session       ┌─────────────┐    ② sessions API   ┌──────────┐
│   Browser    │ ─────────────────────────▶ │   FastAPI   │ ──────────────────▶ │  OpenAI  │
│  (JS/WebRTC) │ ◀───────────────────────── │   Backend   │ ◀────────────────── │ Realtime │
└──────┬───────┘  ephemeral client_secret    └─────────────┘   ephemeral token   └──────────┘
       │
       │  ③ SDP offer (with Bearer = ephemeral token)
       └─────────────────────────────────────────────────────────────────────────▶ OpenAI
                                                                                     ▲
                                                                                     │
       ◀────────────────  WebRTC audio + data channel events  ────────────────────────
```

- ה-**API key המלא של OpenAI נמצא רק בשרת**.
- הדפדפן מקבל **token זמני** שתקף כ-60 שניות.
- ה-WebRTC זורם **ישירות בין הדפדפן ל-OpenAI** = latency הכי נמוך אפשרי.

---

## 📁 מבנה תיקיות

```
voice-ai-agent/
├── backend/
│   ├── main.py                    # FastAPI entry point
│   ├── config.py                  # .env loader
│   ├── routes/
│   │   └── realtime.py            # /api/session, /api/health
│   ├── services/
│   │   ├── openai_client.py       # יוצר session ב-OpenAI
│   │   └── voice_provider.py      # שכבת הפשטה לקול (OpenAI / ElevenLabs בעתיד)
│   ├── prompts/
│   │   └── system_prompt.py       # 👈 ערוך כאן את אופי הסוכן
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html
│   ├── app.js                     # WebRTC client + ניהול אירועים
│   └── styles.css
└── README.md
```

---

## ⚡ הרצה מהירה

### 1. הכנת הסביבה

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### 2. הגדרת המפתח

```bash
copy .env.example .env       # Windows
cp .env.example .env         # Mac/Linux
```

ערוך את `.env` והכנס את ה-`OPENAI_API_KEY` שלך.

### 3. הפעלה

```bash
python main.py
```

פתח [http://localhost:8000](http://localhost:8000) — לחץ על המיקרופון ודבר 🎤

---

## 🎛️ התאמות

### החלפת השפה של הסוכן
ערוך `backend/prompts/system_prompt.py`.

### החלפת הקול
ב-`.env`:
```
OPENAI_VOICE=shimmer
# אפשרויות: alloy, ash, ballad, coral, echo, sage, shimmer, verse
```

### שינוי המודל
```
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview-2024-12-17
# חלופה זולה יותר: gpt-4o-mini-realtime-preview-2024-12-17
```

### שינוי מהירות התגובה (turn detection)
ערוך ב-`backend/services/openai_client.py`:
```python
"silence_duration_ms": 500,  # פחות = תגובה מהירה יותר; יותר = פחות הפרעות
```

---

## 🔄 מעבר ל-ElevenLabs בעתיד

המערכת מוכנה לזה כבר עכשיו. ב-`.env`:
```
VOICE_PROVIDER=elevenlabs
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
```

מה שצריך לעשות:
1. ב-`backend/services/voice_provider.py` — לממש את `stream_elevenlabs_tts()`
2. להוסיף route חדש `/api/tts` שמקבל טקסט ומחזיר audio stream
3. בצד הלקוח — להאזין ל-`response.text.delta` (במקום `response.audio_transcript.delta`) ולשלוח את הטקסט ל-`/api/tts`

המבנה שלי כבר מפצל את זה דרך `get_session_modalities()` שמחזיר `['text']` במצב ElevenLabs.

---

## 🔧 פתרון בעיות נפוצות

### ❌ `beta_api_shape_disabled`
החשבון שלך ב-OpenAI לא מורשה ל-Realtime API. סיבות אפשריות:
- **Usage Tier** נמוך מדי (פחות מ-$5 הוצאה) → בדוק ב-[Limits](https://platform.openai.com/settings/organization/limits)
- **Organization Verification** חסר → בדוק ב-[Settings](https://platform.openai.com/settings/organization/general)
- **API key מוגבל** — צור מפתח עם scope "All"

### ❌ "Permission denied" / לא ניתן לגשת למיקרופון
- ודא שהאתר רץ ב-HTTPS או localhost (Web Audio דורש הקשר מאובטח)
- בדוק את הרשאות המיקרופון של הדפדפן

### ❌ "Connection failed"
- בעיית רשת או firewall חוסם UDP
- נסה רשת אחרת

---

## 💰 עלויות

- **Realtime API** (gpt-4o-realtime): ~$0.06/דקה audio in, ~$0.24/דקה audio out
- **Mini variant**: כעשירית מהמחיר

מומלץ להוסיף timeout/מגבלה על אורך השיחה ב-production.
