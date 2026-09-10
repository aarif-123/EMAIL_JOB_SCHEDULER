import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Paperclip,
  Clock,
  Calendar,
  ChevronDown,
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Quote,
  Baseline,
  Strikethrough,
  ChevronsUpDown,
  Upload,
  FileText,
  Plus,
  ShieldCheck,
  X,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { emailService } from '../api/emailService';
import type { SenderAccount } from '../types';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  senders: SenderAccount[];
  currentUserEmail?: string;
  onSendersUpdated?: () => void;
  onScheduledSuccess: () => void;
}

interface FormState {
  selectedSender: string;
  recipients: string[];
  manualInput: string;
  subject: string;
  body: string;
  delayBetweenSeconds: number;
  hourlyLimit: number;
  isScheduled: boolean;
  startTime: string;
}

const DEFAULT_SENDERS: SenderAccount[] = [
  { id: 'default-1', email: 'oliver.brown@domain.io', name: 'Oliver Brown', isDefault: true, hourlyLimit: 50 },
  { id: 'default-2', email: 'outreach@reachinbox.ai', name: 'ReachInbox Growth', isDefault: false, hourlyLimit: 50 },
  { id: 'default-3', email: 'sales@reachinbox.ai', name: 'Enterprise Sales', isDefault: false, hourlyLimit: 50 },
];

const buildInitialState = (pool: SenderAccount[]): FormState => ({
  selectedSender: pool[0]?.email ?? 'oliver.brown@domain.io',
  recipients: [],
  manualInput: '',
  subject: '',
  body: '',
  delayBetweenSeconds: 0,
  hourlyLimit: 0,
  isScheduled: false,
  startTime: '',
});

const getTomorrowPreset = (hours: number, minutes = 0): Date => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hours, minutes, 0, 0);
  return d;
};

interface AttachedItem {
  id: string;
  name: string;
  size: string;
  isImage: boolean;
  previewUrl?: string;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  senders,
  currentUserEmail,
  onSendersUpdated,
  onScheduledSuccess,
}) => {
  const defaultAccountEmail = currentUserEmail || 'oliver.brown@domain.io';

  // Build the list of available senders, ensuring current account email is present at top
  const allSendersMap = new Map<string, SenderAccount>();
  allSendersMap.set(defaultAccountEmail, {
    id: 'current-user-account',
    email: defaultAccountEmail,
    name: 'Current Account',
    isDefault: true,
    hourlyLimit: 50,
  });

  for (const s of (senders || [])) {
    if (!allSendersMap.has(s.email)) {
      allSendersMap.set(s.email, s);
    }
  }

  for (const d of DEFAULT_SENDERS) {
    if (!allSendersMap.has(d.email)) {
      allSendersMap.set(d.email, d);
    }
  }

  const availableSenders = Array.from(allSendersMap.values());
  const [form, setForm] = useState<FormState>(() => buildInitialState(availableSenders));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [attachments, setAttachments] = useState<AttachedItem[]>([]);

  // Send Later Popover state
  const [showSendLater, setShowSendLater] = useState(false);
  const [tempStartTime, setTempStartTime] = useState('');
  const [selectedPresetLabel, setSelectedPresetLabel] = useState<string | null>(null);

  // Add & Verify Sender state
  const [showAddSenderModal, setShowAddSenderModal] = useState(false);
  const [verifyStep, setVerifyStep] = useState<'input' | 'code'>('input');
  const [newSenderEmail, setNewSenderEmail] = useState('');
  const [newSenderName, setNewSenderName] = useState('');
  const [testVerificationCode, setTestVerificationCode] = useState('');
  const [enteredCode, setEnteredCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const leadFileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Reset state each time modal opens
  useEffect(() => {
    if (isOpen) {
      setForm(buildInitialState(availableSenders));
      setIsSubmitting(false);
      setIsUploading(false);
      setShowSendLater(false);
      setTempStartTime('');
      setSelectedPresetLabel(null);
      setAttachments([]);
      setShowAddSenderModal(false);
      setVerifyStep('input');
      setNewSenderEmail('');
      setNewSenderName('');
      setEnteredCode('');
    }
  }, [isOpen, senders, currentUserEmail]);

  useEffect(() => {
    if (!form.selectedSender && availableSenders.length > 0) {
      setForm((f) => ({ ...f, selectedSender: availableSenders[0].email }));
    }
  }, [availableSenders, form.selectedSender]);

  const handleSendVerificationCode = () => {
    if (!newSenderEmail.trim() || !newSenderEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    setTestVerificationCode(code);
    setVerifyStep('code');
    toast.success(`Verification code sent to ${newSenderEmail}!`);
  };

  const handleConfirmVerification = async () => {
    if (!enteredCode.trim()) {
      toast.error('Please enter the 6-digit verification code');
      return;
    }
    if (enteredCode.trim() !== testVerificationCode) {
      toast.error('Invalid verification code. Please check and try again.');
      return;
    }

    setIsVerifying(true);
    try {
      const created = await emailService.addSender({
        email: newSenderEmail.trim(),
        name: newSenderName.trim() || newSenderEmail.split('@')[0],
      });
      toast.success(`Email ${created.email} verified and added!`);
      onSendersUpdated?.();
      set('selectedSender', created.email);
      setShowAddSenderModal(false);
      setVerifyStep('input');
      setNewSenderEmail('');
      setNewSenderName('');
      setEnteredCode('');
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string } } };
      const msg = errObj?.response?.data?.error ?? 'Failed to add sender';
      toast.error(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // File upload for leads list
  const handleLeadFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const res = await emailService.parseLeads(file);
      const detected: string[] = res.emails ?? [];
      const combined = Array.from(new Set([...form.recipients, ...detected]));
      set('recipients', combined);
      toast.success(`Imported ${res.detectedCount} recipient(s) from ${file.name}`);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to parse leads file';
      toast.error(msg);
    } finally {
      setIsUploading(false);
      if (leadFileInputRef.current) leadFileInputRef.current.value = '';
    }
  };

  // Attachment upload (all documents, pdfs, images, etc.)
  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const newAttachments: AttachedItem[] = files.map((file) => {
      const isImage = file.type.startsWith('image/');
      const sizeStr =
        file.size < 1024 * 1024
          ? `${(file.size / 1024).toFixed(1)} KB`
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

      return {
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        size: sizeStr,
        isImage,
        previewUrl: isImage ? URL.createObjectURL(file) : undefined,
      };
    });

    setAttachments((prev) => [...prev, ...newAttachments]);
    toast.success(`Attached ${files.length} document/file(s)`);
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // Add recipient on Enter or comma
  const handleManualKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const email = form.manualInput.trim().toLowerCase();
    if (email && email.includes('@') && !form.recipients.includes(email)) {
      set('recipients', [...form.recipients, email]);
      set('manualInput', '');
    }
  };

  const removeRecipient = (idx: number) =>
    set('recipients', form.recipients.filter((_, i) => i !== idx));

  // Rich text formatting helper
  const insertFormatting = (prefix: string, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = form.body;
    const selectedText = text.substring(start, end);
    const replacement = `${prefix}${selectedText || 'text'}${suffix}`;
    const newBody = text.substring(0, start) + replacement + text.substring(end);
    set('body', newBody);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + (selectedText.length || 4));
    }, 0);
  };

  // Send Later presets
  const presets = [
    { label: 'Tomorrow', date: getTomorrowPreset(9, 0) },
    { label: 'Tomorrow, 10:00 AM', date: getTomorrowPreset(10, 0) },
    { label: 'Tomorrow, 11:00 AM', date: getTomorrowPreset(11, 0) },
    { label: 'Tomorrow, 3:00 PM', date: getTomorrowPreset(15, 0) },
  ];

  const handlePresetSelect = (p: { label: string; date: Date }) => {
    const isoString = p.date.toISOString().slice(0, 16);
    setTempStartTime(isoString);
    setSelectedPresetLabel(p.label);
  };

  const handleApplySendLater = () => {
    if (!tempStartTime) {
      toast.error('Please pick a date & time or preset');
      return;
    }
    set('startTime', tempStartTime);
    set('isScheduled', true);
    setShowSendLater(false);
    toast.success(`Scheduled for ${selectedPresetLabel || format(new Date(tempStartTime), 'MMM d, h:mm a')}`);
  };

  const handleCancelSendLater = () => {
    set('startTime', '');
    set('isScheduled', false);
    setTempStartTime('');
    setSelectedPresetLabel(null);
    setShowSendLater(false);
  };

  const handleSubmit = async () => {
    let finalRecipients = [...form.recipients];
    const pendingRaw = form.manualInput.trim();
    if (pendingRaw) {
      const parts = pendingRaw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      for (const p of parts) {
        if (p.includes('@') && !finalRecipients.includes(p)) {
          finalRecipients.push(p);
        }
      }
    }

    if (finalRecipients.length === 0) {
      toast.error('Please add at least one recipient email');
      return;
    }
    if (!form.subject.trim()) {
      toast.error('Subject is required');
      return;
    }
    if (!form.body.trim()) {
      toast.error('Email body is required');
      return;
    }

    const activeSender = form.selectedSender || availableSenders[0]?.email || 'oliver.brown@domain.io';

    setIsSubmitting(true);
    try {
      await emailService.schedule({
        senderEmail: activeSender,
        rotateSenders: false,
        recipients: finalRecipients,
        subject: form.subject,
        body: form.body,
        delayBetweenSeconds: typeof form.delayBetweenSeconds === 'number' ? form.delayBetweenSeconds : 0,
        hourlyLimit: form.hourlyLimit > 0 ? form.hourlyLimit : 50,
        startTime: form.isScheduled && form.startTime ? new Date(form.startTime).toISOString() : null,
      });

      if (form.isScheduled && form.startTime) {
        toast.success(
          `Scheduled ${finalRecipients.length} email(s) for ${format(new Date(form.startTime), 'MMM d, h:mm a')}!`
        );
      } else {
        toast.success(`Sent ${finalRecipients.length} email(s) successfully!`);
      }

      onScheduledSuccess();
      onClose();
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string | { message: string } } } };
      const raw = errObj?.response?.data?.error;
      const msg = typeof raw === 'object' ? raw.message : (raw ?? 'Scheduling failed');
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-xs p-4">
      <div className="relative bg-white rounded-2xl border border-gray-200/90 shadow-2xl w-full max-w-4xl min-h-[640px] max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white">
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-gray-800 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              title="Close"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="text-base font-semibold text-gray-800">Compose New Email</h2>
          </div>

          <div className="flex items-center space-x-4">
            {/* Attachment input & trigger */}
            <input
              type="file"
              ref={attachmentInputRef}
              onChange={handleAttachmentUpload}
              multiple
              accept="*/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              className="flex items-center space-x-0.5 p-1 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
              title="Attach documents or images"
            >
              <Paperclip className="w-4 h-4 text-gray-600" />
              {attachments.length > 0 && (
                <span className="text-[11px] font-semibold text-[#009A49] ml-0.5">
                  {attachments.length}
                </span>
              )}
            </button>

            {/* Clock icon (Send Later toggle) */}
            <button
              type="button"
              onClick={() => setShowSendLater(!showSendLater)}
              className={`relative p-1.5 rounded-lg transition-colors cursor-pointer ${
                form.isScheduled || showSendLater
                  ? 'text-[#009A49] bg-emerald-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
              title="Send Later"
            >
              <Clock className="w-4 h-4" />
              {form.isScheduled && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[#009A49] rounded-full ring-2 ring-white" />
              )}
            </button>

            {/* Send / Send Later Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="rounded-full border border-[#009A49] text-[#009A49] hover:bg-[#E6F4EA] active:scale-[0.98] transition-all px-6 py-1.5 text-xs font-semibold tracking-wide disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting
                ? 'Processing...'
                : form.isScheduled
                ? 'Send Later'
                : 'Send'}
            </button>
          </div>
        </div>

        {/* Add & Verify Sender Modal */}
        {showAddSenderModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-gray-900/50 backdrop-blur-xs p-4">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 text-[#009A49] flex items-center justify-center">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">Add & Verify Sender Email</h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSenderModal(false);
                    setVerifyStep('input');
                    setNewSenderEmail('');
                    setNewSenderName('');
                    setEnteredCode('');
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {verifyStep === 'input' ? (
                <div className="space-y-4 py-4 text-xs">
                  <p className="text-gray-500">
                    Add another email address to send campaigns from. We will send a verification code to confirm ownership.
                  </p>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">
                      Email Address:
                    </label>
                    <input
                      type="email"
                      value={newSenderEmail}
                      onChange={(e) => setNewSenderEmail(e.target.value)}
                      placeholder="e.g. outreach@yourcompany.com"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-[#009A49]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">
                      Sender Name (Optional):
                    </label>
                    <input
                      type="text"
                      value={newSenderName}
                      onChange={(e) => setNewSenderName(e.target.value)}
                      placeholder="e.g. Marketing Team"
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-gray-900 focus:outline-none focus:border-[#009A49]"
                    />
                  </div>
                  <div className="flex items-center justify-end space-x-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddSenderModal(false)}
                      className="px-4 py-1.5 text-xs text-gray-600 hover:text-gray-800 font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSendVerificationCode}
                      className="rounded-full bg-[#009A49] text-white hover:bg-[#00823e] px-5 py-2 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      Send Verification Code
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 py-4 text-xs">
                  <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-emerald-900">
                    <p className="font-semibold mb-1">Verification code sent!</p>
                    <p className="text-[11px] text-emerald-800">
                      A 6-digit verification code was sent for <strong>{newSenderEmail}</strong>.
                    </p>
                    <p className="text-[11px] text-emerald-700 mt-1">
                      (Test verification code: <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-emerald-300">{testVerificationCode}</span>)
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-gray-700 mb-1">
                      Enter 6-Digit Code:
                    </label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        maxLength={6}
                        value={enteredCode}
                        onChange={(e) => setEnteredCode(e.target.value.trim())}
                        placeholder="123456"
                        className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2 text-center text-sm font-mono tracking-widest text-gray-900 focus:outline-none focus:border-[#009A49]"
                      />
                      <button
                        type="button"
                        onClick={() => setEnteredCode(testVerificationCode)}
                        className="text-[11px] text-[#009A49] hover:underline font-medium px-2 py-1 cursor-pointer"
                      >
                        Auto-fill
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setVerifyStep('input')}
                      className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmVerification}
                      disabled={isVerifying}
                      className="rounded-full bg-[#009A49] text-white hover:bg-[#00823e] px-5 py-2 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isVerifying ? 'Verifying...' : 'Verify & Add Email'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Send Later Popover Floating Card */}
        {showSendLater && (
          <div className="absolute top-14 right-6 z-30 w-72 bg-white rounded-2xl border border-gray-100 shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-xs font-semibold text-gray-800 mb-3">Send Later</h3>

            {/* Pick date & time picker */}
            <div className="relative mb-3">
              <div
                onClick={() => dateInputRef.current?.showPicker?.() || dateInputRef.current?.focus()}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between text-xs text-gray-600 bg-white hover:border-gray-300 cursor-pointer"
              >
                <span>
                  {selectedPresetLabel
                    ? selectedPresetLabel
                    : tempStartTime
                    ? format(new Date(tempStartTime), 'MMM d, yyyy h:mm a')
                    : 'Pick date & time'}
                </span>
                <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
              </div>
              <input
                ref={dateInputRef}
                type="datetime-local"
                value={tempStartTime}
                onChange={(e) => {
                  setTempStartTime(e.target.value);
                  setSelectedPresetLabel(null);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </div>

            {/* Presets list */}
            <div className="space-y-1 mb-4">
              {presets.map((p) => {
                const isSelected = selectedPresetLabel === p.label;
                return (
                  <div
                    key={p.label}
                    onClick={() => handlePresetSelect(p)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-50 text-[#009A49] font-medium'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <span>{p.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#009A49]" />}
                  </div>
                );
              })}
            </div>

            {/* Popover Actions */}
            <div className="flex items-center justify-end space-x-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={handleCancelSendLater}
                className="text-xs font-medium text-gray-500 hover:text-gray-800 px-2 py-1 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplySendLater}
                className="rounded-full border border-[#009A49] text-[#009A49] hover:bg-[#E6F4EA] px-5 py-1 text-xs font-semibold transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Hidden lead upload input */}
        <input
          type="file"
          ref={leadFileInputRef}
          onChange={handleLeadFileUpload}
          accept=".csv,.txt"
          className="hidden"
        />

        {/* Form Body */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col text-xs space-y-2">
          
          {/* From Row */}
          <div className="flex items-center py-2 border-b border-gray-100">
            <span className="text-gray-500 font-normal w-20 text-xs flex-shrink-0">From</span>
            <div className="flex-1 flex items-center space-x-3">
              <div className="relative inline-flex items-center">
                <div className="bg-[#F4F4F5] hover:bg-gray-200/70 transition-colors rounded-xl px-3.5 py-1.5 flex items-center space-x-2">
                  <select
                    value={form.selectedSender || defaultAccountEmail}
                    onChange={(e) => {
                      if (e.target.value === '__ADD_NEW__') {
                        setShowAddSenderModal(true);
                      } else {
                        set('selectedSender', e.target.value);
                      }
                    }}
                    className="appearance-none bg-transparent text-xs font-medium text-gray-800 focus:outline-none cursor-pointer pr-5"
                  >
                    {availableSenders.map((s) => (
                      <option key={s.id} value={s.email} className="text-gray-900 bg-white">
                        {s.email} {s.email === defaultAccountEmail ? '(Default Account)' : ''}
                      </option>
                    ))}
                    <option value="__ADD_NEW__" className="text-[#009A49] font-medium bg-white">
                      + Add & verify new email...
                    </option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-3 pointer-events-none" />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddSenderModal(true)}
                className="inline-flex items-center space-x-1 text-xs text-[#009A49] hover:underline font-medium cursor-pointer"
                title="Add and verify a new sender email"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add & Verify Email</span>
              </button>
            </div>
          </div>

          {/* To Row */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100 min-h-[44px]">
            <span className="text-gray-500 font-normal w-20 text-xs flex-shrink-0">To</span>
            <div className="flex-1 flex flex-wrap items-center gap-1.5 pr-3">
              {form.recipients.slice(0, 3).map((email, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center space-x-1 px-3 py-1 rounded-full border border-[#009A49] bg-[#E6F4EA] text-gray-800 text-xs font-medium"
                >
                  <span>{email}</span>
                  <button
                    type="button"
                    onClick={() => removeRecipient(idx)}
                    className="hover:text-rose-600 text-gray-400 ml-1 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}

              {form.recipients.length > 3 && (
                <span className="px-2.5 py-1 rounded-full border border-[#009A49] text-[#009A49] font-medium text-xs">
                  +{form.recipients.length - 3}
                </span>
              )}

              <input
                type="text"
                value={form.manualInput}
                onChange={(e) => set('manualInput', e.target.value)}
                onKeyDown={handleManualKeyDown}
                placeholder={form.recipients.length === 0 ? 'recipient@example.com' : 'Add another...'}
                className="flex-1 min-w-[180px] bg-transparent focus:outline-none text-xs text-gray-800 placeholder-gray-400 py-1"
              />
            </div>

            {/* Upload List button */}
            <button
              type="button"
              onClick={() => leadFileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center space-x-1.5 text-xs font-medium text-[#009A49] hover:opacity-80 transition-opacity flex-shrink-0 cursor-pointer ml-2 disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5 text-[#009A49]" />
              <span>{isUploading ? 'Parsing...' : 'Upload List'}</span>
            </button>
          </div>

          {/* Subject Row */}
          <div className="flex items-center py-2 border-b border-gray-100">
            <span className="text-gray-500 font-normal w-20 text-xs flex-shrink-0">Subject</span>
            <input
              type="text"
              value={form.subject}
              onChange={(e) => set('subject', e.target.value)}
              placeholder="Subject"
              className="flex-1 bg-transparent focus:outline-none text-xs text-gray-800 placeholder-gray-400"
            />
          </div>

          {/* Delay between 2 emails & Hourly Limit Row */}
          <div className="flex items-center space-x-6 py-2.5 text-xs text-gray-600">
            <div className="flex items-center space-x-2.5">
              <span>Delay between 2 emails (sec)</span>
              <input
                type="number"
                min={0}
                value={form.delayBetweenSeconds}
                onChange={(e) => set('delayBetweenSeconds', Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-16 h-8 text-center rounded-xl border border-gray-200/90 text-xs font-medium text-gray-800 focus:outline-none focus:border-[#009A49] bg-white"
              />
            </div>

            <div className="flex items-center space-x-2.5">
              <span>Hourly Limit</span>
              <input
                type="number"
                min={1}
                value={form.hourlyLimit || ''}
                onChange={(e) => set('hourlyLimit', Math.max(1, parseInt(e.target.value, 10) || 1))}
                placeholder="00"
                className="w-16 h-8 text-center rounded-xl border border-gray-200/90 text-xs font-medium text-gray-800 focus:outline-none focus:border-[#009A49] bg-white"
              />
            </div>
          </div>

          {/* Editor Container with light gray bg & white pill toolbar */}
          <div className="flex-1 bg-[#FAFAFA] rounded-2xl p-4 flex flex-col min-h-[300px] mt-2 border border-gray-100/60">
            <div className="text-xs text-gray-400 font-normal mb-3 select-none">Type Your Reply...</div>

            {/* Floating White Pill Toolbar */}
            <div className="bg-white rounded-full shadow-2xs border border-gray-200/70 px-4 py-2 flex items-center space-x-3 w-fit select-none mb-3 text-gray-500">
              <button
                type="button"
                onClick={() => insertFormatting('', '')}
                className="hover:text-gray-900 transition-colors cursor-pointer"
                title="Undo"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('', '')}
                className="hover:text-gray-900 transition-colors cursor-pointer"
                title="Redo"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              <span className="text-gray-200 select-none">|</span>

              {/* Typography */}
              <div className="flex items-center space-x-0.5 hover:text-gray-900 cursor-pointer">
                <span className="text-[11px] font-semibold">T<sub className="text-[9px]">T</sub></span>
                <ChevronsUpDown className="w-3 h-3 text-gray-400" />
              </div>

              <button
                type="button"
                onClick={() => insertFormatting('**', '**')}
                className="hover:text-gray-900 font-bold text-xs transition-colors cursor-pointer"
                title="Bold"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('*', '*')}
                className="hover:text-gray-900 italic text-xs transition-colors cursor-pointer"
                title="Italic"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('<u>', '</u>')}
                className="hover:text-gray-900 underline text-xs transition-colors cursor-pointer"
                title="Underline"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>

              <span className="text-gray-200 select-none">|</span>

              {/* Alignment */}
              <div className="flex items-center space-x-0.5 hover:text-gray-900 cursor-pointer">
                <AlignLeft className="w-3.5 h-3.5" />
                <ChevronsUpDown className="w-3 h-3 text-gray-400" />
              </div>

              <span className="text-gray-200 select-none">|</span>

              {/* Lists */}
              <button
                type="button"
                onClick={() => insertFormatting('1. ')}
                className="hover:text-gray-900 transition-colors cursor-pointer"
                title="Numbered List"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('• ')}
                className="hover:text-gray-900 transition-colors cursor-pointer"
                title="Bullet List"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('')}
                className="hover:text-gray-900 transition-colors cursor-pointer"
                title="Decrease Indent"
              >
                <Outdent className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('  ')}
                className="hover:text-gray-900 transition-colors cursor-pointer"
                title="Increase Indent"
              >
                <Indent className="w-3.5 h-3.5" />
              </button>

              <span className="text-gray-200 select-none">|</span>

              {/* Quote, Format, Strike */}
              <button
                type="button"
                onClick={() => insertFormatting('> ')}
                className="hover:text-gray-900 transition-colors cursor-pointer"
                title="Quote"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('')}
                className="hover:text-gray-900 transition-colors cursor-pointer"
                title="Clear Formatting"
              >
                <Baseline className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => insertFormatting('~~', '~~')}
                className="hover:text-gray-900 transition-colors cursor-pointer"
                title="Strikethrough"
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              className="flex-1 w-full bg-transparent focus:outline-none text-xs text-gray-800 resize-none leading-relaxed"
            />

            {/* Attached items preview (images & documents) */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5 mt-3 pt-3 border-t border-gray-200/60">
                {attachments.map((att) =>
                  att.isImage && att.previewUrl ? (
                    <div key={att.id} className="relative group w-fit">
                      <img
                        src={att.previewUrl}
                        alt={att.name}
                        className="w-28 h-20 object-cover rounded-xl border border-gray-200/90 shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        className="absolute -top-1.5 -right-1.5 bg-gray-900 text-white rounded-full p-0.5 hover:bg-rose-600 transition-colors cursor-pointer shadow-xs"
                        title="Remove attachment"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div
                      key={att.id}
                      className="inline-flex items-center space-x-2 px-3 py-2 bg-white rounded-xl border border-gray-200/90 shadow-2xs text-xs text-gray-700 hover:border-gray-300 transition-all"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 text-[#009A49] flex items-center justify-center flex-shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col text-left pr-1">
                        <span className="font-medium text-gray-800 truncate max-w-[170px]">{att.name}</span>
                        <span className="text-[10px] text-gray-400">{att.size}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(att.id)}
                        className="p-1 hover:text-rose-600 text-gray-400 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                        title="Remove attachment"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
