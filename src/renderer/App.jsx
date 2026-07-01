import React, { useState, useEffect } from 'react';
import TodoWindow from './components/TodoWindow';
import TrayView from './components/TrayView';
import Settings from './components/Settings';
import QuickAdd from './components/QuickAdd';

export default function App() {
  const [route, setRoute] = useState(window.location.hash.replace('#', '') || '/');

  useEffect(() => {
    // Listen for navigation from main process
    if (window.electronAPI?.onNavigate) {
      window.electronAPI.onNavigate((newRoute) => {
        setRoute(newRoute);
      });
    }

    // Listen for hash changes
    const handleHashChange = () => {
      setRoute(window.location.hash.replace('#', '') || '/');
    };
    window.addEventListener('hashchange', handleHashChange);

    // Keyboard shortcut: Cmd/Ctrl + , to open a separate settings window (macOS and Windows)
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        window.electronAPI?.openSettingsWindow?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  if (route === '/tray') {
    return <TrayView />;
  }

  if (route === '/settings') {
    return <Settings />;
  }

  if (route === '/quickadd') {
    return <QuickAdd />;
  }

  return <TodoWindow />;
}
