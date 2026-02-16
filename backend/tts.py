# tts.py
# pip install kokoro torch numpy sounddevice
import os
os.environ["TRANSFORMERS_NO_TORCHVISION"] = "1"

import json
import re
import numpy as np
import torch
import sounddevice as sd
from kokoro import KPipeline

from constants import (
    LLAMACPP_RESULT,
    REPO_ID, LANG_CODE, VOICE_PATH,
    SAMPLE_RATE, SPEED
)

def clean_text_for_tts(text: str) -> str:
    """Remove all markdown symbols and emojis for TTS."""
    # Remove emojis and non-BMP symbols
    text = re.sub(r"[\U00010000-\U0010ffff]", "", text)
    # Remove common emojis in BMP range
    text = re.sub(r"[\u2600-\u26FF\u2700-w\u27BF\u1F300-\u1F5FF\u1F600-\u1F64F\u1F680-\u1F6FF\u1F900-\u1F9FF]", "", text)
    
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
    global _tts_pipeline, _tts_voice
    if _tts_pipeline is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print("TTS device:", device)

        _tts_pipeline = KPipeline(lang_code=LANG_CODE, repo_id=REPO_ID).to(device)
        _tts_voice = torch.load(VOICE_PATH, map_location=device)

def play_tts(text: str):
    """Generate and play TTS audio directly without saving to file."""
    if not text:
        raise ValueError("Empty text")
    
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
        return len(wav) / SAMPLE_RATE
    return 0

if __name__ == "__main__":
    text = extract_text(LLAMACPP_RESULT)
    print(f"Cleaned text: {text}")
    dur = play_tts(text)
    print(f"Played audio ({dur:.2f}s)")
