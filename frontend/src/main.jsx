import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { SessionProvider } from './context/SessionContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'

// Google sign-in is now a plain link straight to the backend's server-side
// OAuth redirect flow (see Login.jsx / backend/app/routers/auth.py) - no
// Google Identity Services JS SDK runs on this page at all anymore, so
// there's no provider/client-id wiring needed here.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
