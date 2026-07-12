import React, { useState, useEffect } from 'react';
import TodoWindow from './components/TodoWindow';
import TrayView from './components/TrayView';
import Settings from './components/Settings';
import QuickAdd from './components/QuickAdd';
import api from './api';

export default function App() {
  const [route, setRoute] = useState(window.location.hash.replace('#', '') || '/');

  useEffect(() => {
    // Listen for navigation events — only respond if hash changes
    // NOTE: onNavigate is only needed for windows that may be
    // re-routed by the backend (e.g. tray-view). For the float
    // window, the initial hash already determines the route and
    // should never change. We guard against cross-window event
    // leakage by ignoring navigate events that don't match the
    // window's initial route category.
    const initialHash = window.location.hash.replace('#', '') || '/';
    let unlisten;
    api.onNavigate((newRoute) => {
      // Only accept navigation if it matches this window's expected route
      // or if this window is the tray-view (the only window that should re-route)
      if (initialHash === '/tray' || newRoute === initialHash) {
        setRoute(newRoute);
      }
    }).then(fn => { unlisten = fn; });

    // Listen for hash changes
    const handleHashChange = () => {
      setRoute(window.location.hash.replace('#', '') || '/');
    };
    window.addEventListener('hashchange', handleHashChange);

    // Keyboard shortcut: Cmd/Ctrl + , to open a separate settings window (macOS and Windows)
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        api.openSettingsWindow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('keydown', handleKeyDown);
      if (unlisten) unlisten();
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
