---
name: production-deploy
description: >
  Standardizes production deployment audits and resolves Next.js 16 + Supabase + Prisma Vercel serverless integration bugs.
  Trigger on: "deploy", "production", "release", "merge main", "build vercel", "vercel error", "prisma cache", "check production", "ready for prod".
---

# Production Deployment Readiness Skill

> This skill outlines critical verification workflows, database synchronization rules, and known serverless/caching deployment pitfalls to audit before merging to `main` for Vercel auto-deployment.

---

## 1. Git & Deployment Workflow

The project uses a standard Git flow connected to Vercel auto-deployments. When the user asks to deploy to production, the agent MUST explicitly execute the git commands to push the code to GitHub if the Pre-Deployment Execution Checklist passes without issues.

Follow this exact terminal execution sequence:

1. **Mandatory QA/QC Review (Before Deployment)**:
   - Run `git diff` (or review uncommitted/recently committed changes) to inspect what has changed since the last stable state.
   - Act as a QA/QC engineer: Look for latent bugs, unhandled edge cases, critical logic changes, or massive UI/style/layout modifications.
   - **CRITICAL**: If you detect *any* potential risks, silent bugs, or massive UI changes, **DO NOT PROCEED with deployment**. Instead, STOP and list your findings clearly to the user. **You MUST present your QA/QC report and findings entirely in Vietnamese.** Wait for the user's explicit permission to deploy, or wait for the user to ask you to fix the issues first.
   - Only proceed to step 2 if the changes are completely safe or the user explicitly bypasses the review.

2. **Commit and Push to `dev`**:
   ```powershell
   git add .
   git commit -m "chore: prepare production deployment"
   git push origin dev
   ```

3. **Verify Pre-Deployment Checklist**: Run the steps in Section 2 below. Proceed to step 4 **ONLY** if zero errors occur.

4. **Merge `dev` into `main` and Push**:
   ```powershell
   git checkout main
   git merge dev
   git push origin main
   git checkout dev
   ```

5. **Vercel Auto-Deployment**: Pushing to `main` will automatically trigger the production build on Vercel. Notify the user that the code has been successfully merged and deployed.

---

## 2. Pre-Deployment Execution Checklist

Before requesting a merge, the agent MUST run the following steps to ensure compilation and logical safety:

1. **Strict Type-Checking**:
   ```bash
   npx tsc --noEmit
   ```
   *Must yield zero errors.*
2. **Unit & Integration Test Suite**:
   ```bash
   npm run test
   ```
   *All Vitest suites must pass.*
3. **Local Production Build Simulation**:
   ```bash
   npx prisma generate && npx next build
   ```
   *Verifies page metadata generation, dynamic routes, and dynamic rendering builds cleanly without runtime crashes.*

---

## 3. Resolved Production Fallbacks & Bug Dictionary

Ensure all code changes comply with these strict fixes for previously encountered Vercel-specific deployment crashes:

### Image Hostname Errors (`next/image`)
* **Pitfall**: Crashes with `Invalid src prop on next/image, hostname is not configured`.
* **Fix**: Any new external image hosting domain must be explicitly added to `remotePatterns` in `next.config.ts`. (The main Supabase storage hostname `*.supabase.co` is already configured).

### SSL/TLS Alert in Serverless (`Keep-Alive` Conflict)
* **Pitfall**: Backend routes using intermediate Axios calls to upload/download large media fail with `sslv3 alert bad record mac`.
* **Fix**: **Never** use intermediate Axios clients on the backend to upload files to Supabase Storage. Use the official `@supabase/supabase-js` SDK directly to perform robust, handshake-friendly uploads.

### Native Binary Sharp Crash
* **Pitfall**: Vercel Serverless AWS Lambda crashes when trying to import `sharp` synchronously for image processing.
* **Fix**: Do not import or depend on `sharp` in backend routes. Upload raw images directly to Supabase Storage and let client-side optimization or Supabase Image Transformation handle sizing.

### Outdated Prisma Client Cache
* **Pitfall**: Vercel build-caching locks old `node_modules` leading to `PrismaClientInitializationError`.
* **Fix**: 
  1. Always keep `"postinstall": "prisma generate"` in `package.json` to force recreation after dependency installation.
  2. Build command must be `"build": "prisma generate && next build"`.
  3. If version mismatches persist, redeploy on Vercel with **"Use existing Build Cache" UNCHECKED**.

### Next.js 15+ Async Dynamic Route Params
* **Pitfall**: Compilation failure: `Property 'id' is missing in type 'Promise<{ id: string }>'`.
* **Fix**: Since Next.js 15+, dynamic route `params` are Promises. Always declare as `Promise<{ id: string }>` and use `const { id } = await params`.
  ```typescript
  export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
  }
  ```

### Temp/Scratch Compilation Pollution
* **Pitfall**: Local scripts in `/scratch/...` fail the global Next.js compiler due to missing imports or manual scripts.
* **Fix**: Verify that `"scratch"` is excluded from the TypeScript compiler inside `tsconfig.json` (`"exclude": ["node_modules", "reference", "scratch"]`).

---

## 4. Potential Future Production Risks

Proactively check for these edge cases during code generation:

### Dynamic Functions at Build-Time
* Next.js attempts static generation for all pages. If a page uses `cookies()`, `headers()`, or dynamic search parameters without being marked dynamic, the build will fail.
* **Fix**: Explicitly define `export const dynamic = "force-dynamic";` on any route or page fetching active runtime cookies/session data.

### Database Connection Pool Exhaustion
* Serverless scaling can quickly exceed PostgreSQL connection limits.
* **Fix**: Always instantiate Prisma client as a global singleton (`prisma = globalThis.prisma || new PrismaClient()`). Use `DATABASE_URL="...&pgbouncer=true&connection_limit=1"` for the application server runtime, and `DIRECT_URL` for migration scripts.

### Hydration Mismatch
* Showing dates formatted via standard locale formatting (`Date.toLocaleDateString()`) creates client vs server rendering mismatches if server timezone differs from customer's browser.
* **Fix**: Render dynamic dates strictly inside `useEffect` / client-side only state, or format them into ISO strings on the server.

### Case Mismatch in Zod vs DB Enums
* User input for constants (e.g. `less_ice`) failing Zod or DB write because DB expects uppercase (`LESS_ICE`).
* **Fix**: Add `.toUpperCase()` transformations on Zod schemas before database inserts.

### Public Supabase Storage Permissions
* **Pitfall**: Images uploaded successfully return `403 Forbidden` on render.
* **Fix**: Bucket `menu-images` in Supabase dashboard must be marked as **Public** with standard `SELECT` policies enabled.
