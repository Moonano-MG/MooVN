import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { OfficialPortal } from './components/OfficialPortal';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OfficialPortal />
  </StrictMode>
);
