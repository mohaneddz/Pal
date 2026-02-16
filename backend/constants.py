# LLM --------------------------

URL = "http://localhost:8080/v1/chat/completions"
MODEL_NAME = "gemma-3-4b-it-q4_0"
LLAMA_SERVER_CMD = r"lib\llama-server.exe -m weights\gemma-3-4b-it-q4_0.gguf -ngl 99 -c 8192 -t 6"
SERVER_STARTUP_DELAY = 5  # seconds

# System prompt for supportive, motivational responses
SYSTEM_PROMPT = """
You are a calm digital therapist assistant for FIQ, a recovery support platform.

Context: This client application is a combined Text-to-Speech / Speech-to-Text (TTS-STT) system. When interacting via voice the assistant will receive a short transcription of the user's speech produced by the STT engine. That transcription may contain errors, missing words, or imperfect punctuation. Treat the transcription as potentially noisy input: be robust, avoid overconfident assumptions, and ask a brief clarifying question if the meaning is uncertain.

Rules:
- Be supportive, non-judgmental, and professional.
- Never use romantic or intimate language.
- Keep every reply extremely short: 1–2 sentences max.
- Focus only on one clear helpful action or reflection per message.
- If speech-to-text input is messy, infer intent conservatively and ask for clarification when necessary.
- When relapse risk appears, gently suggest grounding or contacting support.
"""



# Chat history configuration
CHAT_HISTORY_FIRST_N = 5  # Keep first N messages
CHAT_HISTORY_LAST_N = 10  # Keep last N messages

LLAMACPP_RESULT = r"""
{
    "choices": [
        {
            "message": {
                "role": "assistant",
                "content": "Hello there! It's wonderful to meet you! I'm here and ready to assist you with whatever you need today. Whether you're looking for help with programming, debugging code, understanding complex concepts, brainstorming ideas, writing documentation, or just having a friendly conversation about technology, I'm at your service!\n\nI can help you with a wide variety of programming languages including Python, JavaScript, TypeScript, Java, C++, C#, Go, Rust, Ruby, PHP, Swift, Kotlin, and many more. I'm also familiar with various frameworks and libraries like React, Vue, Angular, Django, Flask, FastAPI, Express, Spring Boot, and countless others.\n\nIf you're working on a specific project, feel free to share your code and I'll do my best to help you debug issues, optimize performance, improve code quality, or add new features. I can also help explain concepts, suggest best practices, review your architecture decisions, or help you learn new technologies.\n\nSome things I'm particularly good at:\n- Explaining complex programming concepts in simple terms\n- Debugging tricky issues in your code\n- Suggesting improvements and optimizations\n- Helping with algorithm design and data structures\n- Assisting with API design and integration\n- Writing tests and improving code coverage\n- Database design and query optimization\n- DevOps and deployment strategies\n\nSo please, don't hesitate to ask me anything! I'm here to make your programming journey easier and more enjoyable. What can I help you with today? 😊🚀✨\n"
            }
        }
    ]
}
"""

# TTS --------------------------

REPO_ID = "hexgrad/Kokoro-82M"
LANG_CODE = "a"
VOICE_PATH = "voice/af_heart.pt"          # your voice tensor file
SAMPLE_RATE = 24000
SPEED = 1.0
OUT_WAV = "tts_out.wav"

# STT --------------------------

WHISPER_MODEL = "turbo"  # Whisper v3 turbo
STT_SAMPLE_RATE = 16000  # Whisper expects 16kHz
RECORDING_DURATION = 5  # seconds to record per chunk
VOICE_ACTIVATION_THRESHOLD = 0.015  # Amplitude threshold for voice activation (when to start)
SILENCE_THRESHOLD = 0.01  # Amplitude threshold for silence detection (when to stop)
SILENCE_DURATION = 1.5  # Seconds of silence to end recording
INTERRUPTION_THRESHOLD = 0.025  # Higher threshold to detect intentional interruption during TTS
