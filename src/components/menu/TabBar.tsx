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
    <div className="w-full mb-6 mt-2">
      <div className="relative flex w-full bg-primary/5 py-1 rounded-full backdrop-blur-md border border-primary/10">

        {/* Sliding indicator — position driven by activeTab index */}
        <motion.div
          className="absolute top-1 bottom-1 left-0 w-1/4 z-0 px-1 pointer-events-none"
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
                "relative z-10 flex min-h-11 flex-1 items-center justify-center gap-1 py-2.5 text-xs font-bold transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:text-sm",
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
