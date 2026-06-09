"use client";

import { cn } from '@/src/utils/cn';

export type TabId = 'latte' | 'fusion' | 'seasonal';

interface Tab {
  id: TabId;
  label: string;
}

interface TabBarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

const tabs: Tab[] = [
  { id: 'latte', label: 'Latte' },
  { id: 'fusion', label: 'Fusion' },
  { id: 'seasonal', label: 'Seasonal ✨' },
];

const TabBar: React.FC<TabBarProps> = ({ activeTab, setActiveTab }) => {
  return (
    <div className="flex gap-2 overflow-x-auto pb-4 pt-2 mt-6 sticky top-0 z-10 bg-[#fdfcf7] no-scrollbar snap-x snap-mandatory">
      {tabs.map((tab) => {
        const isSeasonal = tab.id === 'seasonal';
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-6 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all duration-400 snap-start",
              isSeasonal
                ? isActive
                  ? "bg-amber-500 text-white shadow-md shadow-amber-500/20"
                  : "bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100"
                : isActive
                ? "bg-primary text-white shadow-lg"
                : "bg-[#d9e4d4] text-primary/70 hover:bg-[#c9d4c4]"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default TabBar;
