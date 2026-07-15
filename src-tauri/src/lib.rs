mod commands;
mod database;
mod llm;
mod pomodoro;

use database::Database;
use pomodoro::PomodoroState;
use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

pub struct AppState {
    pub db: std::sync::Mutex<Database>,
    pub pomodoro: PomodoroState,
    pub scale: std::sync::Mutex<f64>,
}

/// Apply DWM attributes and strip native border styles for a single window.
/// Called once during setup and again on every focus change so that Windows
/// never resets the transparent/borderless look.
#[cfg(target_os = "windows")]
fn apply_dwm_borderless(window: &impl raw_window_handle::HasWindowHandle) {
    use raw_window_handle::HasWindowHandle;
    use windows_sys::Win32::Foundation::HWND;

    const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
    const DWMWCP_DONOTROUND: u32 = 1;
    const DWMWA_BORDERCOLOR: u32 = 34;
    const DWMWA_COLOR_NONE: u32 = 0xFFFFFFFD;
    // Disable non-client-area rendering so Windows never draws its own
    // title bar, borders or shadow chrome around transparent webview windows.
    const DWMWA_NCRENDERING_POLICY: u32 = 2;
    const DWMNCRP_DISABLED: u32 = 1;

    if let Ok(wh) = window.window_handle() {
        if let raw_window_handle::RawWindowHandle::Win32(handle) = wh.as_raw() {
            let hwnd = handle.hwnd.get() as HWND;
            unsafe {
                // --- DWM attributes ---
                windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_WINDOW_CORNER_PREFERENCE,
                    &DWMWCP_DONOTROUND as *const u32 as *const _,
                    std::mem::size_of::<u32>() as u32,
                );
                windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_BORDERCOLOR,
                    &DWMWA_COLOR_NONE as *const u32 as *const _,
                    std::mem::size_of::<u32>() as u32,
                );
                windows_sys::Win32::Graphics::Dwm::DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_NCRENDERING_POLICY,
                    &DWMNCRP_DISABLED as *const u32 as *const _,
                    std::mem::size_of::<u32>() as u32,
                );

                // --- Strip residual Win32 border styles ---
                use windows_sys::Win32::UI::WindowsAndMessaging::*;

                // Normal styles: remove any border / sizing frame / caption
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                let clean_style = style
                    & !(WS_BORDER as isize)
                    & !(WS_DLGFRAME as isize)
                    & !(WS_THICKFRAME as isize)
                    & !(WS_CAPTION as isize);
                if clean_style != style {
                    SetWindowLongPtrW(hwnd, GWL_STYLE, clean_style);
                }

                // Extended styles: remove 3-D / static / window edge borders
                let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                let clean_ex = ex_style
                    & !(WS_EX_CLIENTEDGE as isize)
                    & !(WS_EX_STATICEDGE as isize)
                    & !(WS_EX_WINDOWEDGE as isize);
                if clean_ex != ex_style {
                    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, clean_ex);
                }

                // Force the window frame to refresh without moving/resizing.
                SetWindowPos(
                    hwnd,
                    0 as HWND, // ignored (HWND_TOP placeholder)
                    0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED | SWP_NOACTIVATE,
                );
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        let state = app.state::<AppState>();
                        let settings = state.db.lock().unwrap().get_settings_map().unwrap_or_default();
                        let default_toggle = if cfg!(target_os = "macos") { "Cmd+Shift+T" } else { "Ctrl+Shift+T" };
                        let default_quickadd = if cfg!(target_os = "macos") { "Cmd+Shift+Space" } else { "Ctrl+Shift+Space" };
                        let toggle_str = settings.get("shortcut_toggle")
                            .and_then(|v| v.as_str()).unwrap_or(default_toggle);
                        let quickadd_str = settings.get("shortcut_quickadd")
                            .and_then(|v| v.as_str()).unwrap_or(default_quickadd);
                        
                        let matches_toggle = toggle_str.parse::<tauri_plugin_global_shortcut::Shortcut>()
                            .map(|sc| &sc == shortcut).unwrap_or(false);
                        let matches_quickadd = quickadd_str.parse::<tauri_plugin_global_shortcut::Shortcut>()
                            .map(|sc| &sc == shortcut).unwrap_or(false);

                        if matches_toggle {
                            if let Some(w) = app.get_webview_window("float") {
                                if w.is_visible().unwrap_or(false) { let _ = w.hide(); }
                                else { let _ = w.show(); let _ = w.set_focus(); }
                            }
                        } else if matches_quickadd {
                            if let Some(w) = app.get_webview_window("quickadd") {
                                if !w.is_visible().unwrap_or(false) {
                                    let _ = w.show(); let _ = w.set_focus(); let _ = w.center();
                                } else { let _ = w.set_focus(); }
                            }
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Hide Dock icon — app runs as a menu-bar-only application
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // On Windows, apply DWM + Win32 borderless tweaks to every window
            // at startup. They will be re-applied on every focus change (see
            // on_window_event below) to counter DWM resets.
            #[cfg(target_os = "windows")]
            {
                for label in &["float", "tray-view", "settings", "quickadd"] {
                    if let Some(window) = app.get_webview_window(label) {
                        apply_dwm_borderless(&window);
                    }
                }
            }

            // Make windows draggable from background (title bar area).
            // Webview interactive elements (buttons, inputs) still capture
            // clicks first, so dragging only starts on empty/non-interactive areas.
            #[cfg(target_os = "macos")]
            {
                use objc2::msg_send;
                for label in &["float", "tray-view", "settings", "quickadd"] {
                    if let Some(window) = app.get_webview_window(label) {
                        use raw_window_handle::HasWindowHandle;
                        if let Ok(wh) = window.window_handle() {
                            if let raw_window_handle::RawWindowHandle::AppKit(handle) = wh.as_raw() {
                                let ns_view = handle.ns_view.as_ptr() as *mut objc2::runtime::AnyObject;
                                unsafe {
                                    let ns_window: *mut objc2::runtime::AnyObject = msg_send![ns_view, window];
                                    if !ns_window.is_null() {
                                        let _: () = msg_send![ns_window, setMovableByWindowBackground: true];
                                    }
                                }
                            }
                        }
                    }
                }
            }

            let db = std::sync::Mutex::new(Database::new(app.handle())?);
            let pomodoro = PomodoroState::new();
            let scale = std::sync::Mutex::new(1.0);
            app.manage(AppState { db, pomodoro, scale });

            // Build tray menu
            let show_todo = MenuItemBuilder::with_id("show_todo", "待办清单").build(app)?;
            let show_archive = MenuItemBuilder::with_id("show_archive", "历史归档").build(app)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let show_settings = MenuItemBuilder::with_id("show_settings", "设置").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "退出").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_todo)
                .item(&show_archive)
                .item(&separator)
                .item(&show_settings)
                .item(&quit)
                .build()?;

            // Create tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("TodoFloat - 待办清单")
                .menu(&menu)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show_todo" => {
                            if let Some(w) = app.get_webview_window("float") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "show_archive" => {
                            if let Some(w) = app.get_webview_window("tray-view") {
                                let _ = w.show();
                                let _ = w.set_focus();
                                let _ = app.emit_to("tray-view", "navigate", "/tray");
                            }
                        }
                        "show_settings" => {
                            if let Some(w) = app.get_webview_window("settings") {
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|_tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        // On left click, show the context menu
                        // In Tauri v2, this is handled by the menu
                    }
                })
                .build(app)?;

            // Register global shortcuts with logging
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                let toggle = if cfg!(target_os = "macos") { "Cmd+Shift+T" } else { "Ctrl+Shift+T" };
                let quickadd = if cfg!(target_os = "macos") { "Cmd+Shift+Space" } else { "Ctrl+Shift+Space" };

                for (label, key) in [("toggle", toggle), ("quickadd", quickadd)] {
                    match key.parse::<tauri_plugin_global_shortcut::Shortcut>() {
                        Ok(sc) => match app.handle().global_shortcut().register(sc) {
                            Ok(_) => println!("[Shortcut] Registered {}: {}", label, key),
                            Err(e) => eprintln!("[Shortcut] Failed to register {} ({}): {}", label, key, e),
                        },
                        Err(e) => eprintln!("[Shortcut] Invalid format {} ({}): {}", label, key, e),
                    }
                }
            }

            start_reminder_polling(app.handle());

            // Restore window position from previous session
            if let Some(float_win) = app.get_webview_window("float") {
                let settings = app.state::<AppState>().db.lock().unwrap()
                    .get_settings_map().unwrap_or_default();
                if let Some(bounds_str) = settings.get("window_bounds")
                    .and_then(|v| v.as_str())
                {
                    if let Ok(bounds) = serde_json::from_str::<serde_json::Value>(bounds_str) {
                        if let (Some(x), Some(y), Some(w), Some(h)) = (
                            bounds["x"].as_f64(), bounds["y"].as_f64(),
                            bounds["width"].as_f64(), bounds["height"].as_f64(),
                        ) {
                            let _ = float_win.set_position(tauri::PhysicalPosition::new(x as i32, y as i32));
                            let _ = float_win.set_size(tauri::PhysicalSize::new(w as u32, h as u32));
                        }
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            let label = window.label().to_string();

            // Re-apply DWM borderless attributes on every focus change so
            // Windows never reverts to its native border / corner chrome.
            #[cfg(target_os = "windows")]
            {
                if matches!(event, tauri::WindowEvent::Focused(_)) {
                    if label == "float" || label == "quickadd" || label == "tray-view" || label == "settings" {
                        apply_dwm_borderless(window);
                    }
                }
            }

            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if label == "float" || label == "quickadd" || label == "tray-view" || label == "settings" {
                    api.prevent_close();
                    let _ = window.hide();
                }
                if label == "float" {
                    let app_handle = window.app_handle();
                    if let Ok(pos) = window.outer_position() {
                        if let Ok(size) = window.outer_size() {
                            let bounds = serde_json::json!({
                                "x": pos.x, "y": pos.y,
                                "width": size.width, "height": size.height,
                            });
                            let mut map = serde_json::Map::new();
                            map.insert("window_bounds".to_string(), serde_json::json!(bounds.to_string()));
                            let _ = app_handle.state::<AppState>().db.lock().unwrap()
                                .save_settings(&map);
                        }
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_todos,
            commands::get_active_todos,
            commands::get_future_scheduled_todos,
            commands::add_todo,
            commands::toggle_todo,
            commands::delete_todo,
            commands::recover_todo,
            commands::restore_todo,
            commands::archive_todo,
            commands::get_archived,
            commands::update_note,
            commands::update_category,
            commands::set_due_date,
            commands::set_scheduled_date,
            commands::get_categories,
            commands::reorder,
            commands::update_color,
            commands::update_text,
            commands::get_subtasks,
            commands::add_subtask,
            commands::toggle_subtask,
            commands::delete_subtask,
            commands::update_subtask_text,
            commands::get_settings,
            commands::save_settings,
            commands::get_work_analysis,
            commands::llm_categorize,
            commands::llm_analyze_work,
            commands::llm_test,
            commands::test_notification,
            commands::get_shortcuts,
            commands::update_shortcuts,
            commands::quick_add,
            commands::close_quick_add,
            commands::export_csv,
            commands::window_close,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_is_maximized,
            commands::window_get_scale,
            commands::window_adjust_scale,
            commands::window_set_opacity,
            commands::window_apply_theme,
            commands::open_tray_window,
            commands::open_settings_window,
            commands::backup_database,
            commands::restore_database,
            commands::pomodoro_get_state,
            commands::pomodoro_start,
            commands::pomodoro_pause,
            commands::pomodoro_resume,
            commands::pomodoro_stop,
            commands::pomodoro_get_sessions,
            commands::pomodoro_get_stats,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn start_reminder_polling(handle: &tauri::AppHandle) {
    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut reminded_ids: std::collections::HashSet<i64> = std::collections::HashSet::new();
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
        interval.tick().await; // skip first immediate tick

        loop {
            interval.tick().await;

            let remind_minutes: i64;
            {
                let state = handle.state::<AppState>();
                let db = state.db.lock().unwrap();
                let settings = match db.get_settings_map() {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                remind_minutes = settings.get("remind_minutes")
                    .and_then(|v| v.as_i64()).unwrap_or(15);
            }
            if remind_minutes < 0 { continue; }

            {
                let state = handle.state::<AppState>();
                let db = state.db.lock().unwrap();
                if let Ok(active_ids) = db.get_active_todo_ids() {
                    reminded_ids.retain(|id| active_ids.contains(id));
                }
            }

            let due_tasks: Vec<crate::database::Todo>;
            {
                let state = handle.state::<AppState>();
                let db = state.db.lock().unwrap();
                due_tasks = db.get_due_soon(remind_minutes).unwrap_or_default();
            }

            for task in due_tasks {
                if reminded_ids.contains(&task.id) { continue; }
                reminded_ids.insert(task.id);

                let body = task.due_date.as_ref().map_or(
                    format!("任务「{}」已到期", task.text),
                    |d| format!("任务「{}」将于 {} 到期", task.text, d),
                );

                use tauri_plugin_notification::NotificationExt;
                let _ = handle.notification().builder()
                    .title("TodoFloat 提醒")
                    .body(&body)
                    .show();
            }
        }
    });
}
