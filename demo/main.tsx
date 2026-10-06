import React from 'react'
import { createRoot } from 'react-dom/client'
import '@notrealstudio/nr-nodes/ui/styles'
import './demo.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
