// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod llm;
mod server;
mod stt;

use serde_json::Value;
use std::fs;
use std::sync::Mutex;
use tauri::{
    menu::MenuBuilder,
    tray::{TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

const AUTOSTART_ARG: &str = "--pal-autostart";
const STORE_PATH: &str = "pal-data.json";
const STORE_SETTINGS_KEY: &str = "settings.ui";
const MAIN_WINDOW_LABEL: &str = "main";
const FREE_RAM_SHORTCUT: &str = "CmdOrCtrl+Shift+D";

#[derive(Default)]
struct AppState {
    keep_alive_on_window_close: Mutex<bool>,
    explicit_quit: Mutex<bool>,
}

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

fn auto_free_ram_enabled(app: &AppHandle) -> bool {
    let Some(settings) = read_ui_settings(app) else {
        return false;
    };

    settings
        .get("autoFreeRam")
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn ensure_main_window(app: &AppHandle) {
    if app.get_webview_window(MAIN_WINDOW_LABEL).is_some() {
        return;
    }

    let _ = WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
        .title("Pal")
        .inner_size(500.0, 640.0)
        .resizable(true)
        .decorations(false)
        .build();
}

fn mark_keep_alive_on_window_close(app: &AppHandle, keep_alive: bool) {
    let state = app.state::<AppState>();
    if let Ok(mut flag) = state.keep_alive_on_window_close.lock() {
        *flag = keep_alive;
    };
}

fn set_explicit_quit(app: &AppHandle, explicit_quit: bool) {
    let state = app.state::<AppState>();
    if let Ok(mut flag) = state.explicit_quit.lock() {
        *flag = explicit_quit;
    };
}

fn should_prevent_exit(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let keep_alive = state
        .keep_alive_on_window_close
        .lock()
        .map(|flag| *flag)
        .unwrap_or(false);
    let explicit_quit = state.explicit_quit.lock().map(|flag| *flag).unwrap_or(false);
    keep_alive && !explicit_quit
}

fn destroy_main_window(app: &AppHandle) {
    mark_keep_alive_on_window_close(app, true);
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = window.destroy();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .manage(llm::LlmState::default())
        .manage(stt::SttState::default())
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
        .invoke_handler(tauri::generate_handler![
            greet,
            llm::local_llm_start,
            llm::local_llm_stop,
            llm::local_llm_status,
            stt::local_stt_start,
            stt::local_stt_stop,
            stt::local_stt_status,
        ])
        .setup(|app| {
            if should_start_minimized(app.handle()) {
                if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                    let _ = window.hide();
                }
            }

            app.global_shortcut()
                .on_shortcut("CmdOrCtrl+Shift+B", |app, _, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }

                    ensure_main_window(app);

                    let Some(window) = app.get_webview_window("main") else {
                        return;
                    };

                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    let _ = app.emit("pal://focus-compose", ());
                })?;

            app.global_shortcut()
                .on_shortcut("CmdOrCtrl+Shift+M", |app, _, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }

                    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                        let is_visible = window.is_visible().unwrap_or(true);
                        let is_minimized = window.is_minimized().unwrap_or(false);
                        if is_visible && !is_minimized {
                            if minimize_to_tray_enabled(app) {
                                if auto_free_ram_enabled(app) {
                                    destroy_main_window(app);
                                } else {
                                    let _ = window.hide();
                                }
                            } else {
                                let _ = window.minimize();
                            }
                            return;
                        }
                    }

                    ensure_main_window(app);

                    let Some(window) = app.get_webview_window("main") else {
                        return;
                    };

                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                    let _ = app.emit("pal://focus-home", ());
                })?;

            app.global_shortcut()
                .on_shortcut(FREE_RAM_SHORTCUT, |app, _, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    destroy_main_window(app);
                })?;

            let tray_menu = MenuBuilder::new(app)
                .text("tray_show", "Show Pal")
                .text("tray_hide", "Hide Pal")
                .text("tray_close_webview", "Free RAM (Close Window) [Ctrl+Shift+D]")
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
                    match event.id().as_ref() {
                        "tray_show" => {
                            ensure_main_window(app);

                            let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
                                return;
                            };

                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                        "tray_hide" => {
                            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                                let _ = window.hide();
                            }
                        }
                        "tray_close_webview" => {
                            destroy_main_window(app);
                        }
                        "tray_fullscreen" => {
                            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                                if let Ok(is_fullscreen) = window.is_fullscreen() {
                                    let _ = window.set_fullscreen(!is_fullscreen);
                                }
                            }
                        }
                        "tray_quit" => {
                            set_explicit_quit(app, true);
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click { .. } => {
                            let _ = tray.set_tooltip(Some("Pal - Click for tray actions"));
                        }
                        TrayIconEvent::DoubleClick { .. } => {
                            let app = tray.app_handle();
                            ensure_main_window(app);

                            let Some(window) = app.get_webview_window("main") else {
                                return;
                            };

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
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if auto_free_ram_enabled(app) {
                    api.prevent_close();
                    mark_keep_alive_on_window_close(app, true);
                    let _ = window.destroy();
                    return;
                }

                if minimize_to_tray_enabled(app) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            RunEvent::ExitRequested { api, .. } => {
                if should_prevent_exit(app) {
                    api.prevent_exit();
                }
            }
            // Windows does not reap child processes with the parent, so the
            // llama-server would otherwise keep holding VRAM after Pal quits.
            RunEvent::Exit => {
                llm::shutdown(app);
                stt::shutdown(app);
            }
            _ => {}
        });
}
