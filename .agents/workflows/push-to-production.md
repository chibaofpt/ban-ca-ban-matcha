# Push to Production Workflow

This workflow automates the process of validating code, committing changes to the `dev` branch, merging them into the `main` (production) branch, pushing to origin to trigger production deployment, and switching back to `dev` for continued development.

---

## Pre-flight Checks (Crucial to prevent Vercel build failures)

### Step 1: Database Synchronization
Ensure the Prisma schema is synchronized with the remote Supabase database and the local client is generated. Wait for this to complete successfully.

// turbo
```powershell
npx prisma db push; npx prisma generate
```

### Step 2: Pre-flight Build Validation
Run the Next.js production build locally. This will strictly check for TypeScript errors, ESLint warnings, and static generation issues. **If this step fails, DO NOT PROCEED.** Fix the errors first.

// turbo
```powershell
npm run build
```

---

## Git Operations

### Step 3: Stage all changes
Stage all modified, new, and deleted files.

// turbo
```powershell
git add .
```

### Step 4: Commit changes to Dev
Commit the staged changes with a descriptive message. Note: Replace `[commit_message]` with a real descriptive commit message.

// turbo
```powershell
git commit -m "deploy: automatic deployment update"
```

### Step 5: Push Dev branch
Push the latest commits on the `dev` branch to the remote repository.

// turbo
```powershell
git push origin dev
```

### Step 6: Switch to Main branch
Checkout the `main` branch to prepare for the merge.

// turbo
```powershell
git checkout main
```

### Step 7: Pull latest Main
Ensure the local `main` branch is fully up-to-date with `origin/main` to avoid conflicts.

// turbo
```powershell
git pull origin main
```

### Step 8: Merge Dev into Main
Merge the `dev` branch into the `main` branch with a merge message.

// turbo
```powershell
git merge dev -m "merge branch 'dev' into 'main'"
```

### Step 9: Push Main to Production
Push the merged commits to `origin/main`. This will trigger the Vercel production serverless deployment.

// turbo
```powershell
git push origin main
```

### Step 10: Switch back to Dev branch
Switch back to the `dev` branch to ensure the working directory remains in development mode.

// turbo
```powershell
git checkout dev
```
