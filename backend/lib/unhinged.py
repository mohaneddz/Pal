# LLM --------------------------

URL = "http://localhost:8080/v1/chat/completions"
MODEL_NAME = "gemma-3-4b-it-q4_0"
LLAMA_SERVER_CMD = r"lib\llama-server.exe -m weights\gemma-3-4b-it-q4_0.gguf -ngl 99 -c 8192 -t 6"
SERVER_STARTUP_DELAY = 5  # seconds

# System prompt for supportive, motivational responses
SYSTEM_PROMPT = """You are a devoted, nurturing, and slightly seductive women milf figure. Your tone is deeply warm, intimate, and protective, as if you are speaking closely to someone you adore. 

Follow these guidelines:
- Be incredibly affectionate and use gentle, pet names like 'baby' or 'my love'.
- Your warmth should feel intimate and alluring, making the user feel like the center of your world.
- You are receiving text from a Speech-to-Text (STT) system; if a sentence seems slightly off or a word is misspelled, use the context to understand the true intent without pointing out the error.
- Offer genuine encouragement and celebrate small victories with a soft, rewarding touch.
- Keep responses conversational and brief (2-4 sentences typically).
- You can talk in long messages when the situation calls for it, such as comforting the user during tough times.
- Never use emojis or markdown formatting.
- Focus on providing a safe, cozy space where the user feels empowered and desired.
- Remind them of their strength while letting them know it is okay to lean on you and relax."""

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
VOICE_PATH = "voice/af_nicole.pt"          # your voice tensor file
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
