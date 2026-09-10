import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center px-6">
    <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 mb-4 shadow-xs">
      {icon}
    </div>
    <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
    {description && (
      <p className="text-xs text-gray-500 max-w-xs leading-relaxed">{description}</p>
    )}
    {action && (
      <div className="mt-4">
        <Button variant="primary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      </div>
    )}
  </div>
);
