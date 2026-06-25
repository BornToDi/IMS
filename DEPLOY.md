# Deploy Guide

This project has two deploy targets:

- `apps/api`: Express + Prisma API
- `apps/web`: Next.js frontend

## 1. Backend on Render

Create a new Render Blueprint from this repo. The root `render.yaml` config creates:

- Web service: `freecloud-bank-api`
- SQLite persistent disk mounted at `/var/data`
- Health check: `/api/health`

After the first backend deploy, copy the backend URL, for example:

```text
https://freecloud-bank-api.onrender.com
```

## 2. Frontend on Vercel

Import the same GitHub repo in Vercel.

Use these settings:

```text
Root Directory: apps/web
Build Command: npm run build
```

Set this environment variable:

```env
NEXT_PUBLIC_API_URL=https://your-render-backend-url
```

Deploy the frontend and copy the frontend URL, for example:

```text
https://your-app.vercel.app
```

## 3. Update Backend CORS

In Render, set these environment variables to the Vercel frontend URL:

```env
CLIENT_URL=https://your-app.vercel.app
CLIENT_URLS=https://your-app.vercel.app
```

Redeploy the Render backend after changing those values.

## 4. Verify

Open:

```text
https://your-render-backend-url/api/health
```

Then open the Vercel URL and test register/login.

## Notes

The current production config uses SQLite on a persistent Render disk. For heavier production usage, PostgreSQL is recommended.
