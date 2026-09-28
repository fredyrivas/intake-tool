import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { Home } from './home';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {window.location.pathname.replace(/\/+$/, '') === '' ? <Home /> : <App />}
  </StrictMode>,
);
