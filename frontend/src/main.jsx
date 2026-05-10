import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter as Router } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { Web3Provider } from './context/Web3Context'
import { SolanaProvider } from './context/SolanaProvider'
import { SettingsProvider } from './context/SettingsContext';
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router> {/* Router at the top level */}
      <SolanaProvider>
        <Web3Provider>
          <AuthProvider>
            <SettingsProvider>
              <App />
            </SettingsProvider>
          </AuthProvider>
        </Web3Provider>
      </SolanaProvider>
    </Router>
  </React.StrictMode>,
)