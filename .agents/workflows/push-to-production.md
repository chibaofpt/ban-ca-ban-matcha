# Push to Production Workflow

This workflow automates the process of committing changes to the `dev` branch, merging them into the `main` (production) branch, pushing to origin to trigger production deployment, and switching back to `dev` for continued development.

---

## Steps

### Step 1: Stage all changes
Stage all modified, new, and deleted files.

// turbo
```powershell
git add .
```

### Step 2: Commit changes to Dev
Commit the staged changes with a descriptive message. Note: Replace `[commit_message]` with a real descriptive commit message.

// turbo
```powershell
git commit -m "deploy: automatic deployment update"
```

### Step 3: Push Dev branch
Push the latest commits on the `dev` branch to the remote repository.

// turbo
```powershell
git push origin dev
```

### Step 4: Switch to Main branch
Checkout the `main` branch to prepare for the merge.

// turbo
```powershell
git checkout main
```

### Step 5: Pull latest Main
Ensure the local `main` branch is fully up-to-date with `origin/main` to avoid conflicts.

// turbo
```powershell
git pull origin main
```

### Step 6: Merge Dev into Main
Merge the `dev` branch into the `main` branch with a merge message.

// turbo
```powershell
git merge dev -m "merge branch 'dev' into 'main'"
```

### Step 7: Push Main to Production
Push the merged commits to `origin/main`. This will trigger the Vercel production serverless deployment.

// turbo
```powershell
git push origin main
```

### Step 8: Switch back to Dev branch
Switch back to the `dev` branch to ensure the working directory remains in development mode.

// turbo
```powershell
git checkout dev
```
