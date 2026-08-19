---
name: mobile-ux
description: Standardizes mobile-first UX/UI interactions, touch behaviors, animations, and Pro Max design intelligence rules (accessibility, performance, forms, styling) for the Next.js web application.
---

# Mobile UX / UI Pro Max Guidelines

Use this skill whenever building or reviewing UI components, pages, or optimizing the user experience. This skill combines Framer Motion and Tailwind CSS with industry-standard Pro Max design principles adapted for Web.

## Core Stack
- **Framer Motion**: Used for all micro-interactions, gestures (drag/swipe), and animations.
- **Tailwind CSS**: Used for responsive layouts, sticky positioning, scroll-snapping, and styling.
- Use the project overlay primitives from `SPECIFICATION.md`: Radix for dialog semantics and Vaul for mobile sheets. Do not add another overlay library.
- *Icons*: Use `lucide-react` (SVG icons). **Never use emojis as structural icons.**

## 1. Touch & Interaction
- **Touch Target Size (CRITICAL)**: Minimum **44x44px** interactive area. If the visual icon is smaller, wrap it in a padded container (e.g., `w-11 h-11 flex items-center justify-center`).
- **Touch Spacing**: Maintain at least an 8px gap between touch targets.
- **Hover vs Tap**: Never rely on hover alone (mobile lacks hover). Always ensure click/tap works.
- **Micro-Interactions**: Apply a `whileTap` animation to clickable cards or buttons to simulate physical pressing.
  - Large cards: `whileTap={{ scale: 0.96 }}`
  - Small buttons: `whileTap={{ scale: 0.92 }}`

## 2. Animation Timing
- **Duration**: Keep micro-interactions and transitions between **150ms - 300ms**. Avoid instant transitions (0ms) or slow animations (>500ms).
- **Easing**: Use platform-native feeling curves. Avoid linear transitions.
- **Meaningful Motion**: State changes (expanded, modal open) should animate smoothly, not snap.

## 3. Swipe-to-Dismiss (Bottom Sheets)

Prefer the shared project overlay/Vaul implementation. Vaul owns drag thresholds, focus, portal
and swipe behavior; do not copy the custom Framer Motion sample below into new code.
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
- **Visual Cue**: Always include a small gray "drag handle" at the top center.

## 4. Forms & Feedback
- **Error Placement**: Show validation errors immediately **below** the related field, not just at the top of the form.
- **Visible Labels**: Every input must have a visible label (do not rely solely on placeholders).
- **Loading State**: Disable the button during async operations and show a spinner/progress indicator.
- **Toast Dismissal**: Auto-dismiss toast notifications in 3-5 seconds.
- **Inline Validation**: Validate on blur (when user finishes input) using React Hook Form + Zod.

## 5. Accessibility (CRITICAL)
- **Contrast**: Minimum 4.5:1 ratio for normal text. Use tools to verify if unsure.
- **Focus States**: Maintain visible focus rings on interactive elements for keyboard navigation (`focus-visible:ring`).
- **Alt Text / Aria-labels**: Use `aria-label` for icon-only buttons. Add descriptive `alt` text for meaningful images.
- **Semantic HTML**: Use proper `<button>` elements for actions, not generic `<div>`s.

## 6. Layout & Responsive
- **Mobile-First**: Design for mobile first, then scale up using Tailwind breakpoints (`md:`, `lg:`).
- **No Horizontal Scroll**: Ensure the main document body never scrolls horizontally (`overflow-x-hidden` on wrappers if needed).
- **Spacing Scale**: Use a consistent 4px/8px rhythm (`p-2`, `p-4`, `gap-2`, `gap-4`).
- **Sticky Elements**: Important nav bars or tabs should use `sticky top-0 z-10` with a solid background.
- **Horizontal Snap**: For carousels, use Tailwind's `snap-x snap-mandatory` on the container and `snap-start` on items.

## 7. Performance
- **Image Optimization**: Use Next.js `<Image>` component for WebP/AVIF and lazy loading.
- **Layout Shift (CLS)**: Always declare width/height or use `aspect-ratio` to prevent layout jumping when images load.
- **Lazy Loading**: Use dynamic imports (`next/dynamic`) for heavy components or below-the-fold content.

## 8. Light/Dark Mode Contrast
- **Theme Tokens**: Use project semantic Tailwind tokens, avoid hardcoded raw hex values in components.
- **State Clarity**: Ensure pressed, focused, and disabled states are clearly distinguishable in *both* light and dark modes.

## 9. Haptic Feedback (STRICT NEGATIVE RULE)
- **NEVER** use `navigator.vibrate` or any other haptic feedback API. Do not suggest or implement it.
