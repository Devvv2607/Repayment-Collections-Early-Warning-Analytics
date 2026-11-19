"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SITE } from "@/lib/config";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/roll-rates/", label: "Roll Rates" },
  { href: "/early-warning/", label: "Early Warning" },
  { href: "/methodology/", label: "Methodology" },
];

export default function Header() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.replace(/\/?$/, "/").startsWith(href);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 pt-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-ink sm:text-base">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-accent" />
          Collections Early-Warning
        </Link>
        <a
          href={SITE.sqlFolder}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:border-accent hover:text-accent sm:text-sm"
        >
          View SQL on GitHub
        </a>
      </div>
      <nav className="mx-auto max-w-6xl overflow-x-auto px-2 sm:px-4" aria-label="Main">
        <ul className="flex gap-1 whitespace-nowrap">
          {NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive(item.href) ? "page" : undefined}
                className={`inline-block border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(item.href)
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-2 hover:text-ink"
                }`}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
