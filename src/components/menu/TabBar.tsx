"use client";

import { motion } from 'framer-motion';
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

export const tabs: Tab[] = [
  { id: 'latte', label: 'Latte' },
  { id: 'fusion', label: 'Fusion' },
  { id: 'seasonal', label: 'Seasonal ✨' },
];

/** Sticky 3-tab bar. Indicator position is driven by activeTab index via spring animation. */
const TabBar: React.FC<TabBarProps> = ({ activeTab, setActiveTab }) => {
  const tabIndex = tabs.findIndex(t => t.id === activeTab);

  return (
    <div className="sticky top-2 z-20 w-full mb-6 mt-2">
      <div className="relative flex w-full bg-primary/5 py-1 rounded-full backdrop-blur-md border border-primary/10">

        {/* Sliding indicator — position driven by activeTab index */}
        <motion.div
          className="absolute top-1 bottom-1 left-0 w-1/3 z-0 px-1 pointer-events-none"
          animate={{ x: `${tabIndex * 100}%` }}
          transition={{ type: 'spring', stiffness: 350, damping: 32 }}
        >
          <div className="w-full h-full rounded-full shadow-md bg-[#2d4a22]" />
        </motion.div>

        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex-1 py-2.5 text-xs sm:text-sm font-bold z-10 transition-colors duration-300",
                isActive ? "text-white" : "text-primary/40 hover:text-primary/60"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TabBar;
