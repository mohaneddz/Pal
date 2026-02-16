import requests
import json
import subprocess
import time
import os
import re
import warnings
import sys
import numpy as np
import torch
import sounddevice as sd
from kokoro import KPipeline
from constants import (
    URL, MODEL_NAME, REPO_ID, LANG_CODE, VOICE_PATH, 
    SAMPLE_RATE, SPEED, SYSTEM_PROMPT, LLAMA_SERVER_CMD,
    SERVER_STARTUP_DELAY, CHAT_HISTORY_FIRST_N, CHAT_HISTORY_LAST_N,
    INTERRUPTION_THRESHOLD, STT_SAMPLE_RATE, VOICE_ACTIVATION_THRESHOLD, SILENCE_THRESHOLD, SILENCE_DURATION
)
from stt import initialize_stt, listen, start_continuous_listening, stop_continuous_listening, listen_continuous, get_continuous_listener

# Suppress warnings
warnings.filterwarnings('ignore', category=UserWarning)
warnings.filterwarnings('ignore', category=FutureWarning)

# Chat history management
chat_history = []

def clean_text_for_tts(text: str) -> str:
    """Remove all markdown symbols and emojis for TTS."""
    # Remove emojis and non-BMP symbols
    text = re.sub(r"[\U00010000-\U0010ffff]", "", text)
    # Remove common emojis in BMP range
    text = re.sub(r"[\u2600-\u26FF\u2700-\u27BF\u1F300-\u1F5FF\u1F600-\u1F64F\u1F680-\u1F6FF\u1F900-\u1F9FF]", "", text)
    
    # Remove markdown formatting
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)  # Bold **text**
    text = re.sub(r"\*([^*]+)\*", r"\1", text)      # Italic *text*
    text = re.sub(r"__([^_]+)__", r"\1", text)      # Bold __text__
    text = re.sub(r"_([^_]+)_", r"\1", text)        # Italic _text_
    text = re.sub(r"~~([^~]+)~~", r"\1", text)      # Strikethrough ~~text~~
    text = re.sub(r"`([^`]+)`", r"\1", text)        # Inline code `text`
    text = re.sub(r"```[\s\S]*?```", "", text)      # Code blocks
    text = re.sub(r"^#+\s*", "", text, flags=re.MULTILINE)  # Headers
    text = re.sub(r"^[*\-+]\s+", "", text, flags=re.MULTILINE)  # Bullet lists
    text = re.sub(r"^\d+\.\s+", "", text, flags=re.MULTILINE)  # Numbered lists
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)  # Links [text](url)
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)  # Images ![alt](url)
    text = re.sub(r"^>+\s*", "", text, flags=re.MULTILINE)  # Blockquotes
    text = re.sub(r"---+", "", text)  # Horizontal rules
    
    return text.strip()

def extract_text(llm_json: str) -> str:
    data = json.loads(llm_json)
    text = data["choices"][0]["message"]["content"]
    return clean_text_for_tts(text)

# Global pipeline and voice for faster reuse
_tts_pipeline = None
_tts_voice = None

def initialize_tts():
    """Initialize TTS pipeline and voice (one-time setup)."""
    global _tts_pipeline, _tts_voice
    if _tts_pipeline is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"TTS using: {device.upper()}")
        _tts_pipeline = KPipeline(lang_code=LANG_CODE, repo_id=REPO_ID)
        _tts_voice = torch.load(VOICE_PATH, map_location=device)

def play_tts(text: str):
    """Generate and play TTS audio directly without saving to file."""
    if not text:
        return 0, False, []
    
    initialize_tts()
    
    chunks: list[np.ndarray] = []
    for _, _, audio in _tts_pipeline(text, voice=_tts_voice, speed=SPEED):
        if isinstance(audio, torch.Tensor):
            a = audio.detach().cpu().numpy().astype(np.float32)
        else:
            a = np.asarray(audio, dtype=np.float32)
        chunks.append(a)
    
    if chunks:
        wav = np.concatenate(chunks)
        # Play directly using sounddevice (blocking)
        sd.play(wav, SAMPLE_RATE, blocking=True)
        # Ensure playback is fully stopped
        sd.stop()
        return len(wav) / SAMPLE_RATE, False, []
    return 0, False, []


def play_tts_interruptible(text: str):
    """
    Generate and play TTS audio with interruption detection.
    Returns: (duration, was_interrupted, interruption_audio_chunks)
    """
    if not text:
        return 0, False, []
    
    initialize_tts()
    
    # Generate all audio first
    chunks: list[np.ndarray] = []
    for _, _, audio in _tts_pipeline(text, voice=_tts_voice, speed=SPEED):
        if isinstance(audio, torch.Tensor):
            a = audio.detach().cpu().numpy().astype(np.float32)
        else:
            a = np.asarray(audio, dtype=np.float32)
        chunks.append(a)
    
    if not chunks:
        return 0, False, []
    
    wav = np.concatenate(chunks)
    total_duration = len(wav) / SAMPLE_RATE
    
    # Variables for interruption detection
    was_interrupted = False
    interruption_chunks = []
    playback_position = 0
    chunk_size = int(0.05 * STT_SAMPLE_RATE)  # 50ms chunks for monitoring
    
    # Callback to monitor microphone during playback
    def mic_callback(indata, frames, time_info, status):
        nonlocal was_interrupted, interruption_chunks
        if not was_interrupted:
            audio_level = np.abs(indata).mean()
            if audio_level > INTERRUPTION_THRESHOLD:
                was_interrupted = True
                print("\n⚡ Interrupted! Listening to you...")
                sd.stop()  # Stop TTS playback immediately
        
        # If interrupted, capture the user's speech
        if was_interrupted:
            interruption_chunks.append(indata.copy())
    
    # Start microphone monitoring
    mic_stream = sd.InputStream(
        samplerate=STT_SAMPLE_RATE,
        channels=1,
        dtype='float32',
        blocksize=chunk_size,
        callback=mic_callback
    )
    
    try:
        mic_stream.start()
        
        # Play audio (non-blocking so we can monitor)
        sd.play(wav, SAMPLE_RATE)
        
        # Wait for playback to finish or interruption
        while sd.get_stream().active and not was_interrupted:
            sd.sleep(50)  # Check every 50ms
        
        # If interrupted, continue listening until silence
        if was_interrupted:
            silence_counter = 0
            silence_samples = int(SILENCE_DURATION * STT_SAMPLE_RATE)
            speech_started = True  # Already started since we detected voice
            
            # Continue recording until silence
            while silence_counter < silence_samples:
                sd.sleep(50)
                
                if interruption_chunks:
                    latest_chunk = interruption_chunks[-1]
                    audio_level = np.abs(latest_chunk).mean()
                    
                    if audio_level < SILENCE_THRESHOLD:
                        silence_counter += len(latest_chunk)
                    else:
                        silence_counter = 0
                
                # Safety limit
                total_interrupt_samples = sum(len(c) for c in interruption_chunks)
                if total_interrupt_samples > 30 * STT_SAMPLE_RATE:  # Max 30 seconds
                    break
            
            print("Recording finished.")
        
        sd.stop()
        
    finally:
        mic_stream.stop()
        mic_stream.close()
    
    actual_duration = total_duration if not was_interrupted else (playback_position / SAMPLE_RATE)
    return actual_duration, was_interrupted, interruption_chunks

def manage_chat_history(history: list) -> list:
    """
    Keep only the first N messages and the last N messages.
    This maintains context while preventing the history from growing too large.
    """
    total_to_keep = CHAT_HISTORY_FIRST_N + CHAT_HISTORY_LAST_N
    if len(history) <= total_to_keep:
        return history
    
    # Keep first N and last N messages
    first_n = history[:CHAT_HISTORY_FIRST_N]
    last_n = history[-CHAT_HISTORY_LAST_N:]
    return first_n + last_n

def send_message(message: str) -> str:
    global chat_history
    
    # Add user message to history
    chat_history.append({"role": "user", "content": message})
    
    # Manage history size
    chat_history = manage_chat_history(chat_history)
    
    # Build messages with system prompt
    messages = [{"role": "system", "content": SYSTEM_PROMPT}] + chat_history
    
    payload = {
        "model": MODEL_NAME,
        "messages": messages,
        "stream": False
    }
    response = requests.post(URL, json=payload)
    if response.status_code == 200:
        response_text = response.json()["choices"][0]["message"]["content"]
        # Add assistant response to history
        chat_history.append({"role": "assistant", "content": response_text})
        # Manage history size again after adding assistant response
        chat_history = manage_chat_history(chat_history)
        return response_text
    else:
        return f"Error: {response.status_code} {response.text}"

def main():
    # Parse command line arguments
    mode = "voice" if len(sys.argv) > 1 and sys.argv[1] == "voice" else "text"
    
    # Start the llama-server
    print("Starting llama-server...")
    server_process = subprocess.Popen(
        LLAMA_SERVER_CMD, 
        shell=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    time.sleep(SERVER_STARTUP_DELAY)  # Wait for server to start

    # Pre-initialize TTS for lower latency on first use
    print("Initializing TTS...")
    initialize_tts()

    if mode == "voice":
        print("Initializing STT...")
        initialize_stt()
        voice_conversation_mode()
    else:
        text_conversation_mode()
    
    # Stop server
    server_process.terminate()
    print("Server stopped.")

def text_conversation_mode():
    """Text-based conversation mode."""
    print("CLI Interface Mode")
    print("Type your messages. Type 'exit' to quit.")

    while True:
        user_input = input("You: ")
        if user_input.lower() == 'exit':
            break

        # Send to LLM
        start_time = time.time()
        response_text = send_message(user_input)
        llm_time = time.time() - start_time
        print(f"AI: {response_text}")
        print(f"LLM response time: {llm_time:.2f}s")

        # TTS and play directly
        tts_start = time.time()
        dur, _, _ = play_tts(response_text)
        tts_time = time.time() - tts_start - dur  # Subtract audio duration to get processing time
        print(f"TTS processing: {tts_time:.2f}s, Audio duration: {dur:.2f}s")

def voice_conversation_mode():
    """Voice-based conversation mode with continuous listening and interruption support."""
    print("\n=== Voice Conversation Mode ===")
    print("I'm always listening. Just start speaking!")
    print("You can interrupt me anytime while I'm talking.")
    print("Say 'exit', 'quit', or 'stop' to end the conversation.")
    print("Press Ctrl+C to exit.\n")

    # Start continuous listening
    start_continuous_listening()
    pending_interruption_audio = None  # Audio captured from interruption

    try:
        while True:
            # Listen for user input (use interruption audio if we have it)
            if pending_interruption_audio:
                user_text = listen_continuous(initial_audio=pending_interruption_audio)
                pending_interruption_audio = None
            else:
                user_text = listen_continuous()
            
            if not user_text:
                # No speech detected, just keep listening
                continue
            
            print(f"You: {user_text}")
            
            # Check for exit command
            if "exit" in user_text.lower() or "quit" in user_text.lower() or "stop" in user_text.lower():
                print("Goodbye! Take care of yourself. 💙")
                break
            
            # Send to LLM
            start_time = time.time()
            response_text = send_message(user_text)
            llm_time = time.time() - start_time
            print(f"AI: {response_text}")
            print(f"LLM response time: {llm_time:.2f}s")
            
            # TTS with interruption detection
            tts_start = time.time()
            dur, was_interrupted, interrupt_audio = play_tts_interruptible(response_text)
            tts_time = time.time() - tts_start - dur
            
            if was_interrupted:
                print(f"(Interrupted after {dur:.2f}s)")
                # Store the interruption audio to use as the next input
                pending_interruption_audio = interrupt_audio
            else:
                print(f"TTS processing: {tts_time:.2f}s, Audio duration: {dur:.2f}s\n")
            
            # Loop continues - either processes interruption or waits for new speech
    
    except KeyboardInterrupt:
        print("\nExiting voice mode...")
    finally:
        stop_continuous_listening()

if __name__ == "__main__":
    main()
