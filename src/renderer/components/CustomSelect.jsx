import React, { useState, useEffect, useRef } from 'react';

import { useI18n } from '../i18n';

export default function CustomSelect({ value, onChange, options, placeholder, className, dropUp }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find((o) => o.value === value);
  const label = selected ? selected.label : placeholder || t('common.pleaseSelect');
  const isPlaceholder = value === '' || value === null || value === undefined;

  return (
    <div ref={ref} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm bg-white rounded-lg border transition-all ${
          open
            ? 'border-sky-400 ring-2 ring-sky-100'
            : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <span className={`truncate ${isPlaceholder ? 'text-gray-400' : 'text-gray-700'}`}>
          {label}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ml-auto ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className={`absolute z-50 w-full min-w-[140px] bg-white rounded-lg shadow-lg border border-gray-200 py-1 max-h-48 overflow-auto ${dropUp ? 'bottom-full mb-1' : 'mt-1'}`}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                opt.value === value
                  ? 'bg-sky-50 text-sky-600 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
