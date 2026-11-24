import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/playfair-display/wght-italic.css';
import '@fontsource-variable/cinzel/wght.css';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-devanagari/wght.css';
import './styles/index.css';
import { syncMenu } from './data/menuSync';
import App from './App';

syncMenu(); // refresh dishes & prices from the backend (falls back silently if offline)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
