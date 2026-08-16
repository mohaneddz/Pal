//! Registry and dispatcher for actions Pal can take on the user's PC, plus
//! the read-only ("auto-run") action implementations.
//!
//! Every action is a specific, strictly-typed function -- never free-form
//! shell text. `ActionRisk` decides whether `actions_execute` runs an action
//! immediately or refuses without an explicit `confirmed: true`; that check
//! happens here, in application code, not in the Tauri ACL (file actions
//! bypass the `fs` plugin's scope entirely, so this dispatcher is the actual
//! security boundary for anything this module does).

use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sysinfo::{Disks, System};

use crate::calc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionRisk {
    AutoRun,
    ConfirmRequired,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActionDescriptor {
    pub name: &'static str,
    pub description: &'static str,
    pub risk: ActionRisk,
    #[serde(rename = "parametersSchema")]
    pub parameters_schema: Value,
}

#[derive(Debug, Deserialize)]
pub struct ActionRequest {
    pub name: String,
    pub arguments: Value,
}

#[derive(Debug, Serialize)]
pub struct ActionResult {
    pub success: bool,
    pub output: Value,
    pub error: Option<String>,
}

/// Single source of truth for available actions -- both the frontend's tool
/// list and the dispatcher below read from this.
pub fn registry() -> Vec<ActionDescriptor> {
    vec![
        ActionDescriptor {
            name: "read_file",
            description: "Read the contents of a text file at an absolute path.",
            risk: ActionRisk::AutoRun,
            parameters_schema: json!({
                "type": "object",
                "properties": { "path": { "type": "string", "description": "Absolute file path" } },
                "required": ["path"]
            }),
        },
        ActionDescriptor {
            name: "list_directory",
            description: "List the entries (name, type, size) of a directory, non-recursive.",
            risk: ActionRisk::AutoRun,
            parameters_schema: json!({
                "type": "object",
                "properties": { "path": { "type": "string", "description": "Absolute directory path" } },
                "required": ["path"]
            }),
        },
        ActionDescriptor {
            name: "path_info",
            description: "Check whether a path exists, and if so whether it's a file or directory, its size, and when it was last modified.",
            risk: ActionRisk::AutoRun,
            parameters_schema: json!({
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }),
        },
        ActionDescriptor {
            name: "calculate",
            description: "Evaluate an arithmetic expression, e.g. \"47 * 12.5\" or \"(3 + 4) / 2\".",
            risk: ActionRisk::AutoRun,
            parameters_schema: json!({
                "type": "object",
                "properties": { "expression": { "type": "string" } },
                "required": ["expression"]
            }),
        },
        ActionDescriptor {
            name: "get_system_info",
            description: "Get basic system info: OS name/version, hostname, uptime.",
            risk: ActionRisk::AutoRun,
            parameters_schema: json!({ "type": "object", "properties": {} }),
        },
        ActionDescriptor {
            name: "get_disk_space",
            description: "Get free and total disk space for each mounted volume.",
            risk: ActionRisk::AutoRun,
            parameters_schema: json!({ "type": "object", "properties": {} }),
        },
        ActionDescriptor {
            name: "list_running_processes",
            description: "List currently running processes (name, pid, memory), limited to the top 50 by memory use.",
            risk: ActionRisk::AutoRun,
            parameters_schema: json!({ "type": "object", "properties": {} }),
        },
    ]
}

fn find(name: &str) -> Option<ActionDescriptor> {
    registry().into_iter().find(|action| action.name == name)
}

#[tauri::command]
pub fn actions_list_available() -> Vec<ActionDescriptor> {
    registry()
}

#[tauri::command]
pub async fn actions_execute(
    request: ActionRequest,
    confirmed: bool,
) -> Result<ActionResult, String> {
    let Some(descriptor) = find(&request.name) else {
        return Err(format!("Unknown action: {}", request.name));
    };

    // Defense in depth: the dispatcher re-checks risk itself rather than
    // trusting the caller's intent -- a confirm-required action can never
    // run without an explicit `confirmed: true`, no matter what invoked it.
    if descriptor.risk == ActionRisk::ConfirmRequired && !confirmed {
        return Err(format!(
            "Action '{}' requires user confirmation before it can run.",
            descriptor.name
        ));
    }

    let outcome = dispatch(&request.name, &request.arguments);
    Ok(match outcome {
        Ok(output) => ActionResult {
            success: true,
            output,
            error: None,
        },
        Err(error) => ActionResult {
            success: false,
            output: Value::Null,
            error: Some(error),
        },
    })
}

fn dispatch(name: &str, arguments: &Value) -> Result<Value, String> {
    match name {
        "read_file" => read_file(arguments),
        "list_directory" => list_directory(arguments),
        "path_info" => path_info(arguments),
        "calculate" => calculate(arguments),
        "get_system_info" => get_system_info(),
        "get_disk_space" => get_disk_space(),
        "list_running_processes" => list_running_processes(),
        _ => Err(format!("Action '{name}' has no implementation.")),
    }
}

fn require_path(arguments: &Value) -> Result<&Path, String> {
    arguments
        .get("path")
        .and_then(Value::as_str)
        .map(Path::new)
        .ok_or_else(|| "Missing required 'path' argument.".to_string())
}

/// Cap on how much of a file `read_file` will return, so a multi-GB file
/// can't be pulled whole into a chat message.
const MAX_READ_BYTES: usize = 256 * 1024;

fn read_file(arguments: &Value) -> Result<Value, String> {
    let path = require_path(arguments)?;
    let bytes =
        fs::read(path).map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    let truncated = bytes.len() > MAX_READ_BYTES;
    let slice = &bytes[..bytes.len().min(MAX_READ_BYTES)];
    let content = String::from_utf8(slice.to_vec())
        .map_err(|_| format!("{} does not look like a text file.", path.display()))?;
    Ok(json!({ "content": content, "truncated": truncated }))
}

fn list_directory(arguments: &Value) -> Result<Value, String> {
    let path = require_path(arguments)?;
    let entries =
        fs::read_dir(path).map_err(|error| format!("Failed to list {}: {error}", path.display()))?;

    let mut items = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let metadata = entry.metadata().map_err(|error| error.to_string())?;
        items.push(json!({
            "name": entry.file_name().to_string_lossy(),
            "isDirectory": metadata.is_dir(),
            "sizeBytes": metadata.len(),
        }));
    }
    Ok(json!({ "entries": items }))
}

fn path_info(arguments: &Value) -> Result<Value, String> {
    let path = require_path(arguments)?;
    if !path.exists() {
        return Ok(json!({ "exists": false }));
    }
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());

    Ok(json!({
        "exists": true,
        "isDirectory": metadata.is_dir(),
        "sizeBytes": metadata.len(),
        "modifiedUnix": modified,
    }))
}

fn calculate(arguments: &Value) -> Result<Value, String> {
    let expression = arguments
        .get("expression")
        .and_then(Value::as_str)
        .ok_or_else(|| "Missing required 'expression' argument.".to_string())?;
    let result = calc::evaluate(expression)?;
    Ok(json!({ "result": result }))
}

fn get_system_info() -> Result<Value, String> {
    Ok(json!({
        "osName": System::name().unwrap_or_else(|| "unknown".into()),
        "osVersion": System::os_version().unwrap_or_else(|| "unknown".into()),
        "kernelVersion": System::kernel_version().unwrap_or_else(|| "unknown".into()),
        "hostname": System::host_name().unwrap_or_else(|| "unknown".into()),
        "uptimeSeconds": System::uptime(),
    }))
}

fn get_disk_space() -> Result<Value, String> {
    let disks = Disks::new_with_refreshed_list();
    let volumes: Vec<Value> = disks
        .iter()
        .map(|disk| {
            json!({
                "mountPoint": disk.mount_point().to_string_lossy(),
                "totalBytes": disk.total_space(),
                "freeBytes": disk.available_space(),
            })
        })
        .collect();
    Ok(json!({ "volumes": volumes }))
}

fn list_running_processes() -> Result<Value, String> {
    let mut system = System::new_all();
    system.refresh_all();

    let mut processes: Vec<_> = system.processes().values().collect();
    processes.sort_by(|a, b| b.memory().cmp(&a.memory()));

    let items: Vec<Value> = processes
        .into_iter()
        .take(50)
        .map(|process| {
            json!({
                "pid": process.pid().as_u32(),
                "name": process.name().to_string_lossy(),
                "memoryBytes": process.memory(),
            })
        })
        .collect();

    Ok(json!({ "processes": items }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_names_are_unique() {
        let names: Vec<&str> = registry().into_iter().map(|action| action.name).collect();
        let mut deduped = names.clone();
        deduped.sort_unstable();
        deduped.dedup();
        assert_eq!(names.len(), deduped.len(), "duplicate action name in registry");
    }

    #[test]
    fn all_registered_actions_are_auto_run() {
        // Phase A only ships read-only actions; a confirm-required entry here
        // would need a real risk check exercised by a test, not just this one.
        assert!(registry().iter().all(|action| action.risk == ActionRisk::AutoRun));
    }

    #[test]
    fn read_file_reports_truncation() {
        let path = std::env::temp_dir().join(format!("pal-actions-test-{}.txt", std::process::id()));
        fs::write(&path, vec![b'a'; MAX_READ_BYTES + 10]).unwrap();

        let result = read_file(&json!({ "path": path.to_string_lossy() })).unwrap();
        assert_eq!(result["truncated"], true);
        assert_eq!(result["content"].as_str().unwrap().len(), MAX_READ_BYTES);

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn path_info_reports_missing_paths() {
        let result = path_info(&json!({ "path": "Z:\\does\\not\\exist\\pal-test" })).unwrap();
        assert_eq!(result["exists"], false);
    }

    #[test]
    fn dispatch_rejects_unknown_action() {
        let error = dispatch("delete_everything", &json!({})).unwrap_err();
        assert!(error.contains("no implementation"));
    }
}
