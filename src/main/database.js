const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

class TodoDatabase {
  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'todofloat.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  init() {
    this.db.exec(`
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

      CREATE INDEX IF NOT EXISTS idx_todos_archived ON todos(archived);
      CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
      CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);
      CREATE INDEX IF NOT EXISTS idx_todos_archived_at ON todos(archived_at);
    `);
  }

  getTodos() {
    return this.db
      .prepare('SELECT * FROM todos WHERE archived = 0 ORDER BY completed ASC, created_at DESC')
      .all();
  }

  addTodo(text) {
    const stmt = this.db.prepare('INSERT INTO todos (text) VALUES (?)');
    const result = stmt.run(text);
    return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
  }

  toggleTodo(id) {
    const todo = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!todo) return null;

    const newCompleted = todo.completed ? 0 : 1;
    const completedAt = newCompleted
      ? new Date().toISOString().replace('T', ' ').slice(0, 19)
      : null;

    this.db
      .prepare('UPDATE todos SET completed = ?, completed_at = ? WHERE id = ?')
      .run(newCompleted, completedAt, id);

    return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  }

  deleteTodo(id) {
    this.db.prepare('DELETE FROM todos WHERE id = ?').run(id);
    return { success: true };
  }

  restoreTodo(id) {
    this.db
      .prepare('UPDATE todos SET completed = 0, completed_at = NULL WHERE id = ?')
      .run(id);
    return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  }

  archiveTodo(id) {
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    this.db
      .prepare('UPDATE todos SET archived = 1, archived_at = ? WHERE id = ?')
      .run(now, id);
    return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  }

  getArchived(filters = {}) {
    let query = 'SELECT * FROM todos WHERE archived = 1';
    const params = [];

    if (filters.category && filters.category !== 'all') {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.startDate) {
      query += ' AND archived_at >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ' AND archived_at <= ?';
      params.push(filters.endDate + ' 23:59:59');
    }

    if (filters.searchText) {
      query += ' AND (text LIKE ? OR note LIKE ?)';
      params.push(`%${filters.searchText}%`, `%${filters.searchText}%`);
    }

    query += ' ORDER BY archived_at DESC';

    return this.db.prepare(query).all(...params);
  }

  updateNote(id, note) {
    this.db.prepare('UPDATE todos SET note = ? WHERE id = ?').run(note, id);
    return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  }

  getCategories() {
    return this.db
      .prepare('SELECT DISTINCT category FROM todos WHERE archived = 1 AND category IS NOT NULL')
      .all()
      .map((r) => r.category);
  }

  getWorkAnalysis(period = 'week') {
    let dateFilter;
    const now = new Date();

    switch (period) {
      case 'week': {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay() + 1);
        startOfWeek.setHours(0, 0, 0, 0);
        dateFilter = startOfWeek.toISOString().replace('T', ' ').slice(0, 19);
        break;
      }
      case 'month': {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        dateFilter = startOfMonth.toISOString().replace('T', ' ').slice(0, 19);
        break;
      }
      case 'year': {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        dateFilter = startOfYear.toISOString().replace('T', ' ').slice(0, 19);
        break;
      }
      default:
        dateFilter = '1970-01-01';
    }

    // Get archived items in period
    const items = this.db
      .prepare(
        `SELECT * FROM todos
         WHERE archived = 1 AND archived_at >= ?
         ORDER BY archived_at DESC`
      )
      .all(dateFilter);

    // Category distribution
    const categoryCount = {};
    items.forEach((item) => {
      const cat = item.category || '未分类';
      if (!categoryCount[cat]) categoryCount[cat] = { count: 0, items: [] };
      categoryCount[cat].count++;
      categoryCount[cat].items.push(item);
    });

    // Daily distribution
    const dailyCount = {};
    items.forEach((item) => {
      const day = item.archived_at ? item.archived_at.slice(0, 10) : 'unknown';
      dailyCount[day] = (dailyCount[day] || 0) + 1;
    });

    // Completion stats
    const totalTodos = this.db
      .prepare(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END) as archived
         FROM todos WHERE created_at >= ?`
      )
      .get(dateFilter);

    return {
      period,
      totalItems: items.length,
      categoryDistribution: categoryCount,
      dailyDistribution: dailyCount,
      completionStats: totalTodos,
      items,
    };
  }

  getSettings() {
    const rows = this.db
      .prepare('SELECT key, value FROM settings')
      .all();
    const settings = {};
    rows.forEach((row) => {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    });
    return settings;
  }

  saveSettings(settings) {
    const stmt = this.db.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    );
    const transaction = this.db.transaction((items) => {
      Object.entries(items).forEach(([key, value]) => {
        stmt.run(key, typeof value === 'string' ? value : JSON.stringify(value));
      });
    });
    transaction(settings);
    return { success: true };
  }

  close() {
    this.db.close();
  }
}

module.exports = TodoDatabase;
