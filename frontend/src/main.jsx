import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { fontSize: '14px', color: '#0f172a', borderRadius: '10px', border: '1px solid #e2e8f0' },
            success: { iconTheme: { primary: '#15803d', secondary: '#fff' } },
            error: { duration: 6000 },
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
