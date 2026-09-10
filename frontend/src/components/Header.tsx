import React from 'react';
import { Search, RotateCw } from 'lucide-react';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  activeTabTitle: string;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onRefresh,
  isRefreshing,
  activeTabTitle,
}) => {
  return (
    <header className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between sticky top-0 z-10">
      {/* Title & Status */}
      <div className="flex items-center space-x-3">
        <h1 className="text-base font-semibold text-gray-900 capitalize tracking-tight">
          {activeTabTitle}
        </h1>
      </div>

      {/* Center Search Input (Figma design with magnifying glass) */}
      <div className="flex-1 max-w-md mx-6">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search emails by subject, recipient, body..."
            className="w-full pl-10 pr-4 py-2 bg-gray-50/80 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-all"
          />
        </div>
      </div>

      {/* Right Actions: Refresh */}
      <div className="flex items-center space-x-2">
        <button
          title="Refresh List"
          onClick={onRefresh}
          className={`p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors ${
            isRefreshing ? 'animate-spin text-brand-600' : ''
          }`}
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
