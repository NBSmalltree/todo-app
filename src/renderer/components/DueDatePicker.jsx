import React, { useState, useEffect, useRef, useMemo } from 'react';

// 工具函数：把后端存储的 due_date 解析为 {date, hour, minute}
function parseDueDate(str) {
  if (!str) return null;
  let datePart = '';
  let hour = 23;
  let minute = 59;
  if (str.includes('T')) {
    const [d, t] = str.split('T');
    datePart = d;
    const [h, m] = (t || '').split(':');
    hour = Number(h) || 0;
    minute = Number(m) || 0;
  } else if (str.length >= 16) {
    datePart = str.slice(0, 10);
    const time = str.slice(11, 16);
    const [h, m] = time.split(':');
    hour = Number(h) || 0;
    minute = Number(m) || 0;
  } else if (str.length === 10) {
    datePart = str;
  } else {
    return null;
  }
  return { date: datePart, hour, minute };
}

// 把 {date, hour, minute} 序列化为后端存储格式 YYYY-MM-DD HH:MM:SS
function formatDueDate({ date, hour, minute }) {
  if (!date) return null;
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${date} ${hh}:${mm}:00`;
}

// 工具：加天数
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// 工具：今天的本地日期字符串
function todayStr() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// 工具：周几（0=日, 1=一, ...）
function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

// 月历网格生成：返回 6*7=42 个格子（带前后月填充）
function buildMonthGrid(year, month) {
  const first = new Date(year, month - 1, 1);
  const firstWeekday = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInPrev = new Date(year, month - 1, 0).getDate();

  const cells = [];
  // 上月填充
  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const m = month === 1 ? 12 : month - 1;
    const y = month === 1 ? year - 1 : year;
    cells.push({ y, m, d, outOfMonth: true });
  }
  // 本月
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ y: year, m: month, d, outOfMonth: false });
  }
  // 下月填充
  let nextD = 1;
  const nextM = month === 12 ? 1 : month + 1;
  const nextY = month === 12 ? year + 1 : year;
  while (cells.length < 42) {
    cells.push({ y: nextY, m: nextM, d: nextD++, outOfMonth: true });
  }
  return cells;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i);

export default function DueDatePicker({ value, onChange, onClose }) {
  const initial = parseDueDate(value) || { date: todayStr(), hour: 23, minute: 59 };
  const [selectedDate, setSelectedDate] = useState(initial.date);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);

  const today = todayStr();
  const selYear = Number(selectedDate.slice(0, 4));
  const selMonth = Number(selectedDate.slice(5, 7));
  const [viewYear, setViewYear] = useState(selYear);
  const [viewMonth, setViewMonth] = useState(selMonth);

  const pickerRef = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // 选中变更时通知父组件（实时保存）
  useEffect(() => {
    if (onChange) {
      onChange(formatDueDate({ date: selectedDate, hour, minute }));
    }
  }, [selectedDate, hour, minute, onChange]);

  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  const isToday = (cell) =>
    cell.y === Number(today.slice(0, 4)) &&
    cell.m === Number(today.slice(5, 7)) &&
    cell.d === Number(today.slice(8, 10));

  const isSelected = (cell) =>
    cell.y === selYear && cell.m === selMonth && cell.d === Number(selectedDate.slice(8, 10));

  const cellDateStr = (cell) =>
    `${cell.y}-${String(cell.m).padStart(2, '0')}-${String(cell.d).padStart(2, '0')}`;

  // 预设：今天 23:59 / 明天 12:00 / 后天 12:00 / 下周一 09:00
  const presets = [
    { label: '今天', offset: 0, h: 23, m: 59 },
    { label: '明天', offset: 1, h: 12, m: 0 },
    { label: '后天', offset: 2, h: 12, m: 0 },
    { label: '下周', offset: null, h: 9, m: 0, isNextWeek: true },
  ];

  const applyPreset = (preset) => {
    let baseDate;
    if (preset.isNextWeek) {
      // 下周同一天 09:00
      const t = today;
      const wd = weekdayOf(t);
      baseDate = addDays(t, 7 - wd);
    } else {
      baseDate = addDays(today, preset.offset);
    }
    setSelectedDate(baseDate);
    setHour(preset.h);
    setMinute(preset.m);
    const [y, m] = baseDate.split('-').map(Number);
    setViewYear(y);
    setViewMonth(m);
  };

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear(viewYear - 1);
      setViewMonth(12);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear(viewYear + 1);
      setViewMonth(1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const handleClear = () => {
    onChange?.(null);
    onClose?.();
  };

  const formatDisplay = (h, m) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const selectedLabel = useMemo(() => {
    const wd = WEEK_LABELS[weekdayOf(selectedDate)];
    return `${selectedDate} 周${wd} ${formatDisplay(hour, minute)}`;
  }, [selectedDate, hour, minute]);

  return (
    <div
      ref={pickerRef}
      data-date-picker="true"
      onClick={(e) => e.stopPropagation()}
      className="mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 w-[280px] text-gray-800 select-none"
    >
      {/* 预设按钮 */}
      <div className="flex gap-1.5 mb-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => applyPreset(p)}
            className="flex-1 px-1.5 py-1 text-[11px] text-sky-600 bg-sky-50 hover:bg-sky-100 rounded transition-colors font-medium"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 月份切换 */}
      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          onClick={goPrevMonth}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded transition-colors"
          title="上一月"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="text-xs font-semibold text-gray-700">
          {viewYear}年{String(viewMonth).padStart(2, '0')}月
        </div>
        <button
          type="button"
          onClick={goNextMonth}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded transition-colors"
          title="下一月"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* 周标题 */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {WEEK_LABELS.map((w) => (
          <div key={w} className="h-5 flex items-center justify-center text-[10px] text-gray-400 font-medium">
            {w}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-0.5">
        {grid.map((cell, idx) => {
          const cellDate = cellDateStr(cell);
          const isFuture = cellDate >= today;
          const sel = isSelected(cell);
          const tod = isToday(cell);
          return (
            <button
              key={idx}
              type="button"
              disabled={!isFuture}
              onClick={() => {
                if (isFuture) {
                  setSelectedDate(cellDate);
                }
              }}
              className={[
                'h-7 text-[11px] rounded transition-colors flex items-center justify-center',
                cell.outOfMonth ? 'text-gray-300' : 'text-gray-700',
                tod && !sel ? 'text-sky-600 font-semibold' : '',
                sel ? 'bg-sky-500 text-white font-semibold hover:bg-sky-500' : '',
                !sel && isFuture && !cell.outOfMonth ? 'hover:bg-sky-50' : '',
                !isFuture ? 'cursor-not-allowed opacity-50' : '',
              ].join(' ')}
            >
              {cell.d}
            </button>
          );
        })}
      </div>

      {/* 时间选择 */}
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
        <select
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="flex-1 px-1.5 py-1 text-xs bg-gray-50 border border-gray-200 rounded text-gray-700 focus:outline-none focus:border-sky-300 cursor-pointer"
        >
          {HOUR_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, '0')} 时
            </option>
          ))}
        </select>
        <span className="text-gray-400 text-xs">:</span>
        <select
          value={minute}
          onChange={(e) => setMinute(Number(e.target.value))}
          className="flex-1 px-1.5 py-1 text-xs bg-gray-50 border border-gray-200 rounded text-gray-700 focus:outline-none focus:border-sky-300 cursor-pointer"
        >
          {MINUTE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {String(m).padStart(2, '0')} 分
            </option>
          ))}
        </select>
      </div>

      {/* 当前选择摘要 + 清除 */}
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between">
        <span className="text-[10px] text-gray-500 truncate flex-1">{selectedLabel}</span>
        <button
          type="button"
          onClick={handleClear}
          className="text-[11px] text-gray-400 hover:text-red-500 transition-colors px-1.5"
        >
          清除
        </button>
      </div>
    </div>
  );
}
