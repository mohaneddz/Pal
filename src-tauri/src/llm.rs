//! Lifecycle management for the bundled llama.cpp server.
//!
//! Pal runs Gemma 3 locally by supervising a `llama-server` child process that
//! exposes an OpenAI-compatible HTTP API. The frontend talks to that API
//! directly (see `src/services/localClient.ts`); this module only owns the
//! process: starting it, polling until it is ready, and making sure it dies
//! with the app rather than lingering as an orphan.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Windows: don't flash a console window when spawning the server.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// How long to wait for the server to answer `/health` before giving up.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(120);
const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerState {
    Stopped,
    Starting,
    Ready,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub state: ServerState,
    pub model: String,
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartOptions {
    pub model: String,
    pub port: u16,
    pub context_size: u32,
    pub gpu_layers: u32,
    pub threads: u32,
}

#[derive(Default)]
pub struct LlmState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    child: Option<Child>,
    state: ServerState,
    model: String,
    port: u16,
    message: Option<String>,
}

impl Default for ServerState {
    fn default() -> Self {
        ServerState::Stopped
    }
}

impl Inner {
    fn status(&self) -> ServerStatus {
        ServerStatus {
            state: self.state,
            model: self.model.clone(),
            port: self.port,
            message: self.message.clone(),
        }
    }

    /// Terminate the child if one is running. Safe to call repeatedly.
    fn kill_child(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Resolve a path inside the `backend/` payload.
///
/// In a bundled app the payload ships as a Tauri resource; during `tauri dev`
/// the binary runs from `src-tauri/target/...`, so fall back to the copy in the
/// repo working tree.
fn backend_path(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("backend").join(relative));
    }

    // Dev fallback: <repo>/backend/<relative>, relative to this crate.
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    if let Some(repo_root) = manifest_dir.parent() {
        candidates.push(repo_root.join("backend").join(relative));
    }

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    Err(format!(
        "Could not locate `backend/{}`. Looked in: {}",
        relative,
        candidates
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

/// Poll `/health` until llama-server reports ready, it exits, or we time out.
async fn await_ready(port: u16, timeout: Duration) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{port}/health");
    let deadline = std::time::Instant::now() + timeout;

    loop {
        if let Ok(response) = client
            .get(&url)
            .timeout(Duration::from_secs(2))
            .send()
            .await
        {
            if response.status().is_success() {
                return Ok(());
            }
        }

        if std::time::Instant::now() >= deadline {
            return Err(format!(
                "llama-server did not become ready within {}s.",
                timeout.as_secs()
            ));
        }

        tokio::time::sleep(HEALTH_POLL_INTERVAL).await;
    }
}

#[tauri::command]
pub async fn local_llm_start(
    app: AppHandle,
    options: StartOptions,
) -> Result<ServerStatus, String> {
    let state = app.state::<LlmState>();

    // Reuse an already-running server when it matches the requested config.
    {
        let mut inner = state.inner.lock().map_err(|_| "LLM state poisoned")?;
        if inner.state == ServerState::Ready
            && inner.model == options.model
            && inner.port == options.port
        {
            return Ok(inner.status());
        }
        // Config changed (or previous attempt failed): start from a clean slate.
        inner.kill_child();
        inner.state = ServerState::Starting;
        inner.model = options.model.clone();
        inner.port = options.port;
        inner.message = None;
    }

    let exe = backend_path(&app, "lib/llama-server.exe")?;
    let weights = backend_path(&app, &format!("weights/{}.gguf", options.model))?;

    let mut command = Command::new(&exe);
    command
        .arg("-m")
        .arg(&weights)
        .arg("--port")
        .arg(options.port.to_string())
        .arg("-ngl")
        .arg(options.gpu_layers.to_string())
        .arg("-c")
        .arg(options.context_size.to_string())
        .arg("-t")
        .arg(options.threads.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    // llama-server resolves its CUDA dlls relative to the working directory.
    if let Some(lib_dir) = exe.parent() {
        command.current_dir(lib_dir);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command
        .spawn()
        .map_err(|error| format!("Failed to spawn llama-server: {error}"))?;

    {
        let mut inner = state.inner.lock().map_err(|_| "LLM state poisoned")?;
        inner.child = Some(child);
    }

    match await_ready(options.port, STARTUP_TIMEOUT).await {
        Ok(()) => {
            let mut inner = state.inner.lock().map_err(|_| "LLM state poisoned")?;
            inner.state = ServerState::Ready;
            inner.message = None;
            Ok(inner.status())
        }
        Err(error) => {
            let mut inner = state.inner.lock().map_err(|_| "LLM state poisoned")?;
            inner.kill_child();
            inner.state = ServerState::Error;
            inner.message = Some(error.clone());
            Err(error)
        }
    }
}

#[tauri::command]
pub fn local_llm_stop(app: AppHandle) -> Result<ServerStatus, String> {
    let state = app.state::<LlmState>();
    let mut inner = state.inner.lock().map_err(|_| "LLM state poisoned")?;
    inner.kill_child();
    inner.state = ServerState::Stopped;
    inner.message = None;
    Ok(inner.status())
}

#[tauri::command]
pub fn local_llm_status(app: AppHandle) -> Result<ServerStatus, String> {
    let state = app.state::<LlmState>();
    let mut inner = state.inner.lock().map_err(|_| "LLM state poisoned")?;

    // Detect a server that died on its own so the UI doesn't show a stale "ready".
    let exited = match inner.child.as_mut() {
        Some(child) => child.try_wait().ok().flatten().is_some(),
        None => false,
    };
    if exited {
        inner.child = None;
        if inner.state == ServerState::Ready {
            inner.state = ServerState::Error;
            inner.message = Some("llama-server exited unexpectedly.".into());
        }
    }

    Ok(inner.status())
}

/// Kill the child on app teardown so it doesn't outlive Pal.
pub fn shutdown(app: &AppHandle) {
    if let Some(state) = app.try_state::<LlmState>() {
        if let Ok(mut inner) = state.inner.lock() {
            inner.kill_child();
            inner.state = ServerState::Stopped;
        }
    }
}
