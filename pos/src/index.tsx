import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './print.css';
import App from './App';

// Suppress verbose logs in production builds and external noise
const originalLog = console.log;
const originalDebug = console.debug;
const originalWarn = console.warn;
const originalError = console.error;

const filter = (...args: any[]) => {
  const msg = args.map(arg => String(arg)).join(' ');
  return (
    msg.includes('VIDEO_XHR_CANDIDATE') ||
    msg.includes('dispatchMessage') ||
    msg.includes('_$initialUrl') ||
    msg.includes('chrome-extension://') ||
    msg.includes('message.js') ||
    msg.includes('extension://') ||
    msg.includes('firestore.googleapis.com') ||
    msg.includes('Failed to fetch') ||
    msg.includes('cleardot.gif') ||
    msg.includes('503 (Offline)') ||
    msg.includes('@firebase/firestore') ||
    msg.includes('ERR_INTERNET_DISCONNECTED') ||
    msg.includes('net::ERR')
  );
};

const isProd = import.meta.env.PROD;

console.log = (...args) => { if (!isProd && !filter(...args)) originalLog(...args); };
console.debug = (...args) => { if (!isProd && !filter(...args)) originalDebug(...args); };
console.warn = (...args) => { if (!isProd && !filter(...args)) originalWarn(...args); };
console.error = (...args) => { if (!filter(...args)) originalError(...args); };


import { registerSW } from 'virtual:pwa-register';

// Service Worker Registration for PWA capabilities
if ('serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);