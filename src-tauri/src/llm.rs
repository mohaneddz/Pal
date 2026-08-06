//! Local chat: supervises the bundled llama.cpp server running Gemma 3.
//!
//! The frontend talks to the server's OpenAI-compatible API directly (see
//! `src/services/localClient.ts`); this module only owns the process.

use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager};

use crate::server::{backend_path, ServerStatus, SpawnSpec, Supervisor};

/// Loading a 4B model from cold cache can take a while on a slow disk.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Default)]
pub struct LlmState(Supervisor);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    pub model: String,
    pub port: u16,
    pub context_size: u32,
    pub gpu_layers: u32,
    pub threads: u32,
}

#[tauri::command]
pub async fn local_llm_start(
    app: AppHandle,
    options: StartOptions,
) -> Result<ServerStatus, String> {
    let weights = backend_path(&app, &format!("weights/{}.gguf", options.model))?;

    let spec = SpawnSpec {
        exe: "lib/llama-server.exe",
        model: options.model.clone(),
        port: options.port,
        args: vec![
            "-m".into(),
            weights.display().to_string(),
            "--port".into(),
            options.port.to_string(),
            "-ngl".into(),
            options.gpu_layers.to_string(),
            "-c".into(),
            options.context_size.to_string(),
            "-t".into(),
            options.threads.to_string(),
        ],
        extra_path: Vec::new(),
        health_path: "/health",
        startup_timeout: STARTUP_TIMEOUT,
    };

    let state = app.state::<LlmState>();
    state.0.ensure(&app, spec).await
}

#[tauri::command]
pub fn local_llm_stop(app: AppHandle) -> Result<ServerStatus, String> {
    app.state::<LlmState>().0.stop()
}

#[tauri::command]
pub fn local_llm_status(app: AppHandle) -> Result<ServerStatus, String> {
    app.state::<LlmState>().0.status()
}

/// Kill the child on app teardown so it doesn't outlive Pal holding VRAM.
pub fn shutdown(app: &AppHandle) {
    if let Some(state) = app.try_state::<LlmState>() {
        let _ = state.0.stop();
    }
}
