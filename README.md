# Little Reminders ✦

A gamified, anonymous affirmation app. Every reminder is written twice: **in tech language** (a programming metaphor) and **in human language** (the same message in plain words). Collect XP, level up, save favourites and share quotes with the community, all without creating an account.

**Live demo:** _add your URL here_ · **Stack:** HTML, CSS, vanilla JavaScript, Supabase (Auth, Postgres, RLS)

<!-- Add a screenshot or GIF: ![Little Reminders](docs/screenshot.png) -->

## Features

- 16 dual-language reminders in three categories (self growth, work and focus, rest and balance), with a category filter that `Give me another` respects
- **Gamification:** +10 XP for each new reminder and +10 XP the first time you save one. XP fills a level bar (Seedling → Sprout → Bloom → Glow → Radiant → Luminary). XP is capped at 100 per day.
- Anonymous progress: Supabase Anonymous Sign-Ins give each browser a private profile and saved list
- Community quotes: anonymous, length-limited, moderated before they appear
- Works offline: falls back to `LOCAL MODE` using `localStorage` when Supabase isn't configured
- Keyboard shortcut (`R`), Escape closes any dialog

## Quick start

1. Create a project at [supabase.com](https://supabase.com) and enable **Authentication → Providers → Anonymous Sign-Ins**.
2. In the **SQL Editor**, run all of `schema.sql`.
3. Put your Project URL and `anon` key in `supabase-config.js`.
4. Open `index.html` (or serve the folder with any static host). No build step.

To show community quotes straight away during a demo, run `update public.public_quotes set approved = true;` or approve rows in the Table Editor.

## Deploy

Static hosting only: GitHub Pages, Netlify, Vercel or Cloudflare Pages. The `anon` key is designed to be public; security comes from Row Level Security and server-side functions (see [SECURITY.md](SECURITY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). Never place a `service_role` key in the browser.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and dialogs |
| `styles.css` | Responsive design and animations |
| `reminders.js` | Reminder library |
| `script.js` | App logic: state, XP, filters, saved list, quotes, Supabase |
| `supabase-config.js` | Public Supabase URL and anon key |
| `schema.sql` | Tables, RLS policies, `record_event()` function |

## What I learned / trade-offs

- **Anonymous auth** removes sign-up friction, but progress lives in one browser until an account is linked (planned).
- **Never trust the client:** XP originally came from the browser, so anyone could send `xp = 999999`. It is now awarded only by a `security definer` Postgres function, and direct writes to `profiles` are revoked.
- **Open submissions need moderation:** public quotes are hidden until approved.
- A static site can't hide keys, so the design assumes the key is public and puts the protection in the database.

## Roadmap

Link anonymous users to email/Google, PWA with daily notification, reminders in a Supabase table, tests and CI, focus trapping in dialogs.