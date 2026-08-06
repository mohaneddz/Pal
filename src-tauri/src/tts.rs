//! Local text-to-speech: Kokoro-82M via ONNX Runtime.
//!
//! Unlike the chat and transcription backends, this one runs in-process: the
//! model is small enough that a session load is cheap, and there is no
//! prebuilt Kokoro server to supervise.
//!
//! The pipeline is text -> IPA phonemes -> token ids -> waveform. Kokoro's
//! graph takes phoneme ids, not text, so espeak-ng does grapheme-to-phoneme
//! first. espeak-ng is invoked as a subprocess rather than linked, which keeps
//! the build free of bindgen/libclang for one call per utterance.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, OnceLock};

use ndarray::{Array1, Array2};
use ort::session::Session;
use ort::value::Value;
use tauri::{AppHandle, Manager};

use crate::server::backend_path;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Kokoro emits 24 kHz mono audio.
const SAMPLE_RATE: u32 = 24000;
/// The style tensor has one 256-float row per supported token count.
const STYLE_DIM: usize = 256;
/// Sequence limit baked into the exported graph.
const MAX_TOKENS: usize = 510;

/// Phoneme vocabulary from the model's `tokenizer.json`. Ids are not
/// contiguous — the export keeps gaps — so this is a lookup, not an index.
#[rustfmt::skip]
const VOCAB: &[(char, i64)] = &[
    ('$', 0), (';', 1), (':', 2), (',', 3), ('.', 4), ('!', 5), ('?', 6),
    ('—', 9), ('…', 10), ('"', 11), ('(', 12), (')', 13), ('“', 14), ('”', 15),
    (' ', 16), ('\u{303}', 17), ('ʣ', 18), ('ʥ', 19), ('ʦ', 20), ('ʨ', 21),
    ('ᵝ', 22), ('ꭧ', 23), ('A', 24), ('I', 25), ('O', 31), ('Q', 33), ('S', 35),
    ('T', 36), ('W', 39), ('Y', 41), ('ᵊ', 42), ('a', 43), ('b', 44), ('c', 45),
    ('d', 46), ('e', 47), ('f', 48), ('h', 50), ('i', 51), ('j', 52), ('k', 53),
    ('l', 54), ('m', 55), ('n', 56), ('o', 57), ('p', 58), ('q', 59), ('r', 60),
    ('s', 61), ('t', 62), ('u', 63), ('v', 64), ('w', 65), ('x', 66), ('y', 67),
    ('z', 68), ('ɑ', 69), ('ɐ', 70), ('ɒ', 71), ('æ', 72), ('β', 75), ('ɔ', 76),
    ('ɕ', 77), ('ç', 78), ('ɖ', 80), ('ð', 81), ('ʤ', 82), ('ə', 83), ('ɚ', 85),
    ('ɛ', 86), ('ɜ', 87), ('ɟ', 90), ('ɡ', 92), ('ɥ', 99), ('ɨ', 101),
    ('ɪ', 102), ('ʝ', 103), ('ɯ', 110), ('ɰ', 111), ('ŋ', 112), ('ɳ', 113),
    ('ɲ', 114), ('ɴ', 115), ('ø', 116), ('ɸ', 118), ('θ', 119), ('œ', 120),
    ('ɹ', 123), ('ɾ', 125), ('ɻ', 126), ('ʁ', 128), ('ɽ', 129), ('ʂ', 130),
    ('ʃ', 131), ('ʈ', 132), ('ʧ', 133), ('ʊ', 135), ('ʋ', 136), ('ʌ', 138),
    ('ɣ', 139), ('ɤ', 140), ('χ', 142), ('ʎ', 143), ('ʒ', 147), ('ʔ', 148),
    ('ˈ', 156), ('ˌ', 157), ('ː', 158), ('ʰ', 162), ('ʲ', 164), ('↓', 169),
    ('→', 171), ('↗', 172), ('↘', 173), ('ᵻ', 177),
];

fn vocab() -> &'static HashMap<char, i64> {
    static MAP: OnceLock<HashMap<char, i64>> = OnceLock::new();
    MAP.get_or_init(|| VOCAB.iter().copied().collect())
}

#[derive(Default)]
pub struct TtsState {
    session: Mutex<Option<Session>>,
}

/// Run espeak-ng to convert text into IPA phonemes.
///
/// espeak drops punctuation and breaks clauses onto separate lines. Kokoro
/// wants the punctuation back for prosody, so the caller phonemizes one clause
/// at a time and re-appends the terminator itself.
fn phonemize(exe: &Path, data: &Path, text: &str) -> Result<String, String> {
    let mut command = Command::new(exe);
    command
        .arg("-q")
        .arg("--ipa")
        .arg("-v")
        .arg("en-us")
        .arg("--")
        .arg(text)
        .env("ESPEAK_DATA_PATH", data);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command
        .output()
        .map_err(|error| format!("Failed to run espeak-ng: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "espeak-ng failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }

    // Clause line breaks become spaces; the model treats space as a token.
    let phonemes = String::from_utf8_lossy(&output.stdout);
    Ok(phonemes
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" "))
}

/// Split text into clauses small enough to stay under the token limit, keeping
/// each terminator so it can be fed back in as a prosody token.
fn split_clauses(text: &str) -> Vec<String> {
    let mut clauses = Vec::new();
    let mut current = String::new();

    for ch in text.chars() {
        current.push(ch);
        if matches!(ch, '.' | '!' | '?' | ';' | '\n') && current.trim().len() > 1 {
            clauses.push(current.trim().to_string());
            current.clear();
        }
    }
    if !current.trim().is_empty() {
        clauses.push(current.trim().to_string());
    }
    if clauses.is_empty() {
        clauses.push(text.trim().to_string());
    }
    clauses
}

/// Map phonemes to ids, dropping anything outside the model's vocabulary.
/// Kokoro expects the sequence wrapped in the padding token (id 0).
fn tokenize(phonemes: &str) -> Vec<i64> {
    let map = vocab();
    let mut tokens = Vec::with_capacity(phonemes.len() + 2);
    tokens.push(0);
    for ch in phonemes.chars() {
        if let Some(&id) = map.get(&ch) {
            tokens.push(id);
        }
    }
    tokens.push(0);
    tokens
}

/// Load the style vector for a voice at the row matching this token count.
///
/// Voice packs are `[510, 1, 256]` f32: Kokoro conditions on utterance length,
/// so the row index is the number of tokens being synthesized.
fn load_style(path: &PathBuf, token_count: usize) -> Result<Vec<f32>, String> {
    let bytes = std::fs::read(path)
        .map_err(|error| format!("Failed to read voice {}: {error}", path.display()))?;

    let row = token_count.min(MAX_TOKENS - 1);
    let offset = row * STYLE_DIM * 4;
    if bytes.len() < offset + STYLE_DIM * 4 {
        return Err(format!(
            "Voice file {} is shorter than expected ({} bytes).",
            path.display(),
            bytes.len()
        ));
    }

    Ok(bytes[offset..offset + STYLE_DIM * 4]
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect())
}

/// Encode mono f32 samples as 16-bit PCM WAV.
fn encode_wav(samples: &[f32], sample_rate: u32) -> Vec<u8> {
    let data_len = samples.len() * 2;
    let mut out = Vec::with_capacity(44 + data_len);

    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len as u32).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // PCM chunk size
    out.extend_from_slice(&1u16.to_le_bytes()); // format: PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // channels
    out.extend_from_slice(&sample_rate.to_le_bytes());
    out.extend_from_slice(&(sample_rate * 2).to_le_bytes()); // byte rate
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&(data_len as u32).to_le_bytes());

    for &sample in samples {
        let clamped = sample.clamp(-1.0, 1.0);
        let scaled = if clamped < 0.0 {
            clamped * 32768.0
        } else {
            clamped * 32767.0
        };
        out.extend_from_slice(&(scaled as i16).to_le_bytes());
    }

    out
}

/// Run one clause through the model.
fn synthesize_clause(
    session: &mut Session,
    tokens: &[i64],
    style: &[f32],
    speed: f32,
) -> Result<Vec<f32>, String> {
    let input_ids = Array2::from_shape_vec((1, tokens.len()), tokens.to_vec())
        .map_err(|error| format!("Bad token shape: {error}"))?;
    let style_tensor = Array2::from_shape_vec((1, STYLE_DIM), style.to_vec())
        .map_err(|error| format!("Bad style shape: {error}"))?;
    let speed_tensor = Array1::from_vec(vec![speed]);

    let outputs = session
        .run(ort::inputs![
            "input_ids" => Value::from_array(input_ids).map_err(|e| e.to_string())?,
            "style" => Value::from_array(style_tensor).map_err(|e| e.to_string())?,
            "speed" => Value::from_array(speed_tensor).map_err(|e| e.to_string())?,
        ])
        .map_err(|error| format!("Kokoro inference failed: {error}"))?;

    let (_, audio) = outputs["waveform"]
        .try_extract_tensor::<f32>()
        .map_err(|error| format!("Unexpected Kokoro output: {error}"))?;

    Ok(audio.to_vec())
}

#[tauri::command]
pub async fn local_tts_synthesize(
    app: AppHandle,
    text: String,
    voice: String,
    speed: f32,
) -> Result<Vec<u8>, String> {
    // Reject path separators: `voice` reaches the filesystem as a filename.
    if voice.is_empty() || voice.contains(['/', '\\', '.', ':']) {
        return Err(format!("Invalid voice id: {voice}"));
    }

    let voice_path = backend_path(&app, &format!("tts/voices/{voice}.bin"))?;
    let model_path = backend_path(&app, "tts/kokoro-v1.0.onnx")?;
    let espeak_exe = backend_path(&app, "tts/espeak/espeak-ng.exe")?;
    let espeak_data = backend_path(&app, "tts/espeak/espeak-ng-data")?;

    let mut clauses = Vec::new();
    for clause in split_clauses(&text) {
        let phonemes = phonemize(&espeak_exe, &espeak_data, &clause)?;
        let tokens = tokenize(&phonemes);
        // 2 of the tokens are padding; skip clauses with no pronounceable content.
        if tokens.len() <= 2 {
            continue;
        }
        clauses.push(tokens);
    }

    if clauses.is_empty() {
        return Ok(encode_wav(&[], SAMPLE_RATE));
    }

    let state = app.state::<TtsState>();
    let mut guard = state
        .session
        .lock()
        .map_err(|_| "TTS state poisoned".to_string())?;

    if guard.is_none() {
        let session = Session::builder()
            .map_err(|error| format!("Failed to create ONNX session builder: {error}"))?
            .commit_from_file(&model_path)
            .map_err(|error| format!("Failed to load Kokoro model: {error}"))?;
        *guard = Some(session);
    }
    let session = guard.as_mut().expect("session initialized above");

    let mut samples: Vec<f32> = Vec::new();
    for tokens in clauses {
        // Over-long clauses would be truncated by the graph; split them instead.
        for chunk in tokens.chunks(MAX_TOKENS) {
            let style = load_style(&voice_path, chunk.len())?;
            samples.extend(synthesize_clause(session, chunk, &style, speed)?);
        }
    }

    Ok(encode_wav(&samples, SAMPLE_RATE))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Repo-relative backend payload; these tests exercise the real model, so
    /// they are ignored unless `backend/tts` has been populated by
    /// `scripts/fetch-backend.ps1`.
    fn asset(relative: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("repo root")
            .join("backend")
            .join(relative)
    }

    fn assets_present() -> bool {
        asset("tts/kokoro-v1.0.onnx").exists() && asset("tts/espeak/espeak-ng.exe").exists()
    }

    #[test]
    fn tokenize_wraps_in_padding_and_drops_unknown_chars() {
        // `#` is not in the vocabulary and must be dropped, not mapped.
        let tokens = tokenize("h#i");
        assert_eq!(tokens.first(), Some(&0));
        assert_eq!(tokens.last(), Some(&0));
        assert_eq!(tokens, vec![0, 50, 51, 0]);
    }

    #[test]
    fn split_clauses_keeps_terminators() {
        let clauses = split_clauses("Hello there. How are you? Fine!");
        assert_eq!(clauses, vec!["Hello there.", "How are you?", "Fine!"]);
    }

    #[test]
    fn split_clauses_handles_text_without_punctuation() {
        assert_eq!(split_clauses("no terminator here"), vec!["no terminator here"]);
    }

    #[test]
    fn encode_wav_writes_a_parseable_header() {
        let wav = encode_wav(&[0.0, 1.0, -1.0], SAMPLE_RATE);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(wav.len(), 44 + 3 * 2);
        // Full-scale positive and negative samples must not wrap around.
        assert_eq!(i16::from_le_bytes([wav[46], wav[47]]), 32767);
        assert_eq!(i16::from_le_bytes([wav[48], wav[49]]), -32768);
    }

    #[test]
    fn style_row_tracks_token_count() {
        if !assets_present() {
            return;
        }
        let voice = asset("tts/voices/af_heart.bin");
        let short = load_style(&voice, 5).expect("short style");
        let long = load_style(&voice, 100).expect("long style");
        assert_eq!(short.len(), STYLE_DIM);
        assert_eq!(long.len(), STYLE_DIM);
        // Kokoro conditions on utterance length, so rows must actually differ.
        assert_ne!(short, long);
    }

    #[test]
    fn espeak_emits_only_known_phonemes() {
        if !assets_present() {
            return;
        }
        let phonemes = phonemize(
            &asset("tts/espeak/espeak-ng.exe"),
            &asset("tts/espeak/espeak-ng-data"),
            "Hello, how are you today?",
        )
        .expect("phonemize");

        assert!(!phonemes.is_empty());
        let unknown: Vec<char> = phonemes
            .chars()
            .filter(|c| !vocab().contains_key(c))
            .collect();
        assert!(unknown.is_empty(), "unmapped phonemes from espeak: {unknown:?}");
    }

    /// Not part of the suite: writes a WAV so the voice can be listened to.
    /// `cargo test --lib dump_sample_wav -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn dump_sample_wav() {
        if !assets_present() {
            return;
        }
        let text = "Hey, I'm Pal. I'm running completely on your machine now                     -- no cloud, no API key. What can I help you with?";
        let phonemes = phonemize(
            &asset("tts/espeak/espeak-ng.exe"),
            &asset("tts/espeak/espeak-ng-data"),
            text,
        )
        .expect("phonemize");
        let tokens = tokenize(&phonemes);
        let style = load_style(&asset("tts/voices/af_heart.bin"), tokens.len()).expect("style");
        let mut session = Session::builder()
            .expect("builder")
            .commit_from_file(asset("tts/kokoro-v1.0.onnx"))
            .expect("load model");
        let samples = synthesize_clause(&mut session, &tokens, &style, 1.0).expect("synthesize");
        let out = std::env::var("PAL_TTS_SAMPLE_OUT").unwrap_or_else(|_| "kokoro-sample.wav".into());
        std::fs::write(&out, encode_wav(&samples, SAMPLE_RATE)).expect("write wav");
        println!(
            "wrote {out} ({:.2}s, {} phonemes)",
            samples.len() as f32 / SAMPLE_RATE as f32,
            tokens.len()
        );
    }

    #[test]
    fn synthesizes_audio_of_plausible_duration() {
        if !assets_present() {
            return;
        }
        let phonemes = phonemize(
            &asset("tts/espeak/espeak-ng.exe"),
            &asset("tts/espeak/espeak-ng-data"),
            "Hello, I am Pal, your local assistant.",
        )
        .expect("phonemize");
        let tokens = tokenize(&phonemes);
        let style = load_style(&asset("tts/voices/af_heart.bin"), tokens.len()).expect("style");

        let mut session = Session::builder()
            .expect("builder")
            .commit_from_file(asset("tts/kokoro-v1.0.onnx"))
            .expect("load model");

        let samples = synthesize_clause(&mut session, &tokens, &style, 1.0).expect("synthesize");

        let seconds = samples.len() as f32 / SAMPLE_RATE as f32;
        assert!(
            (1.0..8.0).contains(&seconds),
            "expected a few seconds of speech, got {seconds:.2}s"
        );
        // Silence would mean the style/token wiring is wrong even if shapes fit.
        let peak = samples.iter().fold(0f32, |acc, s| acc.max(s.abs()));
        assert!(peak > 0.05, "output is effectively silent (peak {peak})");
    }
}
