# Deployment

**Tear** is a static HTML5/JS game (no build step). It's hosted on **Vercel**, connected to a
**GitHub** repository so that every push to `main` automatically triggers a new production deploy.

```
edit files  →  git add  →  git commit  →  git push  →  Vercel auto-builds & deploys
```

---

## Pushing future updates (the everyday flow)

After you change any game files, run these three commands from the project folder
(`C:\Users\realm\Desktop\game\Tear`):

```bash
git add -A
git commit -m "Describe what you changed"
git push
```

That's it. Vercel sees the push to `main` and redeploys automatically — your
`.vercel.app` link updates in ~30 seconds. You can watch the build at
https://vercel.com/dashboard.

> Tip: bump the `?v=N` query in `index.html`'s `<script>` tags when you change JS,
> so players' browsers always fetch the latest code instead of a cached copy.

---

## One-time setup (already done, for reference)

1. **Local git repo**
   ```bash
   git init -b main
   git add -A
   git commit -m "Initial commit"
   ```

2. **GitHub repository** — create an empty repo (no README/.gitignore) at
   https://github.com/new, then link and push:
   ```bash
   git remote add origin https://github.com/<your-username>/tear.git
   git push -u origin main
   ```

3. **Vercel project** — import the GitHub repo so pushes auto-deploy:
   - Go to https://vercel.com/new
   - Select the `tear` GitHub repo and click **Import**, then **Deploy**.
   - Framework Preset: **Other**. Build Command: *(leave empty)*. Output Directory: *(leave empty / `.`)*.
   - Vercel serves `index.html` from the repo root as a static site.

   (CLI alternative: `npx vercel` to deploy once, then `npx vercel git connect`
   to wire up auto-deploys, or `npx vercel --prod` for a production deploy.)

---

## Useful commands

```bash
git status                 # what's changed
git log --oneline -10      # recent commits
git push                   # publish committed changes (triggers Vercel)
npx vercel --prod          # manual production deploy (rarely needed once Git is connected)
```

## Notes

- `serve.py` is only for **local** testing (`python serve.py` → http://localhost:8123).
  Vercel does not use it; it serves the static files directly.
- `.vercel/` and `node_modules/` are git-ignored and must not be committed.
