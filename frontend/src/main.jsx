import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import App from './App.jsx'
import { SessionProvider } from './context/SessionContext.jsx'
import { ToastProvider } from './context/ToastContext.jsx'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

// If VITE_GOOGLE_CLIENT_ID isn't set (e.g. local dev without a .env), this
// still renders the rest of the app - only the Google button on Login.jsx
// is affected, everything else works exactly as before Google sign-in existed.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
            <App />
          </GoogleOAuthProvider>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
