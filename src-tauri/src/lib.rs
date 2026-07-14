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
    pub db: parking_lot::Mutex<Database>,
    pub pomodoro: PomodoroState,
    pub scale: parking_lot::Mutex<f64>,
    pub locale: parking_lot::Mutex<String>,
    pub tray: parking_lot::Mutex<Option<tauri::tray::TrayIcon>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        let state = app.state::<AppState>();
                        let settings = state.db.lock().get_settings_map().unwrap_or_default();
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

            // On Windows 11, disable DWM native rounded corners so CSS
            // border-radius on the web content handles all rounding.
            // This eliminates the solid-color bleed behind the CSS arcs and
            // removes the black edge lines caused by DWM shadow/rounding mismatch.
            #[cfg(target_os = "windows")]
            {
                use raw_window_handle::HasWindowHandle;
                const DWMWA_WINDOW_CORNER_PREFERENCE: u32 = 33;
                const DWMWCP_DONOTROUND: u32 = 1;
                // Remove the native active-window border that Windows draws when a
                // transparent rounded window gains focus. Otherwise it fills the corner
                // arcs (solid wedges) and shows a native title-bar strip (issue #2/#3).
                const DWMWA_BORDERCOLOR: u32 = 34;
                const DWMWA_COLOR_NONE: u32 = 0xFFFFFFFD;

                for label in &["float", "tray-view", "settings", "quickadd"] {
                    if let Some(window) = app.get_webview_window(label) {
                        if let Ok(wh) = window.window_handle() {
                            if let raw_window_handle::RawWindowHandle::Win32(handle) = wh.as_raw() {
                                let hwnd = handle.hwnd.get() as *mut _;
                                unsafe {
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
                                }
                            }
                        }
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

            let db = Database::new(app.handle())?;
            let locale = db
                .get_settings_map()
                .ok()
                .and_then(|m| m.get("locale").and_then(|v| v.as_str()).map(|s| s.to_string()))
                .unwrap_or_else(|| "zh-CN".to_string());
            let db = parking_lot::Mutex::new(db);
            let pomodoro = PomodoroState::new();
            let scale = parking_lot::Mutex::new(1.0);
            app.manage(AppState {
                db,
                pomodoro,
                scale,
                locale: parking_lot::Mutex::new(locale.clone()),
                tray: parking_lot::Mutex::new(None),
            });

            // Build tray menu
            let menu = build_tray_menu(&app.app_handle(), &locale)?;
            let labels = tray_labels(&locale);

            // Create tray icon
            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(labels.tooltip)
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
                                let _ = w.unminimize();
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
            *app.state::<AppState>().tray.lock() = Some(tray);

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
            start_pomodoro_ticking(app.handle());

            // Restore window position from previous session
            if let Some(float_win) = app.get_webview_window("float") {
                let settings = app.state::<AppState>().db.lock()
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
                            let _ = app_handle.state::<AppState>().db.lock()
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
            commands::update_locale,
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
            commands::pomodoro_complete,
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
                let db = state.db.lock();
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
                let db = state.db.lock();
                if let Ok(active_ids) = db.get_active_todo_ids() {
                    reminded_ids.retain(|id| active_ids.contains(id));
                }
            }

            let due_tasks: Vec<crate::database::Todo>;
            {
                let state = handle.state::<AppState>();
                let db = state.db.lock();
                due_tasks = db.get_due_soon(remind_minutes).unwrap_or_default();
            }

            for task in due_tasks {
                if reminded_ids.contains(&task.id) { continue; }
                reminded_ids.insert(task.id);

                let locale = {
                    let state = handle.state::<AppState>();
                    let locale = state.locale.lock().clone();
                    locale
                };

                let body = task.due_date.as_ref().map_or(
                    format_due_now(&locale, &task.text),
                    |d| format_due_soon(&locale, &task.text, d),
                );

                use tauri_plugin_notification::NotificationExt;
                let _ = handle.notification().builder()
                    .title(notification_title(&locale))
                    .body(&body)
                    .show();
            }
        }
    });
}

fn start_pomodoro_ticking(handle: &tauri::AppHandle) {
    let handle = handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1));
        interval.tick().await; // skip first immediate tick

        loop {
            interval.tick().await;

            let tick_result = {
                let state = handle.state::<AppState>();
                let mut inner = state.pomodoro.get_inner().await;
                inner.tick()
            };

            if let Some(result) = tick_result {
                if result.completed {
                    if let Err(e) = commands::complete_and_transition_pomodoro(&handle).await {
                        eprintln!("[Pomodoro] Failed to transition after tick: {}", e);
                    }
                    continue; // state already broadcast by transition helper
                }
            }

            commands::broadcast_pomodoro_state(&handle).await;
        }
    });
}

pub(crate) struct TrayLabels {
    pub show_todo: &'static str,
    pub show_archive: &'static str,
    pub show_settings: &'static str,
    pub quit: &'static str,
    pub tooltip: &'static str,
}

pub(crate) fn tray_labels(locale: &str) -> TrayLabels {
    if locale == "zh-CN" {
        TrayLabels {
            show_todo: "待办清单",
            show_archive: "历史归档",
            show_settings: "设置",
            quit: "退出",
            tooltip: "TodoFloat - 待办清单",
        }
    } else {
        TrayLabels {
            show_todo: "Todo List",
            show_archive: "Archive",
            show_settings: "Settings",
            quit: "Quit",
            tooltip: "TodoFloat",
        }
    }
}

pub(crate) fn build_tray_menu<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    locale: &str,
) -> Result<tauri::menu::Menu<R>, tauri::Error> {
    let labels = tray_labels(locale);
    let show_todo = MenuItemBuilder::with_id("show_todo", labels.show_todo).build(app)?;
    let show_archive = MenuItemBuilder::with_id("show_archive", labels.show_archive).build(app)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let show_settings = MenuItemBuilder::with_id("show_settings", labels.show_settings).build(app)?;
    let quit = MenuItemBuilder::with_id("quit", labels.quit).build(app)?;

    MenuBuilder::new(app)
        .item(&show_todo)
        .item(&show_archive)
        .item(&separator)
        .item(&show_settings)
        .item(&quit)
        .build()
}

fn t(locale: &str, zh: &'static str, en: &'static str) -> &'static str {
    if locale == "en-US" { en } else { zh }
}

fn notification_title(locale: &str) -> &'static str {
    t(locale, "TodoFloat 提醒", "TodoFloat Reminder")
}

fn format_due_now(locale: &str, task: &str) -> String {
    if locale == "en-US" {
        format!("Task \"{}\" is due", task)
    } else {
        format!("任务「{}」已到期", task)
    }
}

fn format_due_soon(locale: &str, task: &str, due_date: &str) -> String {
    if locale == "en-US" {
        format!("Task \"{}\" is due at {}", task, due_date)
    } else {
        format!("任务「{}」将于 {} 到期", task, due_date)
    }
}
