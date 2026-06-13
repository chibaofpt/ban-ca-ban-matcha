"use client";

import { motion, MotionValue, useTransform, useMotionValue } from 'framer-motion';
import { cn } from '@/src/utils/cn';

export type TabId = 'latte' | 'fusion' | 'seasonal';

interface Tab {
  id: TabId;
  label: string;
}

interface TabBarProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  carouselX?: MotionValue<number>;
}

export const tabs: Tab[] = [
  { id: 'latte', label: 'Latte' },
  { id: 'fusion', label: 'Fusion' },
  { id: 'seasonal', label: 'Seasonal ✨' },
];

const TabBar: React.FC<TabBarProps> = ({ activeTab, setActiveTab, carouselX }) => {
  const defaultX = useMotionValue(0);
  const xVal = carouselX || defaultX;
  
  // Indicator moves opposite to carousel, at 1/3 the speed
  const indicatorX = useTransform(xVal, (x) => -x / 3);

  return (
    <div className="sticky top-2 z-20 w-full mb-6 mt-2">
      <div className="relative flex w-full bg-primary/5 py-1 rounded-full backdrop-blur-md border border-primary/10">
        
        {/* High-Performance Sliding Indicator */}
        <motion.div
          style={{ x: indicatorX }}
          className="absolute top-1 bottom-1 left-0 w-1/3 z-0 px-1"
        >
          <div className="w-full h-full rounded-full shadow-md transition-colors duration-300 bg-[#2d4a22]" />
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
