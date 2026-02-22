# GitHub Publish Checklist

This checklist prepares the repo for a clean public push.
No account linking is required here.

## Pre-push quality
1. `npm install`
2. `npm run validate`
3. `npm run test`
4. `npm run smoke`

## Docs to confirm
1. `README.md`
2. `AGENTS.md`
3. `CONTRIBUTING.md`
4. `SECURITY.md`
5. `docs/START_HERE.md`

## Repo hygiene
1. Ensure `.gitignore` includes `node_modules` and `dist`.
2. Ensure no secrets or personal tokens exist in files.
3. Ensure generated assets are intentional.

## Personal-account push (manual)
1. Create an empty repo in your personal GitHub account.
2. In local terminal:
   - `git init` (if needed)
   - `git add .`
   - `git commit -m "Playloom alpha 1.0"`
   - `git branch -M main`
   - `git remote add origin <your-personal-repo-url>`
   - `git push -u origin main`

## Optional after first push
1. Add repo topics and description.
2. Add release notes tag `alpha-1.0`.
