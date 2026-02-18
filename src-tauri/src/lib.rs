// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde_json::Value;
use std::fs;
use tauri::{
    menu::MenuBuilder,
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const AUTOSTART_ARG: &str = "--pal-autostart";
const STORE_PATH: &str = "pal-data.json";
const STORE_SETTINGS_KEY: &str = "settings.ui";

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn launched_from_autostart() -> bool {
    std::env::args().any(|arg| arg == AUTOSTART_ARG)
}

fn read_ui_settings(app: &AppHandle) -> Option<Value> {
    let app_data_dir = app.path().app_data_dir().ok()?;
    let store_file = app_data_dir.join(STORE_PATH);
    let contents = fs::read_to_string(store_file).ok()?;
    let parsed = serde_json::from_str::<Value>(&contents).ok()?;
    parsed.get(STORE_SETTINGS_KEY).cloned()
}

fn should_start_minimized(app: &AppHandle) -> bool {
    if !launched_from_autostart() {
        return false;
    }

    let Some(settings) = read_ui_settings(app) else {
        return false;
    };

    let start_with_windows = settings
        .get("startWithWindows")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let start_minimized = settings
        .get("startMinimized")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    start_with_windows && start_minimized
}

fn minimize_to_tray_enabled(app: &AppHandle) -> bool {
    let Some(settings) = read_ui_settings(app) else {
        return false;
    };

    settings
        .get("minimizeToTray")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_x::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![AUTOSTART_ARG]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            if should_start_minimized(app.handle()) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            app.global_shortcut()
                .on_shortcut("CmdOrCtrl+Shift+B", |app, _, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }

                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                        let _ = app.emit("pal://focus-compose", ());
                    }
                })?;

            app.global_shortcut()
                .on_shortcut("CmdOrCtrl+Shift+M", |app, _, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }

                    if let Some(window) = app.get_webview_window("main") {
                        let is_visible = window.is_visible().unwrap_or(true);
                        let is_minimized = window.is_minimized().unwrap_or(false);
                        if is_visible && !is_minimized {
                            if minimize_to_tray_enabled(app) {
                                let _ = window.hide();
                            } else {
                                let _ = window.minimize();
                            }
                            return;
                        }

                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                        let _ = app.emit("pal://focus-home", ());
                    }
                })?;

            let tray_menu = MenuBuilder::new(app)
                .text("tray_show", "Show Pal")
                .text("tray_hide", "Hide Pal")
                .separator()
                .text("tray_fullscreen", "Toggle Fullscreen")
                .separator()
                .text("tray_quit", "Quit")
                .build()?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Pal - Ready")
                .menu(&tray_menu)
                .on_menu_event(|app, event| {
                    let Some(window) = app.get_webview_window("main") else {
                        return;
                    };

                    match event.id().as_ref() {
                        "tray_show" => {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                        "tray_hide" => {
                            let _ = window.hide();
                        }
                        "tray_fullscreen" => {
                            if let Ok(is_fullscreen) = window.is_fullscreen() {
                                let _ = window.set_fullscreen(!is_fullscreen);
                            }
                        }
                        "tray_quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    let Some(window) = tray.app_handle().get_webview_window("main") else {
                        return;
                    };

                    match event {
                        TrayIconEvent::Click { .. } => {
                            let _ = tray.set_tooltip(Some("Pal - Click for tray actions"));
                        }
                        TrayIconEvent::DoubleClick { .. } => {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                            let _ = tray.set_tooltip(Some("Pal - Window focused"));
                        }
                        _ => {}
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
