import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { EmailListPage } from './pages/EmailListPage';
import { EmailDetail } from './pages/EmailDetail';
import { QueueDashboard } from './pages/QueueDashboard';
import { authService } from './api/authService';
import type { User } from './types';

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('reachinbox_token');
      const savedUser = localStorage.getItem('reachinbox_user');

      if (token && savedUser) {
        try {
          setUser(JSON.parse(savedUser) as User);
          // Refresh user profile in the background
          const freshUser = await authService.getMe();
          setUser(freshUser);
          localStorage.setItem('reachinbox_user', JSON.stringify(freshUser));
        } catch {
          // Token expired or invalid
          localStorage.removeItem('reachinbox_token');
          localStorage.removeItem('reachinbox_user');
          setUser(null);
        }
      }
      setIsInitializing(false);
    };

    checkAuth();

    const handleAuthChange = () => {
      checkAuth();
    };
    window.addEventListener('auth_change', handleAuthChange);
    return () => window.removeEventListener('auth_change', handleAuthChange);
  }, []);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    localStorage.removeItem('reachinbox_token');
    localStorage.removeItem('reachinbox_user');
    setUser(null);
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          {/* Public Login Route */}
          <Route
            path="/login"
            element={user ? <Navigate to="/scheduled" replace /> : <Login onLoginSuccess={handleLoginSuccess} />}
          />

          {/* Protected Main Layout */}
          <Route
            path="/"
            element={user ? <Dashboard user={user} onLogout={handleLogout} /> : <Navigate to="/login" replace />}
          >
            <Route index element={<Navigate to="/scheduled" replace />} />
            <Route path="scheduled" element={<EmailListPage type="scheduled" />} />
            <Route path="sent" element={<EmailListPage type="sent" />} />
            <Route path="queue" element={<QueueDashboard />} />
            <Route path="admin" element={<Navigate to="/queue" replace />} />
            <Route path="email/:id" element={<EmailDetail />} />
          </Route>

          {/* Catch-all fallback */}
          <Route path="*" element={<Navigate to="/scheduled" replace />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
