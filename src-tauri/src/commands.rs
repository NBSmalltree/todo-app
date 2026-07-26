use crate::llm::LLMHelper;
use crate::AppState;
use serde_json::{json, Value};
use tauri::{Emitter, Manager, State, Window};

// ===== Localization helpers =====

fn current_locale(state: &State<'_, AppState>) -> String {
    state.locale.lock().clone()
}

fn t(locale: &str, key: &str) -> String {
    if locale == "zh-CN" {
        return zh_cn(key);
    }
    en(key).unwrap_or_else(|| zh_cn(key))
}

fn zh_cn(key: &str) -> String {
    match key {
        "invalid_text" => "无效的任务内容",
        "invalid_id" => "无效的 ID",
        "invalid_input" => "无效的输入",
        "invalid_date_format" => "无效的日期格式",
        "no_data" => "没有可导出的数据",
        "user_cancelled" => "用户取消",
        "missing_api_key" => "请先填写 API Key",
        "notification_title" => "TodoFloat 提醒",
        "notification_test_body" => "这是一条测试通知，如果你看到了说明提醒功能正常 ✔",
        "pomodoro_already_running" => "番茄钟已在运行",
        "pomodoro_not_running" => "没有正在运行的番茄钟",
        "status_done" => "已完成",
        "status_todo" => "待办",
        "category_uncategorized" => "未分类",
        "csv_header" => "﻿任务内容,状态,截止日期,类别,备注,创建时间,完成时间,归档时间\n",
        "file_type_csv" => "CSV 文件",
        "file_type_db" => "数据库文件",
        _ => key,
    }
    .to_string()
}

fn en(key: &str) -> Option<String> {
    Some(match key {
        "invalid_text" => "Invalid text",
        "invalid_id" => "Invalid id",
        "invalid_input" => "Invalid input",
        "invalid_date_format" => "Invalid date format",
        "no_data" => "No data to export",
        "user_cancelled" => "User cancelled",
        "missing_api_key" => "Please enter an API key first",
        "notification_title" => "TodoFloat Reminder",
        "notification_test_body" => "This is a test notification. If you see it, notifications are working ✔",
        "pomodoro_already_running" => "Pomodoro is already running",
        "pomodoro_not_running" => "No pomodoro is running",
        "status_done" => "Done",
        "status_todo" => "Todo",
        "category_uncategorized" => "Uncategorized",
        "csv_header" => "﻿Task,Status,Due Date,Category,Note,Created At,Completed At,Archived At\n",
        "file_type_csv" => "CSV Files",
        "file_type_db" => "Database Files",
        _ => return None,
    }
    .to_string())
}

// ===== Helper functions =====

fn is_positive_int(v: &Value) -> bool {
    v.as_i64().map_or(false, |n| n > 0)
}

fn is_non_empty_string(v: &Value, max_len: usize) -> bool {
    v.as_str().map_or(false, |s| {
        let trimmed = s.trim();
        !trimmed.is_empty() && trimmed.len() <= max_len
    })
}

pub async fn broadcast_pomodoro_state(handle: &tauri::AppHandle) {
    let state = handle.state::<AppState>();
    let snapshot = state.pomodoro.get_snapshot().await;
    
    let payload = json!({
        "isRunning": snapshot.is_running,
        "isPaused": snapshot.is_paused,
        "timeRemaining": snapshot.time_remaining,
        "totalDuration": snapshot.total_duration,
        "cycleType": snapshot.cycle_type,
        "cyclesCompleted": snapshot.cycles_completed,
        "taskId": snapshot.task_id,
        "taskText": snapshot.task_text,
        "sessionId": snapshot.session_id,
    });

    for label in &["float", "tray-view", "settings", "quickadd"] {
        let _ = handle.emit_to(*label, "pomodoro:stateChanged", payload.clone());
    }
}

// ===== Database - Todo CRUD =====

#[tauri::command]
pub fn get_todos(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let todos = state.db.lock().get_todos().map_err(|e| e.to_string())?;
    Ok(todos.iter().map(|t| serde_json::to_value(t).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn get_active_todos(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let todos = state.db.lock().get_active_todos().map_err(|e| e.to_string())?;
    Ok(todos.iter().map(|t| serde_json::to_value(t).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn get_future_scheduled_todos(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let todos = state.db.lock().get_future_scheduled_todos().map_err(|e| e.to_string())?;
    Ok(todos.iter().map(|t| serde_json::to_value(t).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn add_todo(state: State<'_, AppState>, text: String) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_non_empty_string(&json!(text), 500) {
        return Err(t(&locale, "invalid_text"));
    }
    let todo = state.db.lock().add_todo(text.trim()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_todo(state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) {
        return Err(t(&locale, "invalid_id"));
    }
    let todo = state.db.lock().toggle_todo(id).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_todo(state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) {
        return Err(t(&locale, "invalid_id"));
    }
    state.db.lock().delete_todo(id).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn recover_todo(app: tauri::AppHandle, state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) {
        return Err(t(&locale, "invalid_id"));
    }
    let todo = state.db.lock().recover_todo(id).map_err(|e| e.to_string())?;
    let _ = app.emit_to("float", "data-changed", json!({}));
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_todo(app: tauri::AppHandle, state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) {
        return Err(t(&locale, "invalid_id"));
    }
    let todo = state.db.lock().restore_todo(id).map_err(|e| e.to_string())?;
    let _ = app.emit_to("float", "data-changed", json!({}));
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn archive_todo(app: tauri::AppHandle, state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) {
        return Err(t(&locale, "invalid_id"));
    }
    let todo = state.db.lock().archive_todo(id).map_err(|e| e.to_string())?;
    let _ = app.emit_to("tray-view", "data-changed", json!({}));

    // Auto-categorize if no category and API key is set
    if todo.category.is_none() {
        let todo_clone = todo.clone();
        let app_clone = app.clone();
        let locale = current_locale(&state);
        tokio::spawn(async move {
            let settings = {
                let st = app_clone.state::<AppState>();
                let db = st.db.lock();
                db.get_settings_map().unwrap_or_default()
            };
            if let Some(api_key) = settings.get("api_key").and_then(|v| v.as_str()) {
                if !api_key.is_empty() {
                    let settings_value = Value::Object(settings.clone());
                    let llm = LLMHelper::new(&settings_value, &locale);
                    if let Ok(category) = llm.categorize(&todo_clone.text).await {
                        let st = app_clone.state::<AppState>();
                        let _ = st.db.lock().update_category(todo_clone.id, Some(&category));
                        let _ = app_clone.emit_to("tray-view", "data-changed", json!({}));
                    }
                }
            }
        });
    }

    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_archived(state: State<'_, AppState>, filters: Option<Value>) -> Result<Vec<Value>, String> {
    let f = filters.unwrap_or_default();
    if !f.is_object() {
        return Ok(vec![]);
    }
    let todos = state.db.lock().get_archived(&f).map_err(|e| e.to_string())?;
    Ok(todos.iter().map(|t| serde_json::to_value(t).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn update_note(state: State<'_, AppState>, id: i64, note: String) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) {
        return Err(t(&locale, "invalid_id"));
    }
    let todo = state.db.lock().update_note(id, &note).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_category(state: State<'_, AppState>, id: i64, category: Option<String>) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) {
        return Err(t(&locale, "invalid_id"));
    }
    let todo = state.db.lock().update_category(id, category.as_deref()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_due_date(state: State<'_, AppState>, id: i64, due_date: Option<String>) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) {
        return Err(t(&locale, "invalid_id"));
    }
    if let Some(ref d) = due_date {
        if !d.is_empty() {
            // Validate format: YYYY-MM-DD or YYYY-MM-DD HH:MM or YYYY-MM-DD HH:MM:SS
            let valid = d.len() >= 10
                && d.chars().take(4).all(|c| c.is_ascii_digit())
                && d.chars().nth(4) == Some('-')
                && d.chars().skip(5).take(2).all(|c| c.is_ascii_digit())
                && d.chars().nth(7) == Some('-')
                && d.chars().skip(8).take(2).all(|c| c.is_ascii_digit());
            if !valid {
                return Err(t(&locale, "invalid_date_format"));
            }
        }
    }
    let todo = state.db.lock().set_due_date(id, due_date.as_deref()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_scheduled_date(state: State<'_, AppState>, id: i64, date_str: Option<String>) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) {
        return Err(t(&locale, "invalid_id"));
    }
    let todo = state.db.lock().set_scheduled_date(id, date_str.as_deref()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_categories(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.db.lock().get_categories().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reorder(state: State<'_, AppState>, orders: Vec<Value>) -> Result<Value, String> {
    let parsed: Vec<(i64, i64)> = orders.iter()
        .filter_map(|o| {
            let id = o.get("id")?.as_i64()?;
            let sort = o.get("sort_order")?.as_i64()?;
            Some((id, sort))
        })
        .collect();
    state.db.lock().update_orders(&parsed).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn update_color(state: State<'_, AppState>, id: i64, color: Option<String>) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) {
        return Err(t(&locale, "invalid_id"));
    }
    let todo = state.db.lock().update_color(id, color.as_deref()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_text(state: State<'_, AppState>, id: i64, text: String) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) || !is_non_empty_string(&json!(text), 500) {
        return Err(t(&locale, "invalid_input"));
    }
    let todo = state.db.lock().update_text(id, text.trim()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

// ===== Subtask CRUD =====

#[tauri::command]
pub fn get_subtasks(state: State<'_, AppState>, todo_id: i64) -> Result<Vec<Value>, String> {
    if !is_positive_int(&json!(todo_id)) {
        return Ok(vec![]);
    }
    let subs = state.db.lock().get_subtasks(todo_id).map_err(|e| e.to_string())?;
    Ok(subs.iter().map(|s| serde_json::to_value(s).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn add_subtask(state: State<'_, AppState>, todo_id: i64, text: String) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(todo_id)) || !is_non_empty_string(&json!(text), 500) {
        return Err(t(&locale, "invalid_input"));
    }
    let sub = state.db.lock().add_subtask(todo_id, text.trim()).map_err(|e| e.to_string())?;
    serde_json::to_value(sub).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_subtask(state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) {
        return Err(t(&locale, "invalid_id"));
    }
    let sub = state.db.lock().toggle_subtask(id).map_err(|e| e.to_string())?;
    serde_json::to_value(sub).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_subtask(state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Ok(json!({ "success": false }));
    }
    state.db.lock().delete_subtask(id).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn update_subtask_text(state: State<'_, AppState>, id: i64, text: String) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_positive_int(&json!(id)) || !is_non_empty_string(&json!(text), 500) {
        return Err(t(&locale, "invalid_input"));
    }
    let sub = state.db.lock().update_subtask_text(id, text.trim()).map_err(|e| e.to_string())?;
    serde_json::to_value(sub).map_err(|e| e.to_string())
}

// ===== Settings =====

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Value, String> {
    let map = state.db.lock().get_settings_map().map_err(|e| e.to_string())?;
    Ok(Value::Object(map))
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: Value) -> Result<Value, String> {
    if let Value::Object(map) = settings {
        state.db.lock().save_settings(&map).map_err(|e| e.to_string())?;
        Ok(json!({ "success": true }))
    } else {
        Err("Invalid settings".to_string())
    }
}

#[tauri::command]
pub fn update_locale(app: tauri::AppHandle, state: State<'_, AppState>, locale: String) -> Result<Value, String> {
    let locale = if locale.is_empty() { "zh-CN".to_string() } else { locale };
    *state.locale.lock() = locale.clone();
    let mut map = serde_json::Map::new();
    map.insert("locale".to_string(), json!(locale));
    state.db.lock().save_settings(&map).map_err(|e| e.to_string())?;
    if let Some(tray) = state.tray.lock().as_ref() {
        let menu = crate::build_tray_menu(&app, &locale).map_err(|e| e.to_string())?;
        let _ = tray.set_menu(Some(menu));
        let labels = crate::tray_labels(&locale);
        let _ = tray.set_tooltip(Some(labels.tooltip));
    }
    Ok(json!({ "success": true, "locale": locale }))
}

// ===== Work Analysis =====

#[tauri::command]
pub fn get_work_analysis(state: State<'_, AppState>, period: String) -> Result<Value, String> {
    let valid = ["week", "month", "year"];
    let p = if valid.contains(&period.as_str()) { &period } else { "week" };
    let locale = current_locale(&state);
    let analysis = state.db.lock().get_work_analysis(p, Some(&locale)).map_err(|e| e.to_string())?;
    serde_json::to_value(analysis).map_err(|e| e.to_string())
}

// ===== LLM =====

#[tauri::command]
pub async fn llm_categorize(state: State<'_, AppState>, text: String) -> Result<Option<String>, String> {
    let locale = current_locale(&state);
    let settings = state.db.lock().get_settings_map().map_err(|e| e.to_string())?;
    if settings.get("api_key").and_then(|v| v.as_str()).map_or(true, |s| s.is_empty()) {
        return Ok(None);
    }
    let llm = LLMHelper::new(&Value::Object(settings), &locale);
    llm.categorize(&text).await.map(Some).or_else(|_| Ok(None))
}

#[tauri::command]
pub async fn llm_analyze_work(state: State<'_, AppState>, data: Value) -> Result<Option<String>, String> {
    let locale = current_locale(&state);
    let settings = state.db.lock().get_settings_map().map_err(|e| e.to_string())?;
    if settings.get("api_key").and_then(|v| v.as_str()).map_or(true, |s| s.is_empty()) {
        return Ok(None);
    }
    let llm = LLMHelper::new(&Value::Object(settings), &locale);
    llm.analyze_work(&data).await.map(Some).or_else(|_| Ok(None))
}

#[tauri::command]
pub async fn llm_test(state: State<'_, AppState>, settings: Value) -> Result<Value, String> {
    let locale = current_locale(&state);
    if settings["api_key"].as_str().map_or(true, |s| s.is_empty()) {
        return Ok(json!({ "success": false, "error": t(&locale, "missing_api_key") }));
    }
    let llm = LLMHelper::new(&settings, &locale);
    match llm.test().await {
        Ok(msg) => Ok(json!({ "success": true, "message": msg })),
        Err(e) => Ok(json!({ "success": false, "error": e })),
    }
}

// ===== Notification =====

#[tauri::command]
pub async fn test_notification(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    let locale = current_locale(&state);
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification()
        .builder()
        .title(t(&locale, "notification_title"))
        .body(t(&locale, "notification_test_body"))
        .show();
    Ok(json!({ "success": true }))
}

// ===== Shortcuts =====

#[tauri::command]
pub fn get_shortcuts(state: State<'_, AppState>) -> Result<Value, String> {
    let settings = state.db.lock().get_settings_map().map_err(|e| e.to_string())?;
    let default_toggle = if cfg!(target_os = "macos") { "Cmd+Shift+T" } else { "Ctrl+Shift+T" };
    let default_quickadd = if cfg!(target_os = "macos") { "Cmd+Shift+Space" } else { "Ctrl+Shift+Space" };
    
    Ok(json!({
        "toggle": settings.get("shortcut_toggle").and_then(|v| v.as_str()).unwrap_or(default_toggle),
        "quickadd": settings.get("shortcut_quickadd").and_then(|v| v.as_str()).unwrap_or(default_quickadd),
    }))
}

#[tauri::command]
pub fn update_shortcuts(app: tauri::AppHandle, state: State<'_, AppState>, toggle: String, quickadd: String) -> Result<Value, String> {
    // Get old shortcuts to unregister them first
    let (old_toggle, old_quickadd) = {
        let settings = state.db.lock().get_settings_map().map_err(|e| e.to_string())?;
        let default_toggle = if cfg!(target_os = "macos") { "Cmd+Shift+T" } else { "Ctrl+Shift+T" };
        let default_quickadd = if cfg!(target_os = "macos") { "Cmd+Shift+Space" } else { "Ctrl+Shift+Space" };
        (
            settings.get("shortcut_toggle").and_then(|v| v.as_str()).unwrap_or(default_toggle).to_string(),
            settings.get("shortcut_quickadd").and_then(|v| v.as_str()).unwrap_or(default_quickadd).to_string(),
        )
    };

    // Unregister old shortcuts
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    if let Ok(old_sc) = old_toggle.parse::<tauri_plugin_global_shortcut::Shortcut>() {
        let _ = app.global_shortcut().unregister(old_sc);
    }
    if let Ok(old_sc) = old_quickadd.parse::<tauri_plugin_global_shortcut::Shortcut>() {
        let _ = app.global_shortcut().unregister(old_sc);
    }

    // Save new shortcuts to DB
    let mut map = serde_json::Map::new();
    map.insert("shortcut_toggle".to_string(), json!(toggle));
    map.insert("shortcut_quickadd".to_string(), json!(quickadd));
    state.db.lock().save_settings(&map).map_err(|e| e.to_string())?;

    // Register new shortcuts
    for (label, key) in [("toggle", &toggle), ("quickadd", &quickadd)] {
        match key.parse::<tauri_plugin_global_shortcut::Shortcut>() {
            Ok(sc) => match app.global_shortcut().register(sc) {
                Ok(_) => println!("[Shortcut] Re-registered {}: {}", label, key),
                Err(e) => eprintln!("[Shortcut] Failed to re-register {} ({}): {}", label, key, e),
            },
            Err(e) => eprintln!("[Shortcut] Invalid format {} ({}): {}", label, key, e),
        }
    }

    Ok(json!({ "success": true }))
}

// ===== Quick Add =====

#[tauri::command]
pub fn quick_add(app: tauri::AppHandle, state: State<'_, AppState>, text: String, category: Option<String>, due_date: Option<String>) -> Result<Value, String> {
    let locale = current_locale(&state);
    if !is_non_empty_string(&json!(text), 500) {
        return Err(t(&locale, "invalid_text"));
    }
    let trimmed = text.trim().to_string();
    let todo = state.db.lock().add_todo(&trimmed).map_err(|e| e.to_string())?;
    if let Some(ref cat) = category {
        let _ = state.db.lock().update_category(todo.id, Some(cat));
    }
    if let Some(ref dd) = due_date {
        let _ = state.db.lock().set_due_date(todo.id, Some(&format!("{} 23:59:59", dd)));
    }
    let _ = app.emit_to("float", "data-changed", json!({}));
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn close_quick_add(window: Window) -> Result<(), String> {
    let _ = window.hide();
    Ok(())
}

// ===== Export =====

#[tauri::command]
pub async fn export_csv(app: tauri::AppHandle, state: State<'_, AppState>, filters: Value) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let locale = current_locale(&state);
    let export_type = filters.get("exportType").and_then(|v| v.as_str()).unwrap_or("active");
    let items = match export_type {
        "archived" => state.db.lock().get_archived(&filters).map_err(|e| e.to_string())?,
        "all" => {
            let mut active = state.db.lock().get_todos().map_err(|e| e.to_string())?;
            let archived = state.db.lock().get_archived(&filters).map_err(|e| e.to_string())?;
            active.extend(archived);
            active
        }
        _ => state.db.lock().get_todos().map_err(|e| e.to_string())?,
    };

    if items.is_empty() {
        return Ok(json!({ "success": false, "message": t(&locale, "no_data") }));
    }

    // Build CSV
    let mut csv = String::from(t(&locale, "csv_header"));
    for item in &items {
        let status = if item.completed == 1 { t(&locale, "status_done") } else { t(&locale, "status_todo") };
        let default_category = t(&locale, "category_uncategorized");
        let category = item.category.as_deref().unwrap_or(default_category.as_str());
        let escape = |s: &str| format!("\"{}\"", s.replace('"', "\"\""));
        csv.push_str(&format!("{},{},{},{},{},{},{},{}\n",
            escape(&item.text),
            status,
            item.due_date.as_deref().unwrap_or(""),
            escape(category),
            escape(item.note.as_deref().unwrap_or("")),
            item.created_at.as_deref().unwrap_or(""),
            item.completed_at.as_deref().unwrap_or(""),
            item.archived_at.as_deref().unwrap_or(""),
        ));
    }

    let default_name = format!("todofloat-export-{}.csv", chrono::Local::now().format("%Y-%m-%d"));
    let csv_clone = csv.clone();
    let file_path = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter(t(&locale, "file_type_csv"), &["csv"])
            .set_file_name(&default_name)
            .blocking_save_file()
    }).await.map_err(|e| e.to_string())?;

    if let Some(file_path) = file_path {
        let path = std::path::PathBuf::from(file_path.to_string());
        std::fs::write(&path, csv_clone).map_err(|e| e.to_string())?;
        Ok(json!({ "success": true, "filePath": path.to_string_lossy() }))
    } else {
        Ok(json!({ "success": false }))
    }
}

// ===== Window Control =====

#[tauri::command]
pub fn window_close(window: Window) -> Result<(), String> {
    println!("[Close] Hiding window: {}", window.label());
    let _ = window.hide();
    Ok(())
}

#[tauri::command]
pub fn window_minimize(window: Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_maximize(window: Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_is_maximized(window: Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_get_scale(state: State<'_, AppState>) -> Result<f64, String> {
    Ok(*state.scale.lock())
}

#[tauri::command]
pub fn window_adjust_scale(app: tauri::AppHandle, state: State<'_, AppState>, scale: f64) -> Result<f64, String> {
    let old_scale = *state.scale.lock();
    let clamped = scale.clamp(0.3, 2.5);

    // Resize the float window proportionally with the scale change
    if old_scale > 0.0 && (clamped - old_scale).abs() > f64::EPSILON {
        if let Some(window) = app.get_webview_window("float") {
            if let Ok(size) = window.outer_size() {
                let ratio = clamped / old_scale;
                let new_width = ((size.width as f64) * ratio).round() as u32;
                let new_height = ((size.height as f64) * ratio).round() as u32;
                let _ = window.set_size(tauri::PhysicalSize::new(new_width, new_height));
            }
        }
    }

    *state.scale.lock() = clamped;
    let _ = app.emit_to("float", "scale-changed", clamped);
    Ok(clamped)
}

#[tauri::command]
pub fn window_set_opacity(app: tauri::AppHandle, opacity: f64) -> Result<(), String> {
    let clamped = opacity.clamp(0.2, 1.0);
    let _ = app.emit_to("float", "opacity-changed", clamped);
    Ok(())
}

#[tauri::command]
pub fn window_apply_theme(app: tauri::AppHandle, theme: String) -> Result<(), String> {
    for label in &["float", "tray-view", "settings", "quickadd"] {
        let _ = app.emit_to(*label, "theme-changed", &theme);
    }
    Ok(())
}

#[tauri::command]
pub fn open_tray_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("tray-view") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = app.emit_to("tray-view", "navigate", "/tray");
    }
    Ok(())
}

#[tauri::command]
pub fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

// ===== App - Backup/Restore =====

#[tauri::command]
pub async fn backup_database(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let locale = current_locale(&state);
    let db_path = state.db.lock().get_db_path().clone();
    let default_name = format!("todo-app-backup-{}.db", chrono::Local::now().format("%Y-%m-%d"));

    let dialog_locale = locale.clone();
    let file_path = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter(t(&dialog_locale, "file_type_db"), &["db"])
            .set_file_name(&default_name)
            .blocking_save_file()
    }).await.map_err(|e| e.to_string())?;

    if let Some(file_path) = file_path {
        let path = std::path::PathBuf::from(file_path.to_string());
        std::fs::copy(&db_path, &path).map_err(|e| e.to_string())?;
        Ok(json!({ "success": true, "path": path.to_string_lossy() }))
    } else {
        Ok(json!({ "success": false, "error": t(&locale, "user_cancelled") }))
    }
}

#[tauri::command]
pub async fn restore_database(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let locale = current_locale(&state);
    let db_path = state.db.lock().get_db_path().clone();

    let dialog_locale = locale.clone();
    let file_path = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter(t(&dialog_locale, "file_type_db"), &["db"])
            .blocking_pick_file()
    }).await.map_err(|e| e.to_string())?;

    if let Some(file_path) = file_path {
        let path = std::path::PathBuf::from(file_path.to_string());
        // Drop the current connection before overwriting the file
        state.db.lock().close().map_err(|e| e.to_string())?;
        std::fs::copy(&path, &db_path).map_err(|e| e.to_string())?;
        // Reopen the connection to the restored database
        state.db.lock().reopen().map_err(|e| e.to_string())?;
        Ok(json!({ "success": true }))
    } else {
        Ok(json!({ "success": false, "error": t(&locale, "user_cancelled") }))
    }
}

// ===== Pomodoro =====

#[tauri::command]
pub async fn pomodoro_get_state(state: State<'_, AppState>) -> Result<Value, String> {
    let snapshot = state.pomodoro.get_snapshot().await;
    serde_json::to_value(snapshot).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pomodoro_start(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    task_id: Option<i64>,
    task_text: Option<String>,
) -> Result<Value, String> {
    // Get DB data FIRST (before pomodoro lock)
    let (focus_minutes, session) = {
        let settings = state.db.lock().get_settings_map().map_err(|e| e.to_string())?;
        let focus_minutes = settings.get("pomodoro_focus")
            .and_then(|v| v.as_i64()).unwrap_or(25);
        let duration = focus_minutes * 60;

        let session = state.db.lock().add_pomodoro_session(
            task_id,
            task_text.as_deref(),
            duration,
            "focus",
        ).map_err(|e| e.to_string())?;
        (focus_minutes, session)
    };

    // THEN acquire pomodoro lock
    let locale = current_locale(&state);
    let mut inner = state.pomodoro.get_inner().await;
    if inner.is_running {
        return Ok(json!({ "success": false, "error": t(&locale, "pomodoro_already_running") }));
    }

    inner.start(task_id, task_text.clone(), focus_minutes * 60, session.id);
    let snapshot = inner.snapshot();
    drop(inner);  // Release lock before broadcasting

    // Broadcast initial state
    let payload = json!({
        "isRunning": snapshot.is_running,
        "isPaused": snapshot.is_paused,
        "timeRemaining": snapshot.time_remaining,
        "totalDuration": snapshot.total_duration,
        "cycleType": snapshot.cycle_type,
        "cyclesCompleted": snapshot.cycles_completed,
        "taskId": snapshot.task_id,
        "taskText": snapshot.task_text,
        "sessionId": snapshot.session_id,
    });
    for label in &["float", "tray-view", "settings", "quickadd"] {
        let _ = app.emit_to(*label, "pomodoro:stateChanged", payload.clone());
    }

    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn pomodoro_pause(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    {
        let mut inner = state.pomodoro.get_inner().await;
        if !inner.is_running || inner.is_paused {
            return Ok(json!({ "success": false }));
        }
        inner.pause();
    }
    broadcast_pomodoro_state(&app).await;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn pomodoro_resume(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    {
        let mut inner = state.pomodoro.get_inner().await;
        if !inner.is_running || !inner.is_paused {
            return Ok(json!({ "success": false }));
        }
        inner.resume();
    }
    broadcast_pomodoro_state(&app).await;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub async fn pomodoro_stop(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    let locale = current_locale(&state);
    let (session_id, actual_duration) = {
        let mut inner = state.pomodoro.get_inner().await;
        if !inner.is_running && !inner.is_paused {
            return Ok(json!({ "success": false, "error": t(&locale, "pomodoro_not_running") }));
        }
        inner.stop()
    };

    // Record session as incomplete
    if let Some(sid) = session_id {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let _ = state.db.lock().update_pomodoro_session(sid, Some(&now), actual_duration, Some(0));
    }

    broadcast_pomodoro_state(&app).await;
    Ok(json!({ "success": true }))
}

/// Records the current pomodoro cycle as completed and transitions to the next state:
/// - focus → auto-start a short/long break
/// - break → go idle
/// This is called both by the backend tick loop and by the manual `pomodoro_complete` command.
pub async fn complete_and_transition_pomodoro(app: &tauri::AppHandle) -> Result<(), String> {
    // Gather pomodoro state in one short-lived scope.
    let (session_id, was_focus, current_task_id, task_text, cycles_completed) = {
        let state = app.state::<AppState>();
        let inner = state.pomodoro.get_inner().await;
        (
            inner.session_id,
            inner.cycle_type == "focus",
            inner.task_id,
            inner.task_text.clone(),
            inner.cycles_completed,
        )
    };

    // Record completed session
    if let Some(sid) = session_id {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let actual_duration = {
            let state = app.state::<AppState>();
            let inner = state.pomodoro.get_inner().await;
            inner.actual_elapsed_secs()
        };
        let state = app.state::<AppState>();
        let _ = state.db.lock().update_pomodoro_session(
            sid, Some(&now), actual_duration, Some(1)
        );
    }

    if was_focus {
        // Decide break length and create the break session in a scoped block so
        // the DB lock is released before we start the break in pomodoro state.
        let (break_dur, break_type, break_session) = {
            let state = app.state::<AppState>();
            let settings = state.db.lock().get_settings_map().unwrap_or_default();
            let before_long = settings.get("pomodoro_cycles_before_long")
                .and_then(|v| v.as_i64()).unwrap_or(4);
            // cycles_completed was already incremented by InnerState::tick()
            let (break_dur, break_type) = if cycles_completed % before_long == 0 {
                (settings.get("pomodoro_long_break").and_then(|v| v.as_i64()).unwrap_or(15) * 60,
                 "long_break".to_string())
            } else {
                (settings.get("pomodoro_short_break").and_then(|v| v.as_i64()).unwrap_or(5) * 60,
                 "short_break".to_string())
            };
            let break_session = state.db.lock().add_pomodoro_session(
                current_task_id, task_text.as_deref(), break_dur, &break_type,
            ).ok();
            (break_dur, break_type, break_session)
        };

        if let Some(s) = break_session {
            let state = app.state::<AppState>();
            let mut inner = state.pomodoro.get_inner().await;
            inner.start_break(current_task_id, task_text, break_dur, break_type, s.id);
        }
    } else {
        // Break completed → go idle
        let state = app.state::<AppState>();
        let mut inner = state.pomodoro.get_inner().await;
        inner.is_running = false;
    }

    broadcast_pomodoro_state(app).await;
    Ok(())
}

#[tauri::command]
pub async fn pomodoro_complete(
    app: tauri::AppHandle,
    _state: State<'_, AppState>,
    _actual_duration: i64,
    _task_text: Option<String>,
) -> Result<Value, String> {
    // Natural completion is now driven by the backend tick loop. This command is kept for
    // compatibility but immediately delegates to the same transition logic.
    complete_and_transition_pomodoro(&app).await?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn pomodoro_get_sessions(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let sessions = state.db.lock().get_pomodoro_sessions(50).map_err(|e| e.to_string())?;
    Ok(sessions.iter().map(|s| serde_json::to_value(s).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn pomodoro_get_stats(state: State<'_, AppState>, period: String) -> Result<Value, String> {
    let valid = ["week", "month", "year"];
    let p = if valid.contains(&period.as_str()) { &period } else { "week" };
    let stats = state.db.lock().get_pomodoro_stats(p).map_err(|e| e.to_string())?;
    serde_json::to_value(stats).map_err(|e| e.to_string())
}
