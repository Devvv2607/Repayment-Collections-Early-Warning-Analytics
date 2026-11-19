// Site identity. Edit these three values before deploying.
export const SITE = {
  authorName: "Your Name",
  githubRepo: "https://github.com/your-username/repayment-collections-early-warning",
  get sqlFolder() {
    return `${this.githubRepo}/tree/main/sql`;
  },
};

// Risk-severity scale: used ONLY for DPD buckets.
export const BUCKET_COLORS: Record<string, string> = {
  "0": "#0ca30c",
  "1-30": "#fab219",
  "31-60": "#ec835a",
  "61-90": "#d03b3b",
  "90+": "#8f1f1f",
};

export const ACCENT = "#2a78d6";
export const ACCENT_DARK = "#0d366b";
export const NEUTRAL = "#b4b2a9";
export const INK = "#0b0b0b";
export const INK2 = "#52514e";
export const GRID = "#e4e3dd";
