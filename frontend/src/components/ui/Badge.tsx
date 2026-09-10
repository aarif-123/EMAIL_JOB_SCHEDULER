import React from 'react';
import { CheckCircle2, Clock, AlertCircle, XCircle, Loader2 } from 'lucide-react';
import type { ScheduledEmail } from '../../types';

type EmailStatus = ScheduledEmail['status'];
type JobState = 'delayed' | 'active' | 'waiting' | 'completed' | 'failed' | 'paused';

interface StatusBadgeProps {
  status: EmailStatus | JobState;
  className?: string;
}

const EMAIL_STATUS_MAP: Record<EmailStatus, { label: string; classes: string; icon: React.ReactNode }> = {
  SCHEDULED: {
    label: 'Scheduled',
    classes: 'bg-[#FFF3E0] border-[#FFE0B2] text-[#E65100]',
    icon: <Clock className="w-3 h-3 text-[#FB8C00]" />,
  },
  QUEUED: {
    label: 'Queued',
    classes: 'bg-purple-50 border-purple-200 text-purple-700',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  SENDING: {
    label: 'Sending',
    classes: 'bg-blue-50 border-blue-200 text-blue-700',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  SENT: {
    label: 'Sent',
    classes: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    icon: <CheckCircle2 className="w-3 h-3 text-emerald-500" />,
  },
  FAILED: {
    label: 'Failed',
    classes: 'bg-rose-50 border-rose-200 text-rose-700',
    icon: <XCircle className="w-3 h-3 text-rose-500" />,
  },
  RATE_LIMITED_RESCHEDULED: {
    label: 'Rate Limited',
    classes: 'bg-rose-50 border-rose-200 text-rose-700',
    icon: <AlertCircle className="w-3 h-3 text-rose-500" />,
  },
};

const JOB_STATE_MAP: Record<JobState, { label: string; classes: string }> = {
  delayed: { label: 'Delayed', classes: 'bg-amber-50 border-amber-200 text-amber-700' },
  active:  { label: 'Active',  classes: 'bg-blue-50 border-blue-200 text-blue-700' },
  waiting: { label: 'Waiting', classes: 'bg-purple-50 border-purple-200 text-purple-700' },
  completed: { label: 'Completed', classes: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  failed:  { label: 'Failed',  classes: 'bg-rose-50 border-rose-200 text-rose-700' },
  paused:  { label: 'Paused',  classes: 'bg-gray-100 border-gray-200 text-gray-700' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const isEmailStatus = status in EMAIL_STATUS_MAP;

  if (isEmailStatus) {
    const { label, classes, icon } = EMAIL_STATUS_MAP[status as EmailStatus];
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${classes} ${className}`}>
        {icon}
        {label}
      </span>
    );
  }

  const jobStatus = JOB_STATE_MAP[status as JobState] ?? { label: status, classes: 'bg-gray-100 border-gray-200 text-gray-600' };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[10px] font-semibold ${jobStatus.classes} ${className}`}>
      {jobStatus.label}
    </span>
  );
};
