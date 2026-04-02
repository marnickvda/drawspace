// Set Excalidraw asset path BEFORE any Excalidraw imports.
// This must be a global assignment so Excalidraw loads fonts from our
// self-hosted /fonts/ directory instead of fetching from esm.sh.
// Works in both dev (Vite dev server) and production (custom app:// protocol).
;(window as unknown as Record<string, unknown>).EXCALIDRAW_ASSET_PATH = '/'

import './styles/globals.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
