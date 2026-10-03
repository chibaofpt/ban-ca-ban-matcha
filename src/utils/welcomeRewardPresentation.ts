/** Convert a normalized welcome-reward anchor to a clamped CSS percentage. */
export function toWelcomeRewardAnchorPercent(anchor: number): string {
  return `${Math.min(1, Math.max(0, anchor)) * 100}%`;
}
