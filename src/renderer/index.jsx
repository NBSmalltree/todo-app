import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import I18nProvider from './i18n/I18nProvider';
import './styles/index.css';

const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  <I18nProvider>
    <App />
  </I18nProvider>
);
