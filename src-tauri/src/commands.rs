use crate::llm::LLMHelper;
use crate::AppState;
use serde_json::{json, Value};
use tauri::{Emitter, Manager, State, Window};

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

async fn broadcast_pomodoro_state(handle: &tauri::AppHandle) {
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
    let todos = state.db.lock().unwrap().get_todos().map_err(|e| e.to_string())?;
    Ok(todos.iter().map(|t| serde_json::to_value(t).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn get_active_todos(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let todos = state.db.lock().unwrap().get_active_todos().map_err(|e| e.to_string())?;
    Ok(todos.iter().map(|t| serde_json::to_value(t).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn get_future_scheduled_todos(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let todos = state.db.lock().unwrap().get_future_scheduled_todos().map_err(|e| e.to_string())?;
    Ok(todos.iter().map(|t| serde_json::to_value(t).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn add_todo(state: State<'_, AppState>, text: String) -> Result<Value, String> {
    if !is_non_empty_string(&json!(text), 500) {
        return Err("Invalid text".to_string());
    }
    let todo = state.db.lock().unwrap().add_todo(text.trim()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_todo(state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Err("Invalid id".to_string());
    }
    let todo = state.db.lock().unwrap().toggle_todo(id).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_todo(state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Err("Invalid id".to_string());
    }
    state.db.lock().unwrap().delete_todo(id).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn recover_todo(app: tauri::AppHandle, state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Err("Invalid id".to_string());
    }
    let todo = state.db.lock().unwrap().recover_todo(id).map_err(|e| e.to_string())?;
    let _ = app.emit_to("float", "data-changed", json!({}));
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn restore_todo(app: tauri::AppHandle, state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Err("Invalid id".to_string());
    }
    let todo = state.db.lock().unwrap().restore_todo(id).map_err(|e| e.to_string())?;
    let _ = app.emit_to("float", "data-changed", json!({}));
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn archive_todo(app: tauri::AppHandle, state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Err("Invalid id".to_string());
    }
    let todo = state.db.lock().unwrap().archive_todo(id).map_err(|e| e.to_string())?;
    let _ = app.emit_to("tray-view", "data-changed", json!({}));

    // Auto-categorize if no category and API key is set
    if todo.category.is_none() {
        let todo_clone = todo.clone();
        let app_clone = app.clone();
        tokio::spawn(async move {
            let settings = {
                let st = app_clone.state::<AppState>();
                let db = st.db.lock().unwrap();
                db.get_settings_map().unwrap_or_default()
            };
            if let Some(api_key) = settings.get("api_key").and_then(|v| v.as_str()) {
                if !api_key.is_empty() {
                    let settings_value = Value::Object(settings.clone());
                    let llm = LLMHelper::new(&settings_value);
                    if let Ok(category) = llm.categorize(&todo_clone.text).await {
                        let st = app_clone.state::<AppState>();
                        let _ = st.db.lock().unwrap().update_category(todo_clone.id, Some(&category));
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
    let todos = state.db.lock().unwrap().get_archived(&f).map_err(|e| e.to_string())?;
    Ok(todos.iter().map(|t| serde_json::to_value(t).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn update_note(state: State<'_, AppState>, id: i64, note: String) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Err("Invalid id".to_string());
    }
    let todo = state.db.lock().unwrap().update_note(id, &note).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_category(state: State<'_, AppState>, id: i64, category: Option<String>) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Err("Invalid id".to_string());
    }
    let todo = state.db.lock().unwrap().update_category(id, category.as_deref()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_due_date(state: State<'_, AppState>, id: i64, due_date: Option<String>) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Err("Invalid id".to_string());
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
                return Err("Invalid date format".to_string());
            }
        }
    }
    let todo = state.db.lock().unwrap().set_due_date(id, due_date.as_deref()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_scheduled_date(state: State<'_, AppState>, id: i64, date_str: Option<String>) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Err("Invalid id".to_string());
    }
    let todo = state.db.lock().unwrap().set_scheduled_date(id, date_str.as_deref()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_categories(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.db.lock().unwrap().get_categories().map_err(|e| e.to_string())
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
    state.db.lock().unwrap().update_orders(&parsed).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn update_color(state: State<'_, AppState>, id: i64, color: Option<String>) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Err("Invalid id".to_string());
    }
    let todo = state.db.lock().unwrap().update_color(id, color.as_deref()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_text(state: State<'_, AppState>, id: i64, text: String) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) || !is_non_empty_string(&json!(text), 500) {
        return Err("Invalid input".to_string());
    }
    let todo = state.db.lock().unwrap().update_text(id, text.trim()).map_err(|e| e.to_string())?;
    serde_json::to_value(todo).map_err(|e| e.to_string())
}

// ===== Subtask CRUD =====

#[tauri::command]
pub fn get_subtasks(state: State<'_, AppState>, todo_id: i64) -> Result<Vec<Value>, String> {
    if !is_positive_int(&json!(todo_id)) {
        return Ok(vec![]);
    }
    let subs = state.db.lock().unwrap().get_subtasks(todo_id).map_err(|e| e.to_string())?;
    Ok(subs.iter().map(|s| serde_json::to_value(s).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn add_subtask(state: State<'_, AppState>, todo_id: i64, text: String) -> Result<Value, String> {
    if !is_positive_int(&json!(todo_id)) || !is_non_empty_string(&json!(text), 500) {
        return Err("Invalid input".to_string());
    }
    let sub = state.db.lock().unwrap().add_subtask(todo_id, text.trim()).map_err(|e| e.to_string())?;
    serde_json::to_value(sub).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_subtask(state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Err("Invalid id".to_string());
    }
    let sub = state.db.lock().unwrap().toggle_subtask(id).map_err(|e| e.to_string())?;
    serde_json::to_value(sub).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_subtask(state: State<'_, AppState>, id: i64) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) {
        return Ok(json!({ "success": false }));
    }
    state.db.lock().unwrap().delete_subtask(id).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn update_subtask_text(state: State<'_, AppState>, id: i64, text: String) -> Result<Value, String> {
    if !is_positive_int(&json!(id)) || !is_non_empty_string(&json!(text), 500) {
        return Err("Invalid input".to_string());
    }
    let sub = state.db.lock().unwrap().update_subtask_text(id, text.trim()).map_err(|e| e.to_string())?;
    serde_json::to_value(sub).map_err(|e| e.to_string())
}

// ===== Settings =====

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Value, String> {
    let map = state.db.lock().unwrap().get_settings_map().map_err(|e| e.to_string())?;
    Ok(Value::Object(map))
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: Value) -> Result<Value, String> {
    if let Value::Object(map) = settings {
        state.db.lock().unwrap().save_settings(&map).map_err(|e| e.to_string())?;
        Ok(json!({ "success": true }))
    } else {
        Err("Invalid settings".to_string())
    }
}

// ===== Work Analysis =====

#[tauri::command]
pub fn get_work_analysis(state: State<'_, AppState>, period: String) -> Result<Value, String> {
    let valid = ["week", "month", "year"];
    let p = if valid.contains(&period.as_str()) { &period } else { "week" };
    let analysis = state.db.lock().unwrap().get_work_analysis(p).map_err(|e| e.to_string())?;
    serde_json::to_value(analysis).map_err(|e| e.to_string())
}

// ===== LLM =====

#[tauri::command]
pub async fn llm_categorize(state: State<'_, AppState>, text: String) -> Result<Option<String>, String> {
    let settings = state.db.lock().unwrap().get_settings_map().map_err(|e| e.to_string())?;
    if settings.get("api_key").and_then(|v| v.as_str()).map_or(true, |s| s.is_empty()) {
        return Ok(None);
    }
    let llm = LLMHelper::new(&Value::Object(settings));
    llm.categorize(&text).await.map(Some).or_else(|_| Ok(None))
}

#[tauri::command]
pub async fn llm_analyze_work(state: State<'_, AppState>, data: Value) -> Result<Option<String>, String> {
    let settings = state.db.lock().unwrap().get_settings_map().map_err(|e| e.to_string())?;
    if settings.get("api_key").and_then(|v| v.as_str()).map_or(true, |s| s.is_empty()) {
        return Ok(None);
    }
    let llm = LLMHelper::new(&Value::Object(settings));
    llm.analyze_work(&data).await.map(Some).or_else(|_| Ok(None))
}

#[tauri::command]
pub async fn llm_test(settings: Value) -> Result<Value, String> {
    if settings["api_key"].as_str().map_or(true, |s| s.is_empty()) {
        return Ok(json!({ "success": false, "error": "请先填写 API Key" }));
    }
    let llm = LLMHelper::new(&settings);
    match llm.test().await {
        Ok(msg) => Ok(json!({ "success": true, "message": msg })),
        Err(e) => Ok(json!({ "success": false, "error": e })),
    }
}

// ===== Notification =====

#[tauri::command]
pub async fn test_notification(app: tauri::AppHandle) -> Result<Value, String> {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification()
        .builder()
        .title("TodoFloat 提醒")
        .body("这是一条测试通知，如果你看到了说明提醒功能正常 ✔")
        .show();
    Ok(json!({ "success": true }))
}

// ===== Shortcuts =====

#[tauri::command]
pub fn get_shortcuts(state: State<'_, AppState>) -> Result<Value, String> {
    let settings = state.db.lock().unwrap().get_settings_map().map_err(|e| e.to_string())?;
    let default_toggle = if cfg!(target_os = "macos") { "Cmd+Shift+T" } else { "Ctrl+Shift+T" };
    let default_quickadd = if cfg!(target_os = "macos") { "Cmd+Shift+Space" } else { "Ctrl+Shift+Space" };
    
    Ok(json!({
        "toggle": settings.get("shortcut_toggle").and_then(|v| v.as_str()).unwrap_or(default_toggle),
        "quickadd": settings.get("shortcut_quickadd").and_then(|v| v.as_str()).unwrap_or(default_quickadd),
    }))
}

#[tauri::command]
pub fn update_shortcuts(state: State<'_, AppState>, toggle: String, quickadd: String) -> Result<Value, String> {
    let mut map = serde_json::Map::new();
    map.insert("shortcut_toggle".to_string(), json!(toggle));
    map.insert("shortcut_quickadd".to_string(), json!(quickadd));
    state.db.lock().unwrap().save_settings(&map).map_err(|e| e.to_string())?;
    Ok(json!({ "success": true }))
}

// ===== Quick Add =====

#[tauri::command]
pub fn quick_add(app: tauri::AppHandle, state: State<'_, AppState>, text: String, category: Option<String>, due_date: Option<String>) -> Result<Value, String> {
    if !is_non_empty_string(&json!(text), 500) {
        return Err("Invalid text".to_string());
    }
    let trimmed = text.trim().to_string();
    let todo = state.db.lock().unwrap().add_todo(&trimmed).map_err(|e| e.to_string())?;
    if let Some(ref cat) = category {
        let _ = state.db.lock().unwrap().update_category(todo.id, Some(cat));
    }
    if let Some(ref dd) = due_date {
        let _ = state.db.lock().unwrap().set_due_date(todo.id, Some(&format!("{} 23:59:59", dd)));
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
    let export_type = filters.get("exportType").and_then(|v| v.as_str()).unwrap_or("active");
    let items = match export_type {
        "archived" => state.db.lock().unwrap().get_archived(&filters).map_err(|e| e.to_string())?,
        "all" => {
            let mut active = state.db.lock().unwrap().get_todos().map_err(|e| e.to_string())?;
            let archived = state.db.lock().unwrap().get_archived(&filters).map_err(|e| e.to_string())?;
            active.extend(archived);
            active
        }
        _ => state.db.lock().unwrap().get_todos().map_err(|e| e.to_string())?,
    };

    if items.is_empty() {
        return Ok(json!({ "success": false, "message": "没有可导出的数据" }));
    }

    // Build CSV
    let mut csv = String::from("﻿任务内容,状态,截止日期,类别,备注,创建时间,完成时间,归档时间\n");
    for item in &items {
        let status = if item.completed == 1 { "已完成" } else { "待办" };
        let category = item.category.as_deref().unwrap_or("未分类");
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
            .add_filter("CSV 文件", &["csv"])
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
    Ok(*state.scale.lock().unwrap())
}

#[tauri::command]
pub fn window_adjust_scale(app: tauri::AppHandle, state: State<'_, AppState>, scale: f64) -> Result<f64, String> {
    let clamped = scale.clamp(0.3, 2.5);
    *state.scale.lock().unwrap() = clamped;
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
    let db_path = state.db.lock().unwrap().get_db_path().clone();
    let default_name = format!("todo-app-backup-{}.db", chrono::Local::now().format("%Y-%m-%d"));

    let file_path = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("数据库文件", &["db"])
            .set_file_name(&default_name)
            .blocking_save_file()
    }).await.map_err(|e| e.to_string())?;

    if let Some(file_path) = file_path {
        let path = std::path::PathBuf::from(file_path.to_string());
        std::fs::copy(&db_path, &path).map_err(|e| e.to_string())?;
        Ok(json!({ "success": true, "path": path.to_string_lossy() }))
    } else {
        Ok(json!({ "success": false, "error": "用户取消" }))
    }
}

#[tauri::command]
pub async fn restore_database(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    use tauri_plugin_dialog::DialogExt;
    let db_path = state.db.lock().unwrap().get_db_path().clone();

    let file_path = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("数据库文件", &["db"])
            .blocking_pick_file()
    }).await.map_err(|e| e.to_string())?;

    if let Some(file_path) = file_path {
        let path = std::path::PathBuf::from(file_path.to_string());
        let _ = state.db.lock().unwrap().close();
        std::fs::copy(&path, &db_path).map_err(|e| e.to_string())?;
        Ok(json!({ "success": true }))
    } else {
        Ok(json!({ "success": false, "error": "用户取消" }))
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
        let settings = state.db.lock().unwrap().get_settings_map().map_err(|e| e.to_string())?;
        let focus_minutes = settings.get("pomodoro_focus")
            .and_then(|v| v.as_i64()).unwrap_or(25);
        let duration = focus_minutes * 60;

        let session = state.db.lock().unwrap().add_pomodoro_session(
            task_id,
            task_text.as_deref(),
            duration,
            "focus",
        ).map_err(|e| e.to_string())?;
        (focus_minutes, session)
    };

    // THEN acquire pomodoro lock
    let mut inner = state.pomodoro.get_inner().await;
    if inner.is_running {
        return Ok(json!({ "success": false, "error": "番茄钟已在运行" }));
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

    // Start timer tick with auto-cycle (focus → break → ...)
    let app_clone = app.clone();
    let task_id_clone = task_id;
    let task_text_clone = task_text.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(1));
        let current_task_id = task_id_clone;
        let current_task_text = task_text_clone;
        let mut last_broadcast_paused = false;
        loop {
            interval.tick().await;

            let (completed, is_paused_now) = {
                let state_ref = app_clone.state::<AppState>();
                let mut inner = state_ref.pomodoro.get_inner().await;
                if !inner.is_running { break; }
                let paused = inner.is_paused;
                let result = if paused { None } else { inner.tick() };
                (result, paused)
            };

            // Skip broadcast when paused state hasn't changed
            if is_paused_now && last_broadcast_paused {
                continue;
            }
            last_broadcast_paused = is_paused_now;

            if let Some(tick_result) = completed {
                if tick_result.completed {
                    // Record completed session in DB
                    {
                        let state_ref = app_clone.state::<AppState>();
                        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                        if let Some(sid) = tick_result.session_id {
                            let _ = state_ref.db.lock().unwrap().update_pomodoro_session(
                                sid, Some(&now), tick_result.actual_duration, Some(1),
                            );
                        }
                    }

                    if tick_result.cycle_type == "focus" {
                        // Focus completed → auto-start break
                        let (break_dur, break_type): (i64, String) = {
                            let state_ref = app_clone.state::<AppState>();
                            let settings = state_ref.db.lock().unwrap().get_settings_map().unwrap_or_default();
                            let total = tick_result.cycles_completed;
                            let before_long = settings.get("pomodoro_cycles_before_long")
                                .and_then(|v| v.as_i64()).unwrap_or(4);
                            if total % before_long == 0 {
                                (settings.get("pomodoro_long_break").and_then(|v| v.as_i64()).unwrap_or(15) * 60,
                                 "long_break".to_string())
                            } else {
                                (settings.get("pomodoro_short_break").and_then(|v| v.as_i64()).unwrap_or(5) * 60,
                                 "short_break".to_string())
                            }
                        };

                        let break_session = {
                            let state_ref = app_clone.state::<AppState>();
                            let db = state_ref.db.lock().unwrap();
                            db.add_pomodoro_session(
                                current_task_id, current_task_text.as_deref(),
                                break_dur, &break_type,
                            ).ok()
                        };

                        if let Some(s) = break_session {
                            let state_ref = app_clone.state::<AppState>();
                            let mut inner = state_ref.pomodoro.get_inner().await;
                            let task_text_for_break = current_task_text.clone();
                            inner.start_break(
                                current_task_id, task_text_for_break,
                                break_dur, break_type, s.id,
                            );
                        }
                    } else {
                        // Break completed → idle
                        let state_ref = app_clone.state::<AppState>();
                        let mut inner = state_ref.pomodoro.get_inner().await;
                        inner.is_running = false;
                    }

                    broadcast_pomodoro_state(&app_clone).await;
                }
            } else if !is_paused_now {
                broadcast_pomodoro_state(&app_clone).await;
            }
        }
    });

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
    let (session_id, actual_duration) = {
        let mut inner = state.pomodoro.get_inner().await;
        if !inner.is_running && !inner.is_paused {
            return Ok(json!({ "success": false, "error": "没有正在运行的番茄钟" }));
        }
        inner.stop()
    };

    // Record session as incomplete
    if let Some(sid) = session_id {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let _ = state.db.lock().unwrap().update_pomodoro_session(sid, Some(&now), actual_duration, Some(0));
    }

    broadcast_pomodoro_state(&app).await;
    Ok(json!({ "success": true }))
}

#[tauri::command]
pub fn pomodoro_get_sessions(state: State<'_, AppState>) -> Result<Vec<Value>, String> {
    let sessions = state.db.lock().unwrap().get_pomodoro_sessions(50).map_err(|e| e.to_string())?;
    Ok(sessions.iter().map(|s| serde_json::to_value(s).unwrap_or_default()).collect())
}

#[tauri::command]
pub fn pomodoro_get_stats(state: State<'_, AppState>, period: String) -> Result<Value, String> {
    let valid = ["week", "month", "year"];
    let p = if valid.contains(&period.as_str()) { &period } else { "week" };
    let stats = state.db.lock().unwrap().get_pomodoro_stats(p).map_err(|e| e.to_string())?;
    serde_json::to_value(stats).map_err(|e| e.to_string())
}
