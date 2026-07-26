# TodoFloat — Desktop Floating Todo List

[![Build](https://github.com/NBSmalltree/todo-app/actions/workflows/build.yml/badge.svg)](https://github.com/NBSmalltree/todo-app/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/NBSmalltree/todo-app)](https://github.com/NBSmalltree/todo-app/releases)
[![License](https://img.shields.io/github/license/NBSmalltree/todo-app)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-blue)](https://github.com/NBSmalltree/todo-app/releases)

A lightweight desktop todo list that floats on top of all windows. Task management, AI-powered categorization, work analytics, and a built-in Pomodoro timer — all in one compact window.

---

## Quick Start

1. Download the latest release from [GitHub Releases](https://github.com/NBSmalltree/todo-app/releases) (latest v2.1.0).
   - **macOS**: pick the `.dmg` for your architecture (Apple Silicon or Intel)
   - **Windows**: pick the `.msi` or `.exe` installer
2. Install and launch. The app lives in your system tray / menu bar.
3. Press **Cmd+Shift+T** (macOS) or **Ctrl+Shift+T** (Windows) to toggle the floating window.

---

## Features

### 1. Task Management

This is the core daily loop — adding, organizing, and completing tasks.

![Main floating todo window](screenshots/todo.png)

- **Add a task**: Type in the input box at the bottom and press **Enter**.
- **Complete a task**: Click the checkbox on the left.
- **Edit a task**: Double-click the task text to edit inline.
- **Delete or archive**: Right-click for a context menu, or use batch mode to select multiple tasks at once.
- **Color priority**: Click the color dot on the left to cycle through colors — red (urgent), orange (important), yellow (medium), green (low), no color (default).
- **Subtasks**: Click the expand arrow on a task to add inline subtasks. A progress bar shows how much is done.
- **Drag-and-drop**: Reorder tasks by dragging the handle.
- **Completed tasks**: Finished tasks collapse into a "Completed N items" section at the top to keep the list clean.

### 2. Quick Add

Press **Cmd+Shift+Space** (macOS) or **Ctrl+Shift+Space** (Windows) to open a Spotlight-style input window. Type a task and press Enter — it gets added immediately without switching to the main window. Press **Esc** to dismiss. Perfect for capturing ideas on the fly.

### 3. Filtering & Search

Quick filter chips sit at the top of the window: **All | Today | Overdue | No Due Date**. One click switches your view.

Press **Cmd+F** (macOS) or **Ctrl+F** (Windows) to open the search panel, which shows date status for each task. In the archive view, you can also filter by category.

### 4. Due Dates & Future Scheduling

- **Set a due date**: Click the calendar icon on a task to open the date picker with hour/minute precision.
- **Visual cues**: Overdue tasks show in red, tasks due today show in yellow.
- **Future Schedule**: Set a date in the future and the task automatically hides until that date arrives. Use this for things you don't want to see yet.
- **Clear a date**: Click the "Clear" button in the date picker to remove a due date at any time.

### 5. Pomodoro Timer

Built-in timer with Focus, Short Break, and Long Break cycles.

- **Task association**: Start a focus session on a specific task and see the task name on the timer.
- **Visual feedback**: A circular SVG ring animates with the remaining time. Dots below show which round you're on.
- **Notifications**: The system notifies you when a cycle completes — pause or start your break.
- **Sync**: Timer state is shared across all windows (float, tray, settings).

### 6. Archive & CSV Export

![Archive view](screenshots/archive.png)

Completed tasks move to the History Archive. Open it from the tray menu.

- **Filter**: Search by keyword, select a category from the dropdown, or pick a date range.
- **Batch operations**: Select multiple items to restore or delete them together.
- **CSV export**: Export your data with a customizable scope — active tasks, archived tasks, or both. Filters apply to the export.
- **Undo**: Deleted or archived a task by mistake? A toast notification at the bottom gives you 5 seconds to undo.
- **AI auto-categorization**: If you've configured an AI API key, tasks get automatically categorized when archived.

### 7. Work Analysis & AI

![Work analysis dashboard](screenshots/analysis.png)

Switch between **Weekly**, **Monthly**, and **Yearly** views with toggle buttons at the top.

- **Overview cards**: Active tasks, Archived count, Number of categories, Completion rate.
- **Charts**: Category distribution pie chart and daily task volume bar chart.
- **Category table**: A detailed breakdown with percentages and progress bars.
- **Pomodoro stats**: Total focus time, daily focus area chart, recent sessions list.
- **AI analysis**: If configured, the AI generates Markdown-formatted advice tailored to the selected period. Results are independent per period and cached.

### 8. Settings

![Settings window](screenshots/settings.png)

Open via the tray menu or press **Cmd+,** (macOS) / **Ctrl+,** (Windows).

- **Theme**: Switch between Light, Dark, and Eye-Care (warm amber) in the Appearance section.
- **Transparency**: A slider adjusts the floating window opacity from 0.3 to 1.0.
- **Language**: Toggle between English and Chinese in the Appearance section.
- **Reminders**: Enable or disable task reminders, set advance notice time (0–1440 minutes), and test a notification.
- **Global shortcuts**: Recording mode for both the Toggle Window and Quick Add shortcuts. Click the input field and press your desired key combination to record it.
- **Pomodoro config**: Adjust focus duration, short break, long break, and the number of cycles before a long break.
- **AI provider**: Enter API key, base URL, and model name. Click "Test Connection" to verify without saving. Supports OpenAI, Anthropic, DeepSeek, Zhipu, and any OpenAI-compatible endpoint.
- **Data**: Backup your data to a `.db` file, or restore from a backup file (this overwrites current data — a confirmation dialog appears first).

### 9. System Integration

- Lives in the **macOS menu bar** (no Dock icon) or **Windows system tray**.
- Right-click the tray icon for quick access: **Show Todo / History Archive / Settings / Quit**.
- The window **remembers its position and size** across restarts.
- **Scroll-wheel zoom**: Hold **Cmd** (macOS) or **Ctrl** (Windows) and scroll to resize the window from 0.3x to 2.5x.
- **Corner resize**: Drag any corner to resize the window.
- The visual theme (light/dark) follows your setting independently of the system.
- **Automatic database migration** from the v1.x Electron version on first launch.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite + Tailwind CSS + Recharts |
| Backend | Rust + Tauri v2 + SQLite (rusqlite) + reqwest |
| AI | OpenAI-compatible API (OpenAI, Anthropic, DeepSeek, Zhipu, etc.) |
| CI/CD | GitHub Actions — builds `.dmg` (macOS arm64 + x86_64) and `.msi`/`.exe` (Windows) on every `v*` tag |

---

## FAQ

**How do I keep the window always on top?**  
It does this by default in float mode — no setting needed.

**Does it work offline?**  
Yes. Everything is stored in a local SQLite database on your machine.

**Is my data safe?**  
All data stays on your computer. Use the backup feature in Settings to export a copy.

**How do I migrate from the v1.x Electron version?**  
The migration runs automatically on first launch. Your old database is detected and moved to the new location — no action needed on your part.

---

## Contributing & License

This project is licensed under the [MIT License](LICENSE).

Bug reports and feature requests are welcome on [GitHub Issues](https://github.com/NBSmalltree/todo-app/issues).
