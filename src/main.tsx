import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles/index.css';
import { APP_VERSION } from './version.ts';
import { splashStep, splashVersion } from './services/splash.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

splashVersion(APP_VERSION);
splashStep(35, 'Recherche des pharmacies de garde…');
