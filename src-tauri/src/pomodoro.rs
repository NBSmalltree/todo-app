use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroSnapshot {
    pub is_running: bool,
    pub is_paused: bool,
    pub time_remaining: i64,
    pub total_duration: i64,
    pub cycle_type: String,
    pub cycles_completed: i64,
    pub task_id: Option<i64>,
    pub task_text: Option<String>,
    pub session_id: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct InnerState {
    pub is_running: bool,
    pub is_paused: bool,
    pub time_remaining: i64,
    pub total_duration: i64,
    pub cycle_type: String,
    pub cycles_completed: i64,
    pub task_id: Option<i64>,
    pub task_text: Option<String>,
    pub session_id: Option<i64>,
    pub start_time: Option<i64>, // timestamp millis
    pub pause_start: Option<i64>, // timestamp millis when pause began
    pub total_paused_ms: i64,    // accumulated pause time in millis
}

pub struct PomodoroState {
    inner: Arc<Mutex<InnerState>>,
}

impl PomodoroState {
    pub fn new() -> Self {
        PomodoroState {
            inner: Arc::new(Mutex::new(InnerState {
                is_running: false,
                is_paused: false,
                time_remaining: 0,
                total_duration: 0,
                cycle_type: "focus".to_string(),
                cycles_completed: 0,
                task_id: None,
                task_text: None,
                session_id: None,
                start_time: None,
                pause_start: None,
                total_paused_ms: 0,
            })),
        }
    }

    pub async fn get_snapshot(&self) -> PomodoroSnapshot {
        let state = self.inner.lock().await;
        PomodoroSnapshot {
            is_running: state.is_running,
            is_paused: state.is_paused,
            time_remaining: state.time_remaining,
            total_duration: state.total_duration,
            cycle_type: state.cycle_type.clone(),
            cycles_completed: state.cycles_completed,
            task_id: state.task_id,
            task_text: state.task_text.clone(),
            session_id: state.session_id,
        }
    }

    pub async fn get_inner(&self) -> tokio::sync::MutexGuard<'_, InnerState> {
        self.inner.lock().await
    }
}

impl InnerState {
    pub fn start(
        &mut self,
        task_id: Option<i64>,
        task_text: Option<String>,
        duration: i64,
        session_id: i64,
    ) {
        self.is_running = true;
        self.is_paused = false;
        self.time_remaining = duration;
        self.total_duration = duration;
        self.cycle_type = "focus".to_string();
        self.task_id = task_id;
        self.task_text = task_text;
        self.session_id = Some(session_id);
        self.start_time = Some(chrono::Utc::now().timestamp_millis());
        self.pause_start = None;
        self.total_paused_ms = 0;
    }

    pub fn start_break(
        &mut self,
        task_id: Option<i64>,
        task_text: Option<String>,
        duration: i64,
        cycle_type: String,
        session_id: i64,
    ) {
        self.is_running = true;
        self.is_paused = false;
        self.time_remaining = duration;
        self.total_duration = duration;
        self.cycle_type = cycle_type;
        self.task_id = task_id;
        self.task_text = task_text;
        self.session_id = Some(session_id);
        self.start_time = Some(chrono::Utc::now().timestamp_millis());
        self.pause_start = None;
        self.total_paused_ms = 0;
    }

    pub fn pause(&mut self) {
        if self.is_running {
            self.is_paused = true;
            self.pause_start = Some(chrono::Utc::now().timestamp_millis());
        }
    }

    pub fn resume(&mut self) {
        if self.is_running && self.is_paused {
            if let Some(pause_start) = self.pause_start {
                self.total_paused_ms += chrono::Utc::now().timestamp_millis() - pause_start;
            }
            self.is_paused = false;
            self.pause_start = None;
        }
    }

    /// Compute actual (non-paused) elapsed time in seconds.
    fn actual_elapsed_secs(&self) -> Option<i64> {
        self.start_time.map(|t| {
            let now = chrono::Utc::now().timestamp_millis();
            let paused_ms = if self.is_paused {
                // Include current uncommitted pause segment
                self.total_paused_ms + self.pause_start.map(|p| now - p).unwrap_or(0)
            } else {
                self.total_paused_ms
            };
            (now - t - paused_ms) / 1000
        })
    }

    pub fn stop(&mut self) -> (Option<i64>, Option<i64>) {
        let session_id = self.session_id;
        let actual_duration = self.actual_elapsed_secs();

        self.is_running = false;
        self.is_paused = false;
        self.time_remaining = 0;
        self.total_duration = 0;
        self.cycle_type = "focus".to_string();
        self.task_id = None;
        self.task_text = None;
        self.session_id = None;
        self.start_time = None;
        self.pause_start = None;
        self.total_paused_ms = 0;

        (session_id, actual_duration)
    }

    pub fn tick(&mut self) -> Option<PomodoroTickResult> {
        if !self.is_running || self.is_paused {
            return None;
        }

        self.time_remaining -= 1;

        if self.time_remaining <= 0 {
            self.is_running = false;
            let session_id = self.session_id;
            let actual_duration = self.actual_elapsed_secs();

            if self.cycle_type == "focus" {
                self.cycles_completed += 1;
            }

            Some(PomodoroTickResult {
                completed: true,
                session_id,
                actual_duration,
                cycle_type: self.cycle_type.clone(),
                task_text: self.task_text.clone(),
                cycles_completed: self.cycles_completed,
            })
        } else {
            None
        }
    }

    pub fn snapshot(&self) -> PomodoroSnapshot {
        PomodoroSnapshot {
            is_running: self.is_running,
            is_paused: self.is_paused,
            time_remaining: self.time_remaining,
            total_duration: self.total_duration,
            cycle_type: self.cycle_type.clone(),
            cycles_completed: self.cycles_completed,
            task_id: self.task_id,
            task_text: self.task_text.clone(),
            session_id: self.session_id,
        }
    }
}

pub struct PomodoroTickResult {
    pub completed: bool,
    pub session_id: Option<i64>,
    pub actual_duration: Option<i64>,
    pub cycle_type: String,
    pub task_text: Option<String>,
    pub cycles_completed: i64,
}
