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

const primaryTabs: Tab[] = [
  { id: 'latte', label: 'Latte' },
  { id: 'fusion', label: 'Fusion' },
  { id: 'extras', label: 'Add-on' },
];
const seasonalTab: Tab = { id: 'seasonal', label: 'Seasonal' };

export const tabs: Tab[] = [...primaryTabs, seasonalTab];

/** Render grouped core menu tabs with a separate Seasonal control. */
const TabBar: React.FC<TabBarProps> = ({ activeTab, setActiveTab }) => {
  const primaryTabIndex = primaryTabs.findIndex((tab) => tab.id === activeTab);
  const hasActivePrimaryTab = primaryTabIndex >= 0;

  return (
    <div className="mb-4 mt-1 w-full">
      <div className="flex w-full items-stretch gap-2">
        <div
          role="group"
          aria-label="Danh mục chính"
          className="relative flex min-w-0 flex-[3] rounded-xl border border-primary/10 bg-primary/5 p-1 backdrop-blur-md"
        >
          <motion.div
            className="pointer-events-none absolute bottom-1 left-1 top-1 z-0 rounded-lg bg-primary shadow-sm"
            style={{ width: "calc((100% - 0.5rem) / 3)" }}
            animate={{
              opacity: hasActivePrimaryTab ? 1 : 0,
              x: `${Math.max(primaryTabIndex, 0) * 100}%`,
            }}
            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
          />

          {primaryTabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <motion.button
                type="button"
                key={tab.id}
                aria-pressed={isActive}
                whileTap={{ scale: 0.92 }}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative z-10 flex min-h-10 flex-1 items-center justify-center rounded-lg px-1 py-2 text-xs font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:text-sm",
                  isActive ? "text-primary-foreground" : "text-primary/55 hover:text-primary"
                )}
              >
                {tab.label}
              </motion.button>
            );
          })}
        </div>

        <motion.button
          type="button"
          aria-pressed={activeTab === seasonalTab.id}
          whileTap={{ scale: 0.92 }}
          onClick={() => setActiveTab(seasonalTab.id)}
          className={cn(
            "flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-bold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:text-sm",
            activeTab === seasonalTab.id
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-accent/40 bg-accent/10 text-primary hover:bg-accent/20"
          )}
        >
          {seasonalTab.label}
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </motion.button>
      </div>
    </div>
  );
};

export default TabBar;
