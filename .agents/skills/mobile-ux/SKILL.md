---
name: mobile-ux
description: Standardizes the mobile-first UX/UI interactions, specifically touch and swipe behaviors, using Framer Motion and Tailwind CSS.
---

# Mobile UX / UI Guidelines

Use this skill whenever the user explicitly requests to apply the `mobile-ux` skill, or asks to optimize touch/swipe interactions on mobile interfaces based on standard guidelines.

## Core Stack
- **Framer Motion**: Used for all micro-interactions, gestures (drag/swipe), and animations.
- **Tailwind CSS**: Used for responsive layouts, sticky positioning, scroll-snapping, and styling.
- *Note*: This combination is extremely powerful and fully sufficient for 95% of mobile interaction needs. Do not introduce other gesture or modal libraries (like `react-use-gesture`, `vaul`, or `framer-motion/m`) unless explicitly requested.

## 1. Micro-Interactions (The Physical Feel)
Mobile lacks `:hover` states, so users rely on visual feedback to confirm a touch.
- **Rule**: Apply a `whileTap` animation to clickable cards, buttons, or interactive option elements to simulate physical pressing.
- **Implementation**: Convert `<div>` or `<button>` to `<motion.div>` or `<motion.button>`.
- **Recommended Values**:
  - Large cards/elements: `whileTap={{ scale: 0.96 }}`
  - Small buttons/options: `whileTap={{ scale: 0.92 }}`

## 2. Swipe-to-Dismiss (Bottom Sheets)
Mobile users expect to swipe down to close bottom-sheet modals, rather than reaching for a tiny 'X' button.
- **Rule**: Bottom-sheet style modals must support drag/swipe-to-dismiss on mobile.
- **Implementation**:
  ```tsx
  <motion.div
    drag="y"
    dragConstraints={{ top: 0, bottom: 0 }}
    dragElastic={0.2}
    onDragEnd={(e, info) => {
      // Threshold to dismiss: 100px
      if (info.offset.y > 100) onClose();
    }}
  >
  ```
- **Visual Cue**: Always include a small gray "drag handle" (pill shape) at the top center of the draggable sheet to indicate that it can be swiped.

## 3. Scroll & Sticky Behaviors
- **Sticky Elements**: Important navigation bars, filters, or category tabs should use `sticky top-0 z-10` along with a solid background color to remain accessible as the user scrolls down long lists.
- **Horizontal Scroll Snap**: For horizontal lists (like tab bars or carousels), use Tailwind's scroll snapping to create a native paging feel:
  - Container: `overflow-x-auto no-scrollbar snap-x snap-mandatory`
  - Items: `snap-start`

## 4. Hit Areas & Touch Targets
- **Rule**: There is no strict minimum pixel rule (e.g., 44x44px is not forced). Remain flexible according to the specific UI design.
- **Guideline**: Ensure that the *interactive* area of a visually small element (like a slider thumb or tiny icon) is large enough to be easily tapped by wrapping it in a transparent container or using padding (e.g., `w-10 h-10 flex items-center justify-center`).

## 5. Haptic Feedback (STRICT NEGATIVE RULE)
- **NEVER** use `navigator.vibrate` or any other haptic feedback API. 
- The user has explicitly forbidden this feature. Do not suggest, implement, or leave any haptic feedback code in the project.
