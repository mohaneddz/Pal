//! Shared supervision for the local inference servers.
//!
//! Pal runs its on-device models as llama.cpp/whisper.cpp HTTP servers rather
//! than linking them in-process: both ship as prebuilt CUDA binaries, so this
//! avoids a native build dependency and keeps a crash isolated from the app.
//! The frontend talks to the servers directly; this module only owns their
//! lifecycle.

use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// Windows: don't flash a console window when spawning a server.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

const HEALTH_POLL_INTERVAL: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ServerState {
    #[default]
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

/// Everything needed to bring one server up.
pub struct SpawnSpec {
    /// Path of the executable relative to `backend/`.
    pub exe: &'static str,
    /// Identifier surfaced to the UI; also used to detect a config change.
    pub model: String,
    pub port: u16,
    pub args: Vec<String>,
    /// Extra directories prepended to PATH, for DLLs shared between servers.
    pub extra_path: Vec<PathBuf>,
    /// Path suffix polled until the server answers, e.g. `/health`.
    pub health_path: &'static str,
    pub startup_timeout: Duration,
}

#[derive(Default)]
pub struct Supervisor {
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
pub fn backend_path(app: &AppHandle, relative: &str) -> Result<PathBuf, String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("backend").join(relative));
    }

    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    if let Some(repo_root) = manifest_dir.parent() {
        candidates.push(repo_root.join("backend").join(relative));
    }

    candidates
        .iter()
        .find(|candidate| candidate.exists())
        .cloned()
        .ok_or_else(|| {
            format!(
                "Could not locate `backend/{}`. Looked in: {}",
                relative,
                candidates
                    .iter()
                    .map(|path| path.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })
}

/// Poll the health endpoint until the server answers, or we time out.
async fn await_ready(port: u16, path: &str, timeout: Duration) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:{port}{path}");
    let deadline = Instant::now() + timeout;

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

        if Instant::now() >= deadline {
            return Err(format!(
                "Server did not become ready within {}s.",
                timeout.as_secs()
            ));
        }

        tokio::time::sleep(HEALTH_POLL_INTERVAL).await;
    }
}

impl Supervisor {
    /// Bring the server up if it isn't already running with this exact config.
    pub async fn ensure(&self, app: &AppHandle, spec: SpawnSpec) -> Result<ServerStatus, String> {
        {
            let mut inner = self.inner.lock().map_err(|_| "Supervisor state poisoned")?;
            if inner.state == ServerState::Ready
                && inner.model == spec.model
                && inner.port == spec.port
            {
                return Ok(inner.status());
            }
            // Config changed, or a previous attempt failed: start clean.
            inner.kill_child();
            inner.state = ServerState::Starting;
            inner.model = spec.model.clone();
            inner.port = spec.port;
            inner.message = None;
        }

        let exe = backend_path(app, spec.exe)?;

        let mut command = Command::new(&exe);
        command
            .args(&spec.args)
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        // ggml resolves its backend DLLs from the executable's directory.
        if let Some(exe_dir) = exe.parent() {
            command.current_dir(exe_dir);
        }

        // The CUDA redistributables are byte-identical across the llama.cpp and
        // whisper.cpp builds, so they live in one place and are found via PATH
        // rather than duplicated (~574MB) into each server's folder.
        if !spec.extra_path.is_empty() {
            let existing = std::env::var_os("PATH").unwrap_or_default();
            let mut entries = spec.extra_path.clone();
            entries.extend(std::env::split_paths(&existing));
            if let Ok(joined) = std::env::join_paths(entries) {
                command.env("PATH", joined);
            }
        }

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let child = command
            .spawn()
            .map_err(|error| format!("Failed to spawn {}: {error}", spec.exe))?;

        {
            let mut inner = self.inner.lock().map_err(|_| "Supervisor state poisoned")?;
            inner.child = Some(child);
        }

        match await_ready(spec.port, spec.health_path, spec.startup_timeout).await {
            Ok(()) => {
                let mut inner = self.inner.lock().map_err(|_| "Supervisor state poisoned")?;
                inner.state = ServerState::Ready;
                inner.message = None;
                Ok(inner.status())
            }
            Err(error) => {
                let mut inner = self.inner.lock().map_err(|_| "Supervisor state poisoned")?;
                inner.kill_child();
                inner.state = ServerState::Error;
                inner.message = Some(error.clone());
                Err(error)
            }
        }
    }

    pub fn stop(&self) -> Result<ServerStatus, String> {
        let mut inner = self.inner.lock().map_err(|_| "Supervisor state poisoned")?;
        inner.kill_child();
        inner.state = ServerState::Stopped;
        inner.message = None;
        Ok(inner.status())
    }

    pub fn status(&self) -> Result<ServerStatus, String> {
        let mut inner = self.inner.lock().map_err(|_| "Supervisor state poisoned")?;

        // Detect a server that died on its own, so the UI doesn't show a stale
        // "ready" and the next request retries the spawn instead of hanging.
        let exited = match inner.child.as_mut() {
            Some(child) => child.try_wait().ok().flatten().is_some(),
            None => false,
        };
        if exited {
            inner.child = None;
            if inner.state == ServerState::Ready {
                inner.state = ServerState::Error;
                inner.message = Some("Server exited unexpectedly.".into());
            }
        }

        Ok(inner.status())
    }
}
