const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

// 获取北京时间（UTC+8）格式化字符串 YYYY-MM-DD HH:MM:SS
// 中国无夏令时，直接加 8 小时即可
// 如不传参数，返回当前北京时间；可传入 Date 对象，返回该时间的北京时间表示
function nowBeijing(date) {
  const d = date || new Date();
  const beijingTime = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return beijingTime.toISOString().replace('T', ' ').slice(0, 19);
}

class TodoDatabase {
  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'todofloat.db');
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.init();
  }

  getDbPath() {
    return this.dbPath;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
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

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );

      CREATE INDEX IF NOT EXISTS idx_todos_archived ON todos(archived);
      CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
      CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);
      CREATE INDEX IF NOT EXISTS idx_todos_archived_at ON todos(archived_at);
    `);

    // Schema version-driven migrations
    const row = this.db.prepare('SELECT MAX(version) as v FROM schema_version').get();
    const currentVersion = row?.v ?? 0;

    const migrations = [
      {
        version: 1,
        sql: 'ALTER TABLE todos ADD COLUMN sort_order INTEGER',
        after: () => {
          this.db.exec(`
            UPDATE todos SET sort_order = (
              SELECT COUNT(*) FROM todos t2
              WHERE t2.archived = 0 AND t2.completed = 0
                AND (t2.created_at > todos.created_at OR (t2.created_at = todos.created_at AND t2.id > todos.id))
            ) WHERE archived = 0 AND completed = 0
          `);
        },
      },
      {
        version: 2,
        sql: 'ALTER TABLE todos ADD COLUMN color TEXT',
      },
      {
        version: 3,
        sql: 'SELECT 1', // no-op, actual work done in after()
        after: () => {
          // 将 archived_at 和 completed_at 从 UTC 时间转为北京时间（UTC+8）
          // 旧数据通过 toISOString() 存的是 UTC，需要加 8 小时
          this.db.exec(`
            UPDATE todos SET archived_at = datetime(archived_at, '+8 hours')
            WHERE archived_at IS NOT NULL AND archived_at != ''
          `);
          this.db.exec(`
            UPDATE todos SET completed_at = datetime(completed_at, '+8 hours')
            WHERE completed_at IS NOT NULL AND completed_at != ''
          `);
          this.db.exec(`
            UPDATE todos SET created_at = datetime(created_at, '+8 hours')
            WHERE created_at IS NOT NULL AND created_at != '' AND created_at NOT LIKE '%+08:00%'
          `);
        },
      },
      {
        version: 4,
        sql: 'ALTER TABLE todos ADD COLUMN due_date TEXT',
      },
      {
        version: 5,
        sql: 'SELECT 1', // no-op, done in after()
        after: () => {
          // Migrate existing date-only due_date values (YYYY-MM-DD) to datetime (YYYY-MM-DD 23:59:59)
          this.db.exec(`
            UPDATE todos SET due_date = due_date || ' 23:59:59'
            WHERE due_date IS NOT NULL AND due_date != '' AND LENGTH(due_date) = 10
          `);
        },
      },
    ];

    const insertVersion = this.db.prepare('INSERT OR IGNORE INTO schema_version (version) VALUES (?)');

    for (const migration of migrations) {
      if (migration.version <= currentVersion) continue;
      try {
        this.db.exec(migration.sql);
        if (migration.after) migration.after();
        insertVersion.run(migration.version);
      } catch (e) {
        if (e.message && e.message.includes('duplicate column')) {
          // Column already exists (e.g. crash between ALTER and version insert)
          insertVersion.run(migration.version);
        } else {
          console.error(`Migration v${migration.version} failed:`, e.message);
        }
      }
    }

    // Seed default settings if not present
    const countTheme = this.db.prepare("SELECT COUNT(*) as c FROM settings WHERE key = 'theme'").get();
    if (countTheme.c === 0) {
      this.db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', ?)").run(JSON.stringify('light'));
    }
  }

  getTodos() {
    try {
      return this.db
        .prepare('SELECT * FROM todos WHERE archived = 0 ORDER BY completed ASC, sort_order ASC, created_at DESC')
        .all();
    } catch (e) {
      console.error('getTodos failed:', e);
      return [];
    }
  }

  addTodo(text) {
    try {
      const maxOrder = this.db.prepare('SELECT MAX(sort_order) as maxOrder FROM todos WHERE archived = 0 AND completed = 0').get();
      const nextOrder = (maxOrder?.maxOrder ?? -1) + 1;
      const stmt = this.db.prepare('INSERT INTO todos (text, sort_order) VALUES (?, ?)');
      const result = stmt.run(text, nextOrder);
      return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(result.lastInsertRowid);
    } catch (e) {
      console.error('addTodo failed:', e);
      return { success: false, error: e.message };
    }
  }

  updateOrders(orders) {
    try {
      const stmt = this.db.prepare('UPDATE todos SET sort_order = ? WHERE id = ?');
      const transaction = this.db.transaction((items) => {
        items.forEach(({ id, sort_order }) => stmt.run(sort_order, id));
      });
      transaction(orders);
      return { success: true };
    } catch (e) {
      console.error('updateOrders failed:', e);
      return { success: false, error: e.message };
    }
  }

  updateColor(id, color) {
    try {
      this.db.prepare('UPDATE todos SET color = ? WHERE id = ?').run(color || null, id);
      return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    } catch (e) {
      console.error('updateColor failed:', e);
      return null;
    }
  }

  updateText(id, text) {
    try {
      this.db.prepare('UPDATE todos SET text = ? WHERE id = ?').run(text, id);
      return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    } catch (e) {
      console.error('updateText failed:', e);
      return null;
    }
  }

  toggleTodo(id) {
    try {
      const todo = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
      if (!todo) return null;

      const newCompleted = todo.completed ? 0 : 1;
      const completedAt = newCompleted
        ? nowBeijing()
        : null;

      this.db
        .prepare('UPDATE todos SET completed = ?, completed_at = ? WHERE id = ?')
        .run(newCompleted, completedAt, id);

      return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    } catch (e) {
      console.error('toggleTodo failed:', e);
      return null;
    }
  }

  deleteTodo(id) {
    try {
      this.db.prepare('DELETE FROM todos WHERE id = ?').run(id);
      return { success: true };
    } catch (e) {
      console.error('deleteTodo failed:', e);
      return { success: false, error: e.message };
    }
  }

  restoreTodo(id) {
    try {
      this.db
        .prepare('UPDATE todos SET completed = 0, completed_at = NULL, archived = 0, archived_at = NULL WHERE id = ?')
        .run(id);
      return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    } catch (e) {
      console.error('restoreTodo failed:', e);
      return null;
    }
  }

  archiveTodo(id) {
    try {
      this.db
        .prepare('UPDATE todos SET archived = 1, archived_at = ? WHERE id = ?')
        .run(nowBeijing(), id);
      return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    } catch (e) {
      console.error('archiveTodo failed:', e);
      return null;
    }
  }

  getArchived(filters = {}) {
    try {
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
    } catch (e) {
      console.error('getArchived failed:', e);
      return [];
    }
  }

  updateNote(id, note) {
    try {
      this.db.prepare('UPDATE todos SET note = ? WHERE id = ?').run(note, id);
      return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    } catch (e) {
      console.error('updateNote failed:', e);
      return null;
    }
  }

  updateCategory(id, category) {
    try {
      this.db.prepare('UPDATE todos SET category = ? WHERE id = ?').run(category, id);
      return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    } catch (e) {
      console.error('updateCategory failed:', e);
      return null;
    }
  }

  setDueDate(id, dueDate) {
    try {
      this.db.prepare('UPDATE todos SET due_date = ? WHERE id = ?').run(dueDate || null, id);
      return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    } catch (e) {
      console.error('setDueDate failed:', e);
      return null;
    }
  }

  getCategories() {
    try {
      return this.db
        .prepare('SELECT DISTINCT category FROM todos WHERE archived = 1 AND category IS NOT NULL')
        .all()
        .map((r) => r.category);
    } catch (e) {
      console.error('getCategories failed:', e);
      return [];
    }
  }

  getWorkAnalysis(period = 'week') {
    try {
      // 使用 SQLite 的 localtime 计算周期起点（依赖系统时区设为北京时间）
      let dateSql;
      switch (period) {
        case 'week':
          // 本周周一 00:00:00（SQLite 的 'weekday 1' = 周一）
          dateSql = `date('now', 'localtime', 'weekday 1')`;
          break;
        case 'month':
          dateSql = `date('now', 'localtime', 'start of month')`;
          break;
        case 'year':
          dateSql = `date('now', 'localtime', 'start of year')`;
          break;
        default:
          dateSql = `'1970-01-01'`;
      }

      // 先查出周期起点的日期字符串
      const dateFilterRow = this.db.prepare(`SELECT ${dateSql} as startDate`).get();
      const dateFilter = dateFilterRow.startDate + ' 00:00:00';

      const items = this.db
        .prepare(
          `SELECT * FROM todos
           WHERE archived = 1 AND archived_at >= ?
           ORDER BY archived_at DESC`
        )
        .all(dateFilter);

      const categoryCount = {};
      items.forEach((item) => {
        const cat = item.category || '未分类';
        if (!categoryCount[cat]) categoryCount[cat] = { count: 0, items: [] };
        categoryCount[cat].count++;
        categoryCount[cat].items.push(item);
      });

      const dailyCount = {};
      items.forEach((item) => {
        const day = item.archived_at ? item.archived_at.slice(0, 10) : 'unknown';
        dailyCount[day] = (dailyCount[day] || 0) + 1;
      });

      const totalTodos = this.db
        .prepare(
          `SELECT COUNT(*) as total,
                  SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END) as archived,
                  SUM(CASE WHEN archived = 0 AND completed = 1 THEN 1 ELSE 0 END) as completed,
                  SUM(CASE WHEN archived = 0 AND completed = 0 THEN 1 ELSE 0 END) as active
           FROM todos`
        )
        .get();

      return {
        period,
        totalItems: items.length,
        categoryDistribution: categoryCount,
        dailyDistribution: dailyCount,
        completionStats: totalTodos,
        items,
      };
    } catch (e) {
      console.error('getWorkAnalysis failed:', e);
      return {};
    }
  }

  getDueSoon(withinMinutes = 15) {
    try {
      // 查询未完成的、设置了截止日期的、且截止时间在 N 分钟内的任务
      const now = nowBeijing();
      const nowDate = new Date(now.replace(' ', 'T') + '+08:00');
      const limitTime = new Date(nowDate.getTime() + withinMinutes * 60 * 1000);
      const limitStr = limitTime.toISOString().replace('T', ' ').slice(0, 19);

      const rows = this.db
        .prepare(
          `SELECT * FROM todos
           WHERE archived = 0 AND completed = 0
             AND due_date IS NOT NULL AND due_date != ''
             AND due_date <= ? AND due_date > ?
           ORDER BY due_date ASC`
        )
        .all(limitStr, now);
      return rows;
    } catch (e) {
      try { console.error('getDueSoon failed:', e); } catch {}
      return [];
    }
  }

  getSettings() {
    try {
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
    } catch (e) {
      console.error('getSettings failed:', e);
      return {};
    }
  }

  saveSettings(settings) {
    try {
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
    } catch (e) {
      console.error('saveSettings failed:', e);
      return { success: false, error: e.message };
    }
  }

  close() {
    this.db.close();
  }
}

module.exports = TodoDatabase;
