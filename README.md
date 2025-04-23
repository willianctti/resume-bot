# Discord Voice Summary Bot

A Discord bot that joins voice channels, transcribes conversations, and generates AI-powered summaries of meetings.

## Features

- 🎙️ Real-time voice capture in Discord voice channels
- 🔊 Speech-to-text transcription using OpenAI Whisper
- 🧠 AI-powered summary generation using GPT-4
- 📝 Formatted meeting minutes and key points
- 🔐 Privacy-focused with admin controls

## Prerequisites

- Node.js 16.9.0 or higher
- FFmpeg
- Discord Bot Token
- OpenAI API Key

## Installation

1. Clone the repository
```bash
git clone [repository-url]
cd resume-bot
```

2. Install dependencies
```bash
npm install
```

3. Create a .env file with your credentials
```bash
DISCORD_TOKEN=your_discord_bot_token
OPENAI_API_KEY=your_openai_api_key
```

4. Start the bot
```bash
npm run dev
```

## Commands

- `/resumir iniciar` - Bot joins the voice channel
- `/resumir parar` - Bot leaves and processes the recording
- `/resumir enviar-para: #canal` - Set output channel
- `/resumir modo: simples|detalhado|tópicos` - Set summary type

## Project Structure

```
resume-bot/
├── src/
│   ├── commands/         # Bot commands
│   ├── events/          # Discord event handlers
│   ├── services/        # Core services (audio, AI, etc.)
│   ├── utils/           # Utility functions
│   └── index.js         # Main entry point
├── config/              # Configuration files
├── tests/              # Test files
└── temp/               # Temporary audio files
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details. 