"use client";

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/src/utils/cn';

export type TabId = 'latte' | 'fusion' | 'extras' | 'seasonal';

interface Tab {
  id: TabId;
  label: string;
}

interface TabBarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
}

export const tabs: Tab[] = [
  { id: 'latte', label: 'Latte' },
  { id: 'fusion', label: 'Fusion' },
  { id: 'extras', label: 'Add-on' },
  { id: 'seasonal', label: 'Seasonal' },
];

/** Sticky menu tab bar. Indicator position is driven by activeTab index via spring animation. */
const TabBar: React.FC<TabBarProps> = ({ activeTab, setActiveTab }) => {
  const tabIndex = tabs.findIndex(t => t.id === activeTab);

  return (
    <div className="mb-4 mt-1 w-full">
      <div className="relative flex w-full rounded-full border border-primary/10 bg-primary/5 py-0.5 backdrop-blur-md">

        {/* Sliding indicator — position driven by activeTab index */}
        <motion.div
          className="pointer-events-none absolute bottom-0.5 left-0 top-0.5 z-0 w-1/4 px-0.5"
          animate={{ x: `${tabIndex * 100}%` }}
          transition={{ type: 'spring', stiffness: 350, damping: 32 }}
        >
          <div className="w-full h-full rounded-full shadow-md bg-[#2d4a22]" />
        </motion.div>

        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative z-10 flex min-h-9 flex-1 items-center justify-center gap-1 py-1.5 text-xs font-bold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:text-sm",
                isActive ? "text-white" : "text-primary/40 hover:text-primary/60"
              )}
            >
              {tab.label}
              {tab.id === 'seasonal' && <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TabBar;
