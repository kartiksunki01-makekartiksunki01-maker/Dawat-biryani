import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/playfair-display/wght.css';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '../styles/index.css';
import { TrackApp } from './TrackApp';

createRoot(document.getElementById('track-root')!).render(
  <StrictMode>
    <TrackApp />
  </StrictMode>,
);
