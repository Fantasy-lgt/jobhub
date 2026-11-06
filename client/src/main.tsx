import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './theme/tokens.css'
import './theme/global.css'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('未找到 #root 挂载点')

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
