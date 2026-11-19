# Web dashboard

A static Next.js 14 site (App Router, TypeScript, Tailwind, Recharts) with `output: 'export'`.
It has no backend and no raw data: every number comes from `public/data/*.json`, which
`src/export_web_json.py` writes as the **last** step of the Python pipeline (about 93 KB in total). The site
therefore always matches `RESULTS.md`.

## Before deploying

Edit `src/lib/config.ts`: set `authorName` and `githubRepo` (the "View SQL on GitHub" header link is derived from it).

## Build locally

```bash
cd web
npm install
npm run build        # must finish with zero type or lint errors; writes the static site to ./out
npx serve out        # preview at http://localhost:3000
```

`npm run dev` gives hot reload during development.

## Deploy on Vercel

**Dashboard (recommended)**
1. Push the repository to GitHub (the `web/public/data/*.json` files must be committed).
2. Go to vercel.com → **Add New… → Project** → **Import** your Git repository.
3. Set **Root Directory = `web`**. Framework Preset: **Next.js** (auto-detected). Leave the build and output
   settings at their defaults.
4. Click **Deploy**. Copy the production URL into the main `README.md` ("Live dashboard").

**CLI alternative**
```bash
cd web && npx vercel --prod
```

## Refreshing the numbers

Re-run the pipeline from the repository root (`make all` or `python src/run_pipeline.py`), commit the updated
`web/public/data/*.json`, and push. Vercel rebuilds automatically.
