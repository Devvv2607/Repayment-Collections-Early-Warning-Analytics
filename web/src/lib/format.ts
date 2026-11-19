export const pct = (x: number | null | undefined, digits = 2): string =>
  x === null || x === undefined ? "n/a" : `${(x * 100).toFixed(digits)}%`;

export const num = (x: number | null | undefined): string =>
  x === null || x === undefined ? "n/a" : Math.round(x).toLocaleString("en-US");

/** Compact amount. The dataset does not state its currency, so no symbol is shown. */
export const amt = (x: number | null | undefined): string => {
  if (x === null || x === undefined) return "n/a";
  const a = Math.abs(x);
  if (a >= 1e9) return `${(x / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(x / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(x / 1e3).toFixed(0)}K`;
  return x.toFixed(0);
};

export const ratio = (x: number, digits = 2): string => `${x.toFixed(digits)}×`;

export const pval = (p: number): string => (p === 0 ? "< 1e-300" : p.toExponential(1));

export const DIM_LABELS: Record<string, string> = {
  contract_type: "Contract type",
  product_type: "Product type",
  channel: "Channel",
  income_type: "Income type",
  age_band: "Age band",
  region_rating: "Region rating",
  loan_size_band: "Loan size",
};

/** Segment values carry a sort prefix ("1: <50k"); strip it for display. */
export const cleanValue = (v: string): string =>
  v === "XNA" ? "Not specified (XNA)" : v.replace(/^\d: /, "");
