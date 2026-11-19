import { SITE } from "@/lib/config";

export default function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Built by <span className="font-medium text-ink">{SITE.authorName}</span>
        </p>
        <p>Data: Home Credit Default Risk (Kaggle)</p>
        <a href={SITE.githubRepo} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          GitHub repository
        </a>
      </div>
    </footer>
  );
}
