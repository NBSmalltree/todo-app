use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Todo {
    pub id: i64,
    pub text: String,
    pub completed: i64,
    pub archived: i64,
    pub deleted: i64,
    pub category: Option<String>,
    pub note: Option<String>,
    pub due_date: Option<String>,
    pub scheduled_date: Option<String>,
    pub sort_order: Option<i64>,
    pub color: Option<String>,
    pub created_at: Option<String>,
    pub completed_at: Option<String>,
    pub archived_at: Option<String>,
    pub deleted_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subtask {
    pub id: i64,
    pub todo_id: i64,
    pub text: String,
    pub completed: i64,
    pub sort_order: i64,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PomodoroSession {
    pub id: i64,
    pub task_id: Option<i64>,
    pub task_text: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub duration: Option<i64>,
    pub actual_duration: Option<i64>,
    pub cycle_type: Option<String>,
    pub completed: i64,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkAnalysisData {
    pub period: String,
    pub total_items: i64,
    pub category_distribution: serde_json::Value,
    pub daily_distribution: serde_json::Value,
    pub completion_stats: serde_json::Value,
    pub items: Vec<Todo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroStats {
    pub total_sessions: i64,
    pub total_focus_minutes: i64,
    pub today_sessions: i64,
    pub daily_breakdown: Vec<serde_json::Value>,
    pub recent_sessions: Vec<PomodoroSession>,
}

pub struct Database {
    conn: Connection,
    db_path: PathBuf,
}

impl Database {
    pub fn new(handle: &tauri::AppHandle) -> Result<Self, Box<dyn std::error::Error>> {
        let app_data = handle.path().app_data_dir()?;
        std::fs::create_dir_all(&app_data)?;
        let db_path = app_data.join("todofloat.db");

        // Migrate from old Electron location if the new db is missing or empty.
        // A previous Tauri install may have already created an empty db, which
        // would block migration — so we also check whether the new db has any
        // todos before deciding to copy the old one.
        let old_db_path = find_old_electron_db();
        let need_migrate = if !db_path.exists() {
            true
        } else if old_db_path.is_some() {
            // Open a throwaway connection to check if the new db is empty.
            if let Ok(conn) = Connection::open(&db_path) {
                let count: i64 = conn
                    .query_row("SELECT COUNT(*) FROM todos", [], |row| row.get(0))
                    .unwrap_or(0);
                count == 0
            } else {
                false
            }
        } else {
            false
        };

        if need_migrate {
            if let Some(ref old_path) = old_db_path {
                if old_path.exists() {
                    match std::fs::copy(old_path, &db_path) {
                        Ok(_) => println!("[DB] Migrated database from {}", old_path.display()),
                        Err(e) => eprintln!("[DB] Migration copy failed: {}", e),
                    }
                    // Also copy WAL/SHM files if they exist
                    let old_wal = old_path.with_extension("db-wal");
                    if old_wal.exists() {
                        let _ = std::fs::copy(&old_wal, db_path.with_extension("db-wal"));
                    }
                    let old_shm = old_path.with_extension("db-shm");
                    if old_shm.exists() {
                        let _ = std::fs::copy(&old_shm, db_path.with_extension("db-shm"));
                    }
                }
            }
        }

        let conn = Connection::open(&db_path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;

        let db = Database { conn, db_path };
        db.init()?;
        Ok(db)
    }

    pub fn get_db_path(&self) -> &PathBuf {
        &self.db_path
    }

    fn now_beijing(&self) -> String {
        let now = chrono::Local::now();
        now.format("%Y-%m-%d %H:%M:%S").to_string()
    }

    fn init(&self) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch("
            CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                text TEXT NOT NULL,
                completed INTEGER DEFAULT 0,
                archived INTEGER DEFAULT 0,
                category TEXT,
                note TEXT,
                created_at TEXT DEFAULT (datetime('now', 'localtime')),
                completed_at TEXT,
                archived_at TEXT
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS schema_version (
                version INTEGER PRIMARY KEY
            );

            CREATE INDEX IF NOT EXISTS idx_todos_archived ON todos(archived);
            CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
            CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);
            CREATE INDEX IF NOT EXISTS idx_todos_archived_at ON todos(archived_at);
        ")?;

        let version: i64 = self.conn
            .query_row("SELECT COALESCE(MAX(version), 0) FROM schema_version", [], |row| row.get(0))
            .unwrap_or(0);

        // Run migrations in order
        let migrations: Vec<(&str, Option<&dyn Fn(&Connection) -> Result<(), rusqlite::Error>>)> = vec![
            ("ALTER TABLE todos ADD COLUMN sort_order INTEGER",
             Some(&|c| {
                 c.execute_batch("
                     UPDATE todos SET sort_order = (
                         SELECT COUNT(*) FROM todos t2
                         WHERE t2.archived = 0 AND t2.completed = 0
                           AND (t2.created_at > todos.created_at OR (t2.created_at = todos.created_at AND t2.id > todos.id))
                     ) WHERE archived = 0 AND completed = 0
                 ")?;
                 Ok(())
             })),
            ("ALTER TABLE todos ADD COLUMN color TEXT", None),
            // v3 - timezone migration (no-op: new installs use localtime)
            ("SELECT 1", None),
            ("ALTER TABLE todos ADD COLUMN due_date TEXT", None),
            // v5 - normalize date format (no-op for new installs)
            ("SELECT 1", None),
            ("CREATE TABLE IF NOT EXISTS pomodoro_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id INTEGER,
                task_text TEXT,
                start_time TEXT,
                end_time TEXT,
                duration INTEGER,
                actual_duration INTEGER,
                cycle_type TEXT,
                completed INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )",
             Some(&|c| {
                 let defaults = [
                     ("pomodoro_focus", "25"),
                     ("pomodoro_short_break", "5"),
                     ("pomodoro_long_break", "15"),
                     ("pomodoro_cycles_before_long", "4"),
                 ];
                 for (key, val) in defaults.iter() {
                     let count: i64 = c.query_row(
                         "SELECT COUNT(*) FROM settings WHERE key = ?1", params![key], |r| r.get(0)
                     )?;
                     if count == 0 {
                         c.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)", 
                             params![key, val])?;
                     }
                 }
                 Ok(())
             })),
            ("CREATE TABLE IF NOT EXISTS subtasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                todo_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                completed INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now', 'localtime'))
            )", None),
            ("ALTER TABLE todos ADD COLUMN scheduled_date TEXT", None),
            ("ALTER TABLE todos ADD COLUMN deleted INTEGER DEFAULT 0;
              ALTER TABLE todos ADD COLUMN deleted_at TEXT", None),
        ];

        for (i, (sql, after)) in migrations.iter().enumerate() {
            let migration_version = i as i64 + 1;
            if migration_version <= version { continue; }

            match self.conn.execute_batch(sql) {
                Ok(_) => {
                    if let Some(after_fn) = after {
                        let _ = after_fn(&self.conn);
                    }
                    self.conn.execute(
                        "INSERT OR IGNORE INTO schema_version (version) VALUES (?1)",
                        params![migration_version],
                    )?;
                }
                Err(e) => {
                    if e.to_string().contains("duplicate column") {
                        self.conn.execute(
                            "INSERT OR IGNORE INTO schema_version (version) VALUES (?1)",
                            params![migration_version],
                        )?;
                    }
                }
            }
        }

        // Seed default settings
        let defaults = [
            ("theme", "\"light\""),
            ("shortcut_toggle", if cfg!(target_os = "macos") { "\"Cmd+Shift+T\"" } else { "\"Ctrl+Shift+T\"" }),
            ("shortcut_quickadd", if cfg!(target_os = "macos") { "\"Cmd+Shift+Space\"" } else { "\"Ctrl+Shift+Space\"" }),
        ];
        for (key, val) in defaults.iter() {
            let count: i64 = self.conn.query_row(
                "SELECT COUNT(*) FROM settings WHERE key = ?1", params![key], |r| r.get(0)
            )?;
            if count == 0 {
                self.conn.execute(
                    "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
                    params![key, val],
                )?;
            }
        }

        Ok(())
    }

    // ===== Todo CRUD =====

    pub fn get_todos(&self) -> Result<Vec<Todo>, rusqlite::Error> {
        self.query_todos("SELECT * FROM todos WHERE archived = 0 AND deleted = 0 ORDER BY completed ASC, sort_order ASC, created_at DESC", params![])
    }

    pub fn get_active_todos(&self) -> Result<Vec<Todo>, rusqlite::Error> {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        self.query_todos(
            "SELECT * FROM todos WHERE archived = 0 AND deleted = 0 AND (scheduled_date IS NULL OR scheduled_date <= ?1) ORDER BY completed ASC, sort_order ASC, created_at DESC",
            params![today],
        )
    }

    pub fn get_future_scheduled_todos(&self) -> Result<Vec<Todo>, rusqlite::Error> {
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        self.query_todos(
            "SELECT * FROM todos WHERE archived = 0 AND completed = 0 AND deleted = 0 AND scheduled_date IS NOT NULL AND scheduled_date > ?1 ORDER BY scheduled_date ASC, sort_order ASC",
            params![today],
        )
    }

    pub fn add_todo(&self, text: &str) -> Result<Todo, rusqlite::Error> {
        let max_order: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM todos WHERE archived = 0 AND completed = 0",
            [], |r| r.get(0),
        )?;
        self.conn.execute(
            "INSERT INTO todos (text, sort_order) VALUES (?1, ?2)",
            params![text, max_order + 1],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_todo(id)
    }

    pub fn toggle_todo(&self, id: i64) -> Result<Todo, rusqlite::Error> {
        let todo = self.get_todo(id)?;
        let new_completed = if todo.completed == 1 { 0 } else { 1 };
        let completed_at = if new_completed == 1 {
            Some(self.now_beijing())
        } else {
            None
        };
        self.conn.execute(
            "UPDATE todos SET completed = ?1, completed_at = ?2 WHERE id = ?3",
            params![new_completed, completed_at, id],
        )?;
        self.get_todo(id)
    }

    pub fn delete_todo(&self, id: i64) -> Result<(), rusqlite::Error> {
        let now = self.now_beijing();
        self.conn.execute(
            "UPDATE todos SET deleted = 1, deleted_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        Ok(())
    }

    pub fn recover_todo(&self, id: i64) -> Result<Todo, rusqlite::Error> {
        self.conn.execute(
            "UPDATE todos SET deleted = 0, deleted_at = NULL WHERE id = ?1",
            params![id],
        )?;
        self.get_todo(id)
    }

    pub fn restore_todo(&self, id: i64) -> Result<Todo, rusqlite::Error> {
        self.conn.execute(
            "UPDATE todos SET completed = 0, completed_at = NULL, archived = 0, archived_at = NULL WHERE id = ?1",
            params![id],
        )?;
        self.get_todo(id)
    }

    pub fn archive_todo(&self, id: i64) -> Result<Todo, rusqlite::Error> {
        let now = self.now_beijing();
        self.conn.execute(
            "UPDATE todos SET archived = 1, archived_at = ?1 WHERE id = ?2",
            params![now, id],
        )?;
        self.get_todo(id)
    }

    pub fn get_archived(&self, filters: &serde_json::Value) -> Result<Vec<Todo>, rusqlite::Error> {
        let mut sql = String::from("SELECT * FROM todos WHERE archived = 1 AND deleted = 0");
        let mut param_values: Vec<String> = Vec::new();

        if let Some(cat) = filters.get("category").and_then(|v| v.as_str()) {
            if cat != "" && cat != "all" {
                param_values.push(cat.to_string());
                sql.push_str(&format!(" AND category = ?{}", param_values.len()));
            }
        }
        if let Some(start) = filters.get("startDate").and_then(|v| v.as_str()) {
            if !start.is_empty() {
                param_values.push(start.to_string());
                sql.push_str(&format!(" AND archived_at >= ?{}", param_values.len()));
            }
        }
        if let Some(end) = filters.get("endDate").and_then(|v| v.as_str()) {
            if !end.is_empty() {
                param_values.push(format!("{} 23:59:59", end));
                sql.push_str(&format!(" AND archived_at <= ?{}", param_values.len()));
            }
        }
        if let Some(search) = filters.get("searchText").and_then(|v| v.as_str()) {
            if !search.is_empty() {
                param_values.push(format!("%{}%", search));
                param_values.push(format!("%{}%", search));
                let n1 = param_values.len() - 1;
                let n2 = param_values.len();
                sql.push_str(&format!(" AND (text LIKE ?{n1} OR note LIKE ?{n2})"));
            }
        }

        sql.push_str(" ORDER BY archived_at DESC");

        let params_refs: Vec<&dyn rusqlite::types::ToSql> = param_values.iter()
            .map(|v| v as &dyn rusqlite::types::ToSql).collect();
        self.query_todos(&sql, params_refs.as_slice())
    }

    pub fn update_note(&self, id: i64, note: &str) -> Result<Todo, rusqlite::Error> {
        self.conn.execute("UPDATE todos SET note = ?1 WHERE id = ?2", params![note, id])?;
        self.get_todo(id)
    }

    pub fn update_category(&self, id: i64, category: Option<&str>) -> Result<Todo, rusqlite::Error> {
        self.conn.execute("UPDATE todos SET category = ?1 WHERE id = ?2", params![category, id])?;
        self.get_todo(id)
    }

    pub fn set_due_date(&self, id: i64, due_date: Option<&str>) -> Result<Todo, rusqlite::Error> {
        self.conn.execute("UPDATE todos SET due_date = ?1 WHERE id = ?2", params![due_date, id])?;
        self.get_todo(id)
    }

    pub fn set_scheduled_date(&self, id: i64, date_str: Option<&str>) -> Result<Todo, rusqlite::Error> {
        self.conn.execute("UPDATE todos SET scheduled_date = ?1 WHERE id = ?2", params![date_str, id])?;
        self.get_todo(id)
    }

    pub fn get_categories(&self) -> Result<Vec<String>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT category FROM todos WHERE archived = 1 AND deleted = 0 AND category IS NOT NULL"
        )?;
        let cats: Vec<String> = stmt.query_map([], |r| r.get(0))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(cats)
    }

    pub fn update_orders(&self, orders: &[(i64, i64)]) -> Result<(), rusqlite::Error> {
        self.conn.execute_batch("BEGIN")?;
        let result = (|| -> Result<(), rusqlite::Error> {
            for (id, sort_order) in orders {
                self.conn.execute(
                    "UPDATE todos SET sort_order = ?1 WHERE id = ?2",
                    params![sort_order, id],
                )?;
            }
            Ok(())
        })();
        match result {
            Ok(()) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(())
            }
            Err(e) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    }

    pub fn update_color(&self, id: i64, color: Option<&str>) -> Result<Todo, rusqlite::Error> {
        self.conn.execute("UPDATE todos SET color = ?1 WHERE id = ?2", params![color, id])?;
        self.get_todo(id)
    }

    pub fn update_text(&self, id: i64, text: &str) -> Result<Todo, rusqlite::Error> {
        self.conn.execute("UPDATE todos SET text = ?1 WHERE id = ?2", params![text, id])?;
        self.get_todo(id)
    }

    // ===== Subtask CRUD =====

    pub fn get_subtasks(&self, todo_id: i64) -> Result<Vec<Subtask>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, todo_id, text, completed, sort_order, created_at FROM subtasks WHERE todo_id = ?1 ORDER BY sort_order ASC, id ASC"
        )?;
        let subs = stmt.query_map(params![todo_id], |row| {
            Ok(Subtask {
                id: row.get(0)?,
                todo_id: row.get(1)?,
                text: row.get(2)?,
                completed: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(subs)
    }

    pub fn add_subtask(&self, todo_id: i64, text: &str) -> Result<Subtask, rusqlite::Error> {
        let max_order: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) FROM subtasks WHERE todo_id = ?1",
            params![todo_id], |r| r.get(0),
        )?;
        self.conn.execute(
            "INSERT INTO subtasks (todo_id, text, sort_order) VALUES (?1, ?2, ?3)",
            params![todo_id, text, max_order + 1],
        )?;
        let id = self.conn.last_insert_rowid();
        self.conn.query_row(
            "SELECT id, todo_id, text, completed, sort_order, created_at FROM subtasks WHERE id = ?1",
            params![id],
            |row| Ok(Subtask {
                id: row.get(0)?,
                todo_id: row.get(1)?,
                text: row.get(2)?,
                completed: row.get(3)?,
                sort_order: row.get(4)?,
                created_at: row.get(5)?,
            }),
        )
    }

    pub fn toggle_subtask(&self, id: i64) -> Result<Subtask, rusqlite::Error> {
        let sub: Subtask = self.conn.query_row(
            "SELECT id, todo_id, text, completed, sort_order, created_at FROM subtasks WHERE id = ?1",
            params![id], |row| Ok(Subtask {
                id: row.get(0)?, todo_id: row.get(1)?, text: row.get(2)?,
                completed: row.get(3)?, sort_order: row.get(4)?, created_at: row.get(5)?,
            }),
        )?;
        let new_val = if sub.completed == 1 { 0 } else { 1 };
        self.conn.execute("UPDATE subtasks SET completed = ?1 WHERE id = ?2", params![new_val, id])?;
        self.conn.query_row(
            "SELECT id, todo_id, text, completed, sort_order, created_at FROM subtasks WHERE id = ?1",
            params![id],
            |row| Ok(Subtask {
                id: row.get(0)?, todo_id: row.get(1)?, text: row.get(2)?,
                completed: row.get(3)?, sort_order: row.get(4)?, created_at: row.get(5)?,
            }),
        )
    }

    pub fn delete_subtask(&self, id: i64) -> Result<(), rusqlite::Error> {
        self.conn.execute("DELETE FROM subtasks WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn update_subtask_text(&self, id: i64, text: &str) -> Result<Subtask, rusqlite::Error> {
        self.conn.execute("UPDATE subtasks SET text = ?1 WHERE id = ?2", params![text, id])?;
        self.conn.query_row(
            "SELECT id, todo_id, text, completed, sort_order, created_at FROM subtasks WHERE id = ?1",
            params![id],
            |row| Ok(Subtask {
                id: row.get(0)?, todo_id: row.get(1)?, text: row.get(2)?,
                completed: row.get(3)?, sort_order: row.get(4)?, created_at: row.get(5)?,
            }),
        )
    }

    // ===== Settings =====

    pub fn get_settings_map(&self) -> Result<serde_json::Map<String, serde_json::Value>, rusqlite::Error> {
        let mut stmt = self.conn.prepare("SELECT key, value FROM settings")?;
        let rows: Vec<(String, String)> = stmt.query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?))
        })?.filter_map(|r| r.ok()).collect();

        let mut map = serde_json::Map::new();
        for (key, val) in rows {
            let parsed: serde_json::Value = serde_json::from_str(&val).unwrap_or(serde_json::Value::String(val));
            map.insert(key, parsed);
        }
        Ok(map)
    }

    pub fn save_settings(&self, settings: &serde_json::Map<String, serde_json::Value>) -> Result<(), rusqlite::Error> {
        for (key, val) in settings {
            let json_val = serde_json::to_string(val).unwrap_or_default();
            self.conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                params![key, json_val],
            )?;
        }
        Ok(())
    }

    // ===== Work Analysis =====

    pub fn get_work_analysis(&self, period: &str) -> Result<WorkAnalysisData, rusqlite::Error> {
        let days_ago = match period {
            "week" => 7, "month" => 30, "year" => 365, _ => 7,
        };

        let _date_filter = format!("datetime('now', 'localtime', '-{} days')", days_ago);
        let sql = format!(
            "SELECT * FROM todos WHERE archived = 1 AND deleted = 0 AND archived_at >= datetime('now','localtime','-{} days') ORDER BY archived_at DESC",
            days_ago
        );
        let items = self.query_todos(&sql, params![])?;

        let total_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM todos WHERE deleted = 0", [], |r| r.get(0),
        )?;
        let archived_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM todos WHERE archived = 1 AND deleted = 0", [], |r| r.get(0),
        )?;
        let completed_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM todos WHERE archived = 0 AND completed = 1 AND deleted = 0", [], |r| r.get(0),
        )?;
        let active_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM todos WHERE archived = 0 AND completed = 0 AND deleted = 0", [], |r| r.get(0),
        )?;

        let mut cat_map = serde_json::Map::new();
        for item in &items {
            let cat = item.category.clone().unwrap_or_else(|| "未分类".to_string());
            let entry = cat_map.entry(cat).or_insert_with(|| serde_json::json!({"count": 0, "items": []}));
            entry["count"] = serde_json::json!(entry["count"].as_i64().unwrap_or(0) + 1);
        }

        let mut day_map = serde_json::Map::new();
        for item in &items {
            if let Some(ref d) = item.archived_at {
                let day = &d[..10];
                let count = day_map.get(day).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
                day_map.insert(day.to_string(), serde_json::json!(count));
            }
        }

        let completion_stats = serde_json::json!({
            "total": total_count,
            "archived": archived_count,
            "completed": completed_count,
            "active": active_count,
        });

        Ok(WorkAnalysisData {
            period: period.to_string(),
            total_items: items.len() as i64,
            category_distribution: serde_json::Value::Object(cat_map),
            daily_distribution: serde_json::Value::Object(day_map),
            completion_stats,
            items,
        })
    }

    pub fn get_due_soon(&self, within_minutes: i64) -> Result<Vec<Todo>, rusqlite::Error> {
        let now = self.now_beijing();
        let limit = chrono::Local::now() + chrono::Duration::minutes(within_minutes);
        let limit_str = limit.format("%Y-%m-%d %H:%M:%S").to_string();

        self.query_todos(
            "SELECT * FROM todos WHERE archived = 0 AND completed = 0 AND deleted = 0 AND due_date IS NOT NULL AND due_date != '' AND due_date <= ?1 AND due_date > ?2 ORDER BY due_date ASC",
            params![limit_str, now],
        )
    }

    pub fn get_active_todo_ids(&self) -> Result<Vec<i64>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM todos WHERE archived = 0 AND completed = 0 AND deleted = 0"
        )?;
        let ids: Vec<i64> = stmt.query_map([], |r| r.get(0))?
            .filter_map(|r| r.ok()).collect();
        Ok(ids)
    }

    // ===== Pomodoro =====

    pub fn add_pomodoro_session(&self, task_id: Option<i64>, task_text: Option<&str>, duration: i64, cycle_type: &str) -> Result<PomodoroSession, rusqlite::Error> {
        let now = self.now_beijing();
        self.conn.execute(
            "INSERT INTO pomodoro_sessions (task_id, task_text, start_time, duration, cycle_type, completed) VALUES (?1, ?2, ?3, ?4, ?5, 0)",
            params![task_id, task_text, now, duration, cycle_type],
        )?;
        let id = self.conn.last_insert_rowid();
        self.get_pomodoro_session(id)
    }

    pub fn update_pomodoro_session(&self, id: i64, end_time: Option<&str>, actual_duration: Option<i64>, completed: Option<i64>) -> Result<(), rusqlite::Error> {
        self.conn.execute(
            "UPDATE pomodoro_sessions SET end_time = COALESCE(?1, end_time), actual_duration = COALESCE(?2, actual_duration), completed = COALESCE(?3, completed) WHERE id = ?4",
            params![end_time, actual_duration, completed, id],
        )?;
        Ok(())
    }

    pub fn get_pomodoro_session(&self, id: i64) -> Result<PomodoroSession, rusqlite::Error> {
        self.conn.query_row(
            "SELECT id, task_id, task_text, start_time, end_time, duration, actual_duration, cycle_type, completed, created_at FROM pomodoro_sessions WHERE id = ?1",
            params![id],
            |row| Ok(PomodoroSession {
                id: row.get(0)?, task_id: row.get(1)?, task_text: row.get(2)?,
                start_time: row.get(3)?, end_time: row.get(4)?, duration: row.get(5)?,
                actual_duration: row.get(6)?, cycle_type: row.get(7)?,
                completed: row.get(8)?, created_at: row.get(9)?,
            }),
        )
    }

    pub fn get_pomodoro_sessions(&self, limit: i64) -> Result<Vec<PomodoroSession>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, task_id, task_text, start_time, end_time, duration, actual_duration, cycle_type, completed, created_at FROM pomodoro_sessions ORDER BY start_time DESC LIMIT ?1"
        )?;
        let sessions = stmt.query_map(params![limit], |row| {
            Ok(PomodoroSession {
                id: row.get(0)?, task_id: row.get(1)?, task_text: row.get(2)?,
                start_time: row.get(3)?, end_time: row.get(4)?, duration: row.get(5)?,
                actual_duration: row.get(6)?, cycle_type: row.get(7)?,
                completed: row.get(8)?, created_at: row.get(9)?,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(sessions)
    }

    pub fn get_pomodoro_stats(&self, period: &str) -> Result<PomodoroStats, rusqlite::Error> {
        let days = match period { "week" => 7, "month" => 30, _ => 365 };
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();

        let total_sessions: i64 = self.conn.query_row(
            &format!("SELECT COUNT(*) FROM pomodoro_sessions WHERE completed = 1 AND cycle_type = 'focus' AND start_time >= datetime('now','localtime','-{} days')", days),
            [], |r| r.get(0),
        )?;

        let total_seconds: f64 = self.conn.query_row(
            &format!("SELECT COALESCE(SUM(actual_duration), 0) FROM pomodoro_sessions WHERE completed = 1 AND cycle_type = 'focus' AND start_time >= datetime('now','localtime','-{} days')", days),
            [], |r| r.get::<_, f64>(0),
        )?;
        let total_focus_minutes = (total_seconds / 60.0) as i64;

        let today_sessions: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM pomodoro_sessions WHERE completed = 1 AND cycle_type = 'focus' AND start_time >= ?1 AND start_time < datetime(?1, '+1 day')",
            params![format!("{today} 00:00:00")], |r| r.get(0),
        )?;

        let mut stmt = self.conn.prepare(
            &format!("SELECT SUBSTR(start_time, 1, 10) as day, COUNT(*) as count FROM pomodoro_sessions WHERE completed = 1 AND cycle_type = 'focus' AND start_time >= datetime('now','localtime','-{} days') GROUP BY day ORDER BY day ASC", days)
        )?;
        let daily_breakdown: Vec<serde_json::Value> = stmt.query_map([], |row| {
            let day: String = row.get(0)?;
            let count: i64 = row.get(1)?;
            Ok(serde_json::json!({"date": &day[5..], "count": count}))
        })?.filter_map(|r| r.ok()).collect();

        let recent_sessions = self.get_pomodoro_sessions(10)?;

        Ok(PomodoroStats {
            total_sessions, total_focus_minutes, today_sessions,
            daily_breakdown, recent_sessions,
        })
    }

    // ===== Close =====

    pub fn close(&self) -> Result<(), rusqlite::Error> {
        // Connection is closed when dropped
        Ok(())
    }

    // ===== Helpers =====

    fn get_todo(&self, id: i64) -> Result<Todo, rusqlite::Error> {
        self.conn.query_row("SELECT * FROM todos WHERE id = ?1", params![id], |row| {
            Ok(Todo {
                id: row.get("id")?,
                text: row.get("text")?,
                completed: row.get("completed")?,
                archived: row.get("archived")?,
                deleted: row.get("deleted")?,
                category: row.get("category")?,
                note: row.get("note")?,
                due_date: row.get("due_date")?,
                scheduled_date: row.get("scheduled_date")?,
                sort_order: row.get("sort_order")?,
                color: row.get("color")?,
                created_at: row.get("created_at")?,
                completed_at: row.get("completed_at")?,
                archived_at: row.get("archived_at")?,
                deleted_at: row.get("deleted_at")?,
            })
        })
    }

    fn query_todos(&self, sql: &str, params: &[&dyn rusqlite::types::ToSql]) -> Result<Vec<Todo>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(sql)?;
        let todos = stmt.query_map(params, |row| {
            Ok(Todo {
                id: row.get("id")?,
                text: row.get("text")?,
                completed: row.get("completed")?,
                archived: row.get("archived")?,
                deleted: row.get("deleted")?,
                category: row.get("category")?,
                note: row.get("note")?,
                due_date: row.get("due_date")?,
                scheduled_date: row.get("scheduled_date")?,
                sort_order: row.get("sort_order")?,
                color: row.get("color")?,
                created_at: row.get("created_at")?,
                completed_at: row.get("completed_at")?,
                archived_at: row.get("archived_at")?,
                deleted_at: row.get("deleted_at")?,
            })
        })?.filter_map(|r| r.ok()).collect();
        Ok(todos)
    }
}

/// Locate the old Electron app's database file for migration.
///
/// The packaged Electron app used `app.getPath('userData')`, which resolves to
/// `%APPDATA%\TodoFloat` (productName) on Windows and `~/Library/Application Support/TodoFloat`
/// on macOS. The dev build used the `name` field ("todo-float") instead. We check both casings.
fn find_old_electron_db() -> Option<PathBuf> {
    if cfg!(target_os = "macos") {
        if let Ok(home) = std::env::var("HOME") {
            let base = PathBuf::from(home).join("Library/Application Support");
            let prod = base.join("TodoFloat/todofloat.db");
            if prod.exists() {
                return Some(prod);
            }
            let dev = base.join("todo-float/todofloat.db");
            if dev.exists() {
                return Some(dev);
            }
        }
    } else if cfg!(target_os = "windows") {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let base = PathBuf::from(appdata);
            // Packaged Electron app (productName)
            let prod = base.join("TodoFloat/todofloat.db");
            if prod.exists() {
                return Some(prod);
            }
            // Dev Electron app (name field)
            let dev = base.join("todo-float/todofloat.db");
            if dev.exists() {
                return Some(dev);
            }
        }
    } else {
        if let Ok(home) = std::env::var("HOME") {
            let p = PathBuf::from(home).join(".config/todo-float/todofloat.db");
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}
