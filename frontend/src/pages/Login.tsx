import React, { useState, useEffect } from 'react';
import { Sparkles, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { authService } from '../api/authService';
import type { User } from '../types';
import { Button } from '../components/ui';

interface LoginProps {
  onLoginSuccess: (user: User) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('oliver.brown@domain.io');
  const [password, setPassword] = useState('password123');
  const [isLoading, setIsLoading] = useState(false);

  // Handle OAuth 2.0 redirect callback (?token=...&user=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const userStr = params.get('user');
    const error = params.get('error');

    if (error) {
      toast.error(`Google authentication error: ${error}`);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (token && userStr) {
      try {
        const user: User = JSON.parse(decodeURIComponent(userStr));
        localStorage.setItem('reachinbox_token', token);
        localStorage.setItem('reachinbox_user', JSON.stringify(user));
        toast.success(`Welcome back, ${user.name}!`);
        onLoginSuccess(user);
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {
        toast.error('Authentication callback failed. Please try again.');
      }
    }
  }, [onLoginSuccess]);

  // Standard OAuth 2.0 Web Redirect (no iframe/origin blocks)
  const handleGoogleRedirectLogin = async () => {
    setIsLoading(true);
    try {
      const { url } = await authService.getGoogleAuthUrl();
      window.location.href = url;
    } catch {
      toast.error('Failed to connect to authentication server');
      setIsLoading(false);
    }
  };

  // Email / password dev-login
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error('Email is required');
      return;
    }

    setIsLoading(true);
    try {
      const { user, token } = await authService.devLogin(email.trim(), email.split('@')[0]);
      localStorage.setItem('reachinbox_token', token);
      localStorage.setItem('reachinbox_user', JSON.stringify(user));
      toast.success(`Welcome, ${user.name}!`);
      onLoginSuccess(user);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
            'Login failed. Please try again.';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200/80 shadow-xl p-8 space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center mx-auto shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Login</h1>
          <p className="text-xs text-gray-500">ReachInbox Cold Outreach Email Scheduler</p>
        </div>

        {/* Google OAuth Button (redirect flow — no iframe origin issues) */}
        <Button
          variant="secondary"
          size="md"
          isLoading={isLoading}
          onClick={handleGoogleRedirectLogin}
          className="w-full"
          leftIcon={
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
          }
        >
          Continue with Google
        </Button>

        {/* Divider */}
        <div className="relative flex items-center justify-center">
          <div className="border-t border-gray-200 w-full" />
          <span className="bg-white px-3 text-[11px] text-gray-400 absolute">or sign in with email</span>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleEmailLogin} className="space-y-4 text-xs">
          <div>
            <label className="block text-gray-700 font-medium mb-1 text-[11px]">Email ID</label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@domain.com"
                className="w-full pl-9 pr-3 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-1 text-[11px]">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 transition-all"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
            className="w-full"
          >
            {isLoading ? 'Signing in…' : 'Login'}
          </Button>
        </form>

        <p className="text-[11px] text-gray-400 text-center">
          Protected by ReachInbox Security &amp; BullMQ Persistent Queue
        </p>
      </div>
    </div>
  );
};
