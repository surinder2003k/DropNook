# DropNook

**Free file sharing. No sign-up. No clutter.**

Drop a file, get a shareable link, send it anywhere — DropNook is an anonymous, no-auth file handoff tool built with **Next.js**, **TypeScript**, **Tailwind CSS v4** and **Supabase Storage**, hosted on **Vercel**.

## Highlights

- **Zero friction** — no account, no email, no OTP. Open the page and drop.
- **50 MB per file** — documents, photos, videos, archives — quick handoffs of anything.
- **Instant share links** — every upload gets a copy-ready link the moment it lands.
- **Live progress** — the file streams straight from browser to storage with a real progress bar.
- **Private by default** — files live in a private bucket and download through 1-hour signed links; nothing is publicly listable.
- **Delete anytime** — one click removes the file *and* its record.
- **Built to scale for free** — file bytes never touch the app server, so there are no request-size limits and pages stay fast.

## How uploads work

Serverless platforms cap request bodies (~4.5 MB), so DropNook's API routes never see the bytes — they only exchange tiny JSON messages:

1. The browser requests an upload slot; the app validates the metadata (50 MB cap) and returns a **signed upload token**.
2. The browser **streams the file directly into storage** with `XMLHttpRequest` — that's where the live progress bar comes from.
3. The app confirms the object exists and records its metadata, which powers the file list and share links.

```
Browser ──(1: JSON)──► /api/upload ──► signed upload token
Browser ──(2: bytes + progress)──────────────────────────► Storage
Browser ──(3: JSON)──► /api/files  ──► verify + record ──► Database
```

Downloads mirror this: the app issues a 1-hour signed URL and redirects to it — storage does the streaming.

## Inside the app

- **Status header** — a live "storage connected" health indicator.
- **Dropzone** — drag & drop or click to browse, with inline progress, oversize rejection (>50 MB) and a copy-link success state.
- **File list** — newest first, with size and timestamp plus copy link, download and delete actions on every row.
- **Responsive UI** — mobile-friendly layout with dark mode.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Storage & database | Supabase (Storage + Postgres) |
| Hosting | Vercel |
| Quality | ESLint + a 15-check end-to-end suite |

## Privacy & limits

- **50 MB max per file**, enforced server-side.
- Fully anonymous — no accounts, no tracking, no personal data collected.
- Objects sit in **private storage** and are only reachable through short-lived signed URLs issued per request.
- Deleting a file removes both the storage object and its metadata row.

---

Built by **surinder2003k** · [github.com/surinder2003k/DropNook](https://github.com/surinder2003k/DropNook)
