//! Local speech-to-text: supervises the bundled whisper.cpp server.
//!
//! The frontend POSTs 16 kHz mono WAV to the server's `/inference` endpoint
//! directly (see `src/services/localVoice.ts`) — whisper-server sets
//! `Access-Control-Allow-Origin: *`, and keeping the audio out of the IPC
//! channel avoids copying every recording through a JSON byte array.

use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::server::{backend_path, ServerStatus, SpawnSpec, Supervisor};

const STARTUP_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Default)]
pub struct SttState(Supervisor);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    /// Model file stem inside `backend/whisper/models`.
    pub model: String,
    pub port: u16,
    pub threads: u32,
}

#[tauri::command]
pub async fn local_stt_start(
    app: AppHandle,
    options: StartOptions,
) -> Result<ServerStatus, String> {
    let model = backend_path(&app, &format!("whisper/models/{}.bin", options.model))?;

    // whisper.cpp and llama.cpp ship different ggml builds but identical NVIDIA
    // redistributables, so whisper keeps its own ggml DLLs beside the exe and
    // picks up cudart/cublas from the llama folder via PATH.
    let shared_cuda = backend_path(&app, "lib")?;

    let spec = SpawnSpec {
        exe: "whisper/whisper-server.exe",
        model: options.model.clone(),
        port: options.port,
        args: vec![
            "-m".into(),
            model.display().to_string(),
            "--host".into(),
            "127.0.0.1".into(),
            "--port".into(),
            options.port.to_string(),
            "-t".into(),
            options.threads.to_string(),
        ],
        extra_path: vec![shared_cuda],
        // whisper-server has no /health route; the model-selection page it
        // serves at the root only responds once the model is loaded.
        health_path: "/",
        startup_timeout: STARTUP_TIMEOUT,
    };

    let state = app.state::<SttState>();
    state.0.ensure(&app, spec).await
}

#[tauri::command]
pub fn local_stt_stop(app: AppHandle) -> Result<ServerStatus, String> {
    app.state::<SttState>().0.stop()
}

#[tauri::command]
pub fn local_stt_status(app: AppHandle) -> Result<ServerStatus, String> {
    app.state::<SttState>().0.status()
}

pub fn shutdown(app: &AppHandle) {
    if let Some(state) = app.try_state::<SttState>() {
        let _ = state.0.stop();
    }
}
