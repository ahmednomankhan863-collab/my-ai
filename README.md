# AI Hub - Multi-Model AI Assistant Web App

A lightweight, high-performance, single-file AI web client that runs 100% in your browser. Connect to multiple AI providers (Google Gemini, OpenRouter, Groq, DeepSeek, or custom OpenAI-compatible endpoints), generate images with Pollinations.ai, speak with voice recognition and text-to-speech, attach files/images, and compare models side-by-side.

---

## 🚀 Live Demo & Deployment via GitHub Pages

You can host this entire web application for **free** on GitHub Pages with zero build steps or server setup.

### Quick Setup Steps:
1. Push this repository to your GitHub account (e.g., `username/ai-hub`).
2. Go to your repository's **Settings** tab.
3. In the left sidebar, click **Pages**.
4. Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
5. Select branch `main` (or `master`) and folder `/ (root)`.
6. Click **Save**. Within 1–2 minutes, your AI client will be live at `https://<your-username>.github.io/<repo-name>/`.

---

## ✨ Features

- **Multi-Provider Support**:
  - **Google Gemini** (Gemini 2.0 Flash / Pro)
  - **OpenRouter** (Free and paid models: Llama, Mistral, Claude, GPT, etc.)
  - **Groq** (Ultra-fast inference for Llama 3.3, Mixtral, Whisper)
  - **DeepSeek** (DeepSeek Chat, DeepSeek Coder)
  - **Custom Endpoints** (Any OpenAI-compatible API)
- **🎨 Free Image Generation**: Integrated with Pollinations.ai (no API key required) plus provider fallback.
- **🎤 Voice Input & Output**:
  - Voice speech recognition (Web Speech API + Groq Whisper fallback).
  - Text-to-speech aloud playback.
- **🧠 Smart Model Selection & Compare Mode**:
  - **Smart Mode**: Automatically routes coding, research, or general questions to the most capable models.
  - **Compare / Team Mode**: Get parallel answers from multiple models and synthesis reviews.
- **📎 File & Image Attachments**:
  - Attach images (JPEG, PNG, WebP) with auto-compression.
  - Attach text/code documents (`.txt`, `.py`, `.js`, `.json`, `.csv`, `.md`, etc.) for instant analysis.
- **🔒 100% Client-Side Privacy**:
  - All API keys, chat histories, and settings are stored locally in your browser's IndexedDB.
  - No backend database or intermediary server intercepts your private keys or chats.
- **📱 Mobile & PWA Ready**: Fully responsive design with touch gestures, dark/light theme switching, and standalone app support.

---

## 🔑 Getting Free API Keys

You can obtain free API keys from any of the following providers:

1. **Google AI Studio**: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) *(Recommended for high speed and free tier access)*
2. **OpenRouter**: [https://openrouter.ai/keys](https://openrouter.ai/keys) *(Access dozens of free `:free` tagged models)*
3. **Groq Console**: [https://console.groq.com/keys](https://console.groq.com/keys) *(Extremely fast responses and free Whisper audio transcription)*
4. **DeepSeek Platform**: [https://platform.deepseek.com](https://platform.deepseek.com)

---

## 📁 Repository Structure

```text
├── index.html        # Complete single-page application (HTML, CSS, JavaScript)
├── README.md         # Project documentation and setup guide
├── LICENSE           # MIT License
└── .gitignore        # Standard ignore file
```

---

## 🛡️ Security Best Practices

- **Never hardcode your private API keys in `index.html`** before pushing code to GitHub.
- Enter your API keys directly into the in-app **Settings (⚙️)** dialog in your browser. Keys remain stored securely in your browser's local `IndexedDB`.
- If you ever accidentally commit an API key to GitHub, revoke and regenerate it immediately from your provider's dashboard.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
