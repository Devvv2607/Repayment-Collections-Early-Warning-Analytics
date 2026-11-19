"use client";

import { useMemo, useState } from "react";

import { DIM_LABELS, amt, cleanValue, num, pct } from "@/lib/format";
import type { EarlyWarningRow } from "@/lib/types";

type Key = keyof EarlyWarningRow;

const COLS: { key: Key; label: string; fmt: (r: EarlyWarningRow) => string; align?: "right" }[] = [
  { key: "priority_rank", label: "Rank", fmt: (r) => String(r.priority_rank), align: "right" },
  { key: "segment_dim", label: "Dimension", fmt: (r) => DIM_LABELS[r.segment_dim] ?? r.segment_dim },
  { key: "segment_value", label: "Segment", fmt: (r) => cleanValue(r.segment_value) },
  { key: "repeat_roll_rate", label: "Repeat roll", fmt: (r) => pct(r.repeat_roll_rate), align: "right" },
  { key: "segment_roll_rate_all", label: "All-borrower roll", fmt: (r) => pct(r.segment_roll_rate_all), align: "right" },
  { key: "borrowers", label: "Borrowers", fmt: (r) => num(r.borrowers), align: "right" },
  { key: "active_loans", label: "Active loans", fmt: (r) => num(r.active_loans), align: "right" },
  { key: "outstanding_amt", label: "Outstanding", fmt: (r) => amt(r.outstanding_amt), align: "right" },
  { key: "expected_roll_amt", label: "Expected roll amt", fmt: (r) => amt(r.expected_roll_amt), align: "right" },
];

export default function EarlyWarningTable({ rows, limit = 15 }: { rows: EarlyWarningRow[]; limit?: number }) {
  const [sortKey, setSortKey] = useState<Key>("priority_rank");
  const [asc, setAsc] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const va = a[sortKey] ?? -Infinity;
      const vb = b[sortKey] ?? -Infinity;
      const cmp = typeof va === "string" && typeof vb === "string" ? va.localeCompare(vb) : Number(va) - Number(vb);
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortKey, asc]);

  const visible = showAll ? sorted : sorted.slice(0, limit);
  const maxExp = Math.max(...rows.map((r) => r.expected_roll_amt));

  const onSort = (k: Key) => {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(k === "priority_rank" || k === "segment_dim" || k === "segment_value");
    }
  };

  return (
    <div>
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="tnum w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-ink-muted">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sortKey === c.key ? (asc ? "ascending" : "descending") : "none"}
                  className={`py-2 pr-3 font-medium ${c.align === "right" ? "text-right" : "text-left"}`}
                >
                  <button
                    type="button"
                    onClick={() => onSort(c.key)}
                    className="inline-flex items-center gap-1 rounded hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {c.label}
                    <span aria-hidden className={sortKey === c.key ? "text-accent" : "text-line"}>
                      {sortKey === c.key && !asc ? "▼" : "▲"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={`${r.segment_dim}-${r.segment_value}`} className="border-b border-line/60 last:border-0 hover:bg-plane">
                {COLS.map((c) => (
                  <td key={c.key} className={`py-2 pr-3 ${c.align === "right" ? "text-right" : ""} ${c.key === "segment_value" ? "font-medium text-ink" : "text-ink-2"}`}>
                    {c.key === "expected_roll_amt" ? (
                      <span className="inline-flex items-center justify-end gap-2">
                        <span
                          aria-hidden
                          className="hidden h-2 rounded-sm bg-risk-serious sm:inline-block"
                          style={{ width: `${(r.expected_roll_amt / maxExp) * 56}px` }}
                        />
                        <span className="font-medium text-ink">{c.fmt(r)}</span>
                      </span>
                    ) : (
                      c.fmt(r)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-3 text-sm font-medium text-accent hover:underline">
          {showAll ? `Show top ${limit}` : `Show all ${rows.length} segments`}
        </button>
      )}
    </div>
  );
}
