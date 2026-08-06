This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

Deployed as the Vercel project **saathi-landing** (saathi-landing.vercel.app). It holds two
surfaces: the marketing page at `/`, and the guardian desk at `/guardian`.

## Guardian desk (`/guardian`)

The NRI guardian's web command center: pending booking approvals, recent bookings, and the
linked-parent overview. It talks to the **main** Saathi API (the `saathi` Vercel project), so
every call is cross-origin — `server/_lib/auth.js` answers `Access-Control-Allow-Origin: *`
with `Authorization` allowed and no origin allow-list, which is what makes that work.

Everything under `/guardian` is client-rendered: the API token lives in `sessionStorage`
(deliberately, not `localStorage` — see `app/guardian/_lib/session.ts`), so no server render
can know who is asking.

### Environment

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SAATHI_API_BASE` | Recommended | `https://saathi.vercel.app/api` | API root of the main app, **including** the `/api` suffix. No trailing slash needed. |

Set it in the saathi-landing Vercel project (all environments). `NEXT_PUBLIC_*` values are
inlined at build time, so changing it needs a redeploy of the landing project, not just an env
edit. For local work against a dev API:

```bash
# landing/.env.local  (git-ignored)
NEXT_PUBLIC_SAATHI_API_BASE=http://127.0.0.1:8788/api
```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
