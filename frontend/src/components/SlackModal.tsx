import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Check, AlertTriangle, Send, Link, ExternalLink } from 'lucide-react';
import { api } from '../api/client';
import { SlackStatus } from '../types';
import { toast } from 'sonner';

interface SlackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated: () => void;
}

export const SlackModal: React.FC<SlackModalProps> = ({ isOpen, onClose, onStatusUpdated }) => {
  const [status, setStatus] = useState<SlackStatus | null>(null);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [channelName, setChannelName] = useState('#general');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/slack/status');
      setStatus(res.data);
      if (res.data.channelName) setChannelName(res.data.channelName);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) fetchStatus();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnectWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
      toast.error('Must be a valid Slack Webhook URL (https://hooks.slack.com/...)');
      return;
    }

    setIsSaving(true);
    try {
      await api.post('/slack/webhook', { webhookUrl, channelName });
      toast.success('Slack webhook connected successfully!');
      fetchStatus();
      onStatusUpdated();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to connect Slack';
      toast.error(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestAlert = async () => {
    setIsTesting(true);
    try {
      const res = await api.post('/slack/test');
      toast.success(res.data.message || 'Live Slack test notification dispatched!');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Test notification failed';
      toast.error(msg);
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.post('/slack/disconnect');
      toast.info('Slack integration disconnected');
      fetchStatus();
      onStatusUpdated();
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#4A154B] flex items-center justify-center text-white font-bold">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Slack Rate-Limit Alerts</h2>
              <p className="text-[11px] text-gray-500">Live notifications when senders hit limits</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {/* Status Badge */}
          <div className="p-4 rounded-xl border flex items-center justify-between bg-gray-50 border-gray-200">
            <div className="flex items-center space-x-3">
              <span className={`w-3 h-3 rounded-full ${status?.isConnected ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-gray-300'}`} />
              <div>
                <p className="font-semibold text-gray-900">
                  {status?.isConnected ? 'Connected to Slack' : 'Not Connected'}
                </p>
                <p className="text-[11px] text-gray-500">
                  {status?.isConnected ? `Channel: ${status.channelName || '#general'}` : 'Connect your workspace to receive live alerts'}
                </p>
              </div>
            </div>

            {status?.isConnected && (
              <button
                type="button"
                onClick={handleDisconnect}
                className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-[11px] font-medium transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>

          {/* Test Live Notification Button */}
          {status?.isConnected && (
            <div className="p-3 bg-brand-50/60 border border-brand-200/80 rounded-xl flex items-center justify-between">
              <div>
                <p className="font-semibold text-brand-900 text-xs">Verify Live Notification</p>
                <p className="text-[10px] text-brand-700">Send an immediate test alert to your Slack channel.</p>
              </div>
              <button
                type="button"
                onClick={handleTestAlert}
                disabled={isTesting}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shadow-xs disabled:opacity-50"
              >
                <Send className="w-3 h-3" />
                <span>{isTesting ? 'Sending...' : 'Test Alert'}</span>
              </button>
            </div>
          )}

          {/* Webhook Form */}
          <form onSubmit={handleConnectWebhook} className="space-y-3.5 pt-2 border-t border-gray-100">
            <div>
              <label className="block text-gray-700 font-semibold mb-1 text-[11px]">
                Slack Incoming Webhook URL:
              </label>
              <input
                type="url"
                required
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/T.../B.../..."
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-brand-500"
              />
              <p className="text-[10px] text-gray-400 mt-1">
                From your Slack App &gt; Incoming Webhooks &gt; Add New Webhook to Workspace.
              </p>
            </div>

            <div>
              <label className="block text-gray-700 font-semibold mb-1 text-[11px]">
                Channel Name (Display):
              </label>
              <input
                type="text"
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="#general"
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-brand-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-2 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl text-xs transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Connecting...' : status?.isConnected ? 'Update Webhook' : 'Connect Slack'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
