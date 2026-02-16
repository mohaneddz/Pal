// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use tauri::{
    menu::MenuBuilder,
    tray::{TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_x::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet])
        .setup(|app| {
            app.global_shortcut().on_shortcut("CmdOrCtrl+Shift+B", |app, _, event| {
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
