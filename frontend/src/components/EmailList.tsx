import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, CheckCircle2, XCircle, AlertCircle, ExternalLink, Mail } from 'lucide-react';
import { format } from 'date-fns';
import { StatusBadge, EmptyState } from './ui';
import type { ScheduledEmail } from '../types';

interface EmailListProps {
  type: 'scheduled' | 'sent';
  emails: ScheduledEmail[];
  isLoading: boolean;
}

export const EmailList: React.FC<EmailListProps> = ({ type, emails, isLoading }) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <div
            key={n}
            className="h-16 bg-white border border-gray-200/60 rounded-xl animate-pulse p-4 flex items-center justify-between"
          >
            <div className="space-y-2 flex-1">
              <div className="h-3.5 bg-gray-200 rounded w-1/4" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
            </div>
            <div className="w-24 h-6 bg-gray-100 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <EmptyState
        icon={
          type === 'scheduled'
            ? <Clock className="w-7 h-7 text-amber-500" />
            : <Mail className="w-7 h-7 text-gray-400" />
        }
        title={type === 'scheduled' ? 'No scheduled emails' : 'No sent emails yet'}
        description={
          type === 'scheduled'
            ? 'Compose a new email campaign and upload leads to schedule automated sends.'
            : 'Once scheduled jobs execute through BullMQ and Ethereal SMTP, delivered emails appear here.'
        }
      />
    );
  }

  return (
    <div className="divide-y divide-gray-100 bg-white">
      {emails.map((email) => {
        const displayDate =
          type === 'scheduled'
            ? new Date(email.scheduledAt)
            : email.sentAt
            ? new Date(email.sentAt)
            : new Date(email.updatedAt);

        const isRateLimited = email.status === 'RATE_LIMITED_RESCHEDULED';
        const isSent = email.status === 'SENT';

        return (
          <div
            key={email.id}
            onClick={() => navigate(`/email/${email.id}`)}
            className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/70 transition-colors cursor-pointer select-none"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/email/${email.id}`)}
          >
            {/* Recipient & Snippet */}
            <div className="flex-1 pr-6 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-xs font-semibold text-gray-900 truncate">
                  To: {email.recipientEmail}
                </span>
                <span className="text-[11px] text-gray-400 flex-shrink-0">via {email.senderEmail}</span>
                {type === 'sent' && (
                  <span className="text-[11px] text-gray-400 flex-shrink-0">
                    • {format(displayDate, 'MMM d, h:mm a')}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate">
                <span className="font-medium text-gray-700">{email.subject}</span>
                <span className="mx-1.5 text-gray-300">—</span>
                <span>{email.body.replace(/\n/g, ' ')}</span>
              </p>
            </div>

            {/* Status & Actions */}
            <div className="flex items-center space-x-3 flex-shrink-0">
              {type === 'scheduled' ? (
                <div
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-full border text-[11px] font-medium shadow-2xs ${
                    isRateLimited
                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : 'bg-[#FFF3E0] border-[#FFE0B2] text-[#E65100]'
                  }`}
                >
                  {isRateLimited ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  ) : (
                    <Clock className="w-3.5 h-3.5 text-[#FB8C00]" />
                  )}
                  <span>{format(displayDate, 'EEE h:mm:ss a')}</span>
                </div>
              ) : (
                <>
                  <div
                    className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-[11px] font-medium border ${
                      isSent
                        ? 'bg-gray-100 border-gray-200 text-gray-700'
                        : 'bg-rose-50 border-rose-200 text-rose-700'
                    }`}
                  >
                    {isSent ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-500" />
                    )}
                    <span>{isSent ? 'Sent' : 'Failed'}</span>
                  </div>

                  {!isSent && email.errorMessage && (
                    <span
                      className="hidden md:inline-block max-w-[220px] truncate text-[10px] text-rose-600 bg-rose-50/80 px-2 py-0.5 rounded border border-rose-200"
                      title={email.errorMessage}
                    >
                      {email.errorMessage}
                    </span>
                  )}

                  {email.etherealPreviewUrl && (
                    <a
                      href={email.etherealPreviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 text-[11px] font-medium transition-colors"
                      title="Open rendered email in Ethereal test inbox"
                    >
                      <span>View Email</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
