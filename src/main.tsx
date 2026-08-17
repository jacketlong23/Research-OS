import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { ensureSeeded } from './store'
import { initTheme } from './lib/theme'
import { APP_VERSION } from './version'

ensureSeeded()
initTheme()
console.info(`[Research OS] v${APP_VERSION} · 若界面异常请强制刷新(Ctrl+F5 / Cmd+Shift+R)`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
