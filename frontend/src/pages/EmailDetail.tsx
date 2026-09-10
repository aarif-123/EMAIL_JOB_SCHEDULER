import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Mail,
  Calendar,
  Layers,
  Activity,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { emailService } from '../api/emailService';
import { StatusBadge, Spinner, EmptyState } from '../components/ui';
import type { EmailDetailData } from '../types';

export const EmailDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [email, setEmail] = useState<EmailDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchEmail = async () => {
      try {
        setIsLoading(true);
        const data = await emailService.getById(id) as EmailDetailData;
        setEmail(data);
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'Failed to load email details';
        toast.error(msg);
        navigate(-1);
      } finally {
        setIsLoading(false);
      }
    };

    fetchEmail();
  }, [id, navigate]);

  if (isLoading) {
    return (
      <div className="flex-1 p-8 bg-[#F9FAFB] overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center space-x-3 text-gray-400">
            <Spinner size="sm" />
            <span className="text-xs">Loading email details…</span>
          </div>
          <div className="h-32 bg-white rounded-2xl border border-gray-200 animate-pulse" />
          <div className="h-64 bg-white rounded-2xl border border-gray-200 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex-1 bg-[#F9FAFB] overflow-y-auto flex items-center justify-center">
        <EmptyState
          icon={<Mail className="w-7 h-7" />}
          title="Email not found"
          description="This email record may have been removed or the ID is incorrect."
          action={{ label: 'Go back', onClick: () => navigate(-1) }}
        />
      </div>
    );
  }

  const isSent = email.status === 'SENT';
  const displayDate =
    isSent && email.sentAt ? new Date(email.sentAt) : new Date(email.scheduledAt);

  return (
    <div className="flex-1 bg-[#F9FAFB] overflow-y-auto">
      <div className="max-w-4xl mx-auto p-8 space-y-6">
        {/* Nav bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center space-x-2 text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to email list</span>
          </button>

          {email.etherealPreviewUrl && (
            <a
              href={email.etherealPreviewUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-brand-50 text-brand-700 border border-brand-200 text-xs font-semibold hover:bg-brand-100 transition-colors shadow-2xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View in Ethereal Sandbox</span>
            </a>
          )}
        </div>

        {/* Header card */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Subject</span>
              <h1 className="text-xl font-bold text-gray-900 leading-snug">{email.subject}</h1>
            </div>
            <div className="flex-shrink-0">
              <StatusBadge status={email.status} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-100 text-xs text-gray-600">
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 w-16">From:</span>
                <span className="font-medium text-gray-900 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                  {email.senderEmail}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-400 w-16">To:</span>
                <span className="font-semibold text-gray-900 bg-brand-50/50 px-2 py-0.5 rounded border border-brand-200/60">
                  {email.recipientEmail}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Calendar className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-gray-400">Time:</span>
                <span className="font-medium text-gray-900">
                  {format(displayDate, 'EEEE, MMMM d, yyyy h:mm:ss a')}
                </span>
              </div>
              {email.batch && (
                <div className="flex items-center space-x-2">
                  <Layers className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-400">Campaign:</span>
                  <span>
                    Batch of {email.batch.totalRecipients} leads ({email.batch.delayBetweenSeconds}s delay,{' '}
                    {email.batch.hourlyLimit}/hr limit)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Email Message Content</h2>
          <div className="p-4 bg-gray-50/70 border border-gray-200/60 rounded-xl text-sm text-gray-800 leading-relaxed whitespace-pre-wrap font-sans selection:bg-brand-100">
            {email.body}
          </div>
        </div>

        {/* Audit trail */}
        <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-brand-600" />
              <h2 className="text-sm font-bold text-gray-900">Job Execution Lifecycle &amp; Audit Trail</h2>
            </div>
            <span className="text-[11px] text-gray-400 font-mono">ID: {email.id}</span>
          </div>

          {email.events && email.events.length > 0 ? (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
              {email.events.map((event) => (
                <div key={event.id} className="relative">
                  <div className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-brand-600 ring-4 ring-white" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gray-800 uppercase tracking-wide">
                      {event.eventType.replace(/_/g, ' ')}
                    </span>
                    <span className="text-gray-400">
                      {format(new Date(event.createdAt), 'MMM d, h:mm:ss a')}
                    </span>
                  </div>
                  {event.details && Object.keys(event.details).length > 0 && (
                    <div className="mt-1 text-[11px] font-mono text-gray-500 bg-gray-50 p-2 rounded border border-gray-100">
                      {JSON.stringify(event.details)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-500 italic">No lifecycle events recorded yet.</p>
          )}
        </div>
      </div>
    </div>
  );
};
