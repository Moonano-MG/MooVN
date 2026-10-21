import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';

const styleEl = document.createElement('style');
styleEl.textContent = `
  * {
    box-sizing: border-box;
  }
  html, body, #root {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #040812;
  }
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: rgba(15, 23, 42, 0.4);
  }
  ::-webkit-scrollbar-thumb {
    background: rgba(56, 189, 248, 0.4);
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: rgba(56, 189, 248, 0.7);
  }
`;
document.head.appendChild(styleEl);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
