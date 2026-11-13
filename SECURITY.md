# Security

## What is public (and safe)

`supabase-config.js` holds the Project URL and `anon` key. They are meant for browsers and are safe **only because Row Level Security is enabled on every table**.

Never commit: a `service_role` key, database passwords, private API keys, or `.env` files with secrets.

## Controls

- **RLS on all tables.** Profiles, saved reminders and activity are readable only by their owner.
- **Server-side XP.** `INSERT/UPDATE/DELETE` on `profiles` and `reminder_activity` are revoked for client roles. XP changes only through `record_event()`, which validates input, awards fixed amounts, pays the save bonus once per reminder and caps XP at 100 per day.
- **Moderated community quotes.** Inserts must have `approved = false`; only approved rows are readable. Quotes contain no identity data and are limited to 240 characters in the browser and the database.
- **XSS protection.** Quote text is HTML-escaped before rendering; reminder text is set with `textContent`.
- **Content Security Policy** (meta tag) restricts scripts, styles, fonts and connections. On hosts that support headers, move it to an HTTP header to also add `frame-ancestors`.
- **Pinned dependency:** `supabase-js@2.39.7`.

## Known limitations

- Anonymous sign-ins can be scripted. Enable **CAPTCHA** (Turnstile or hCaptcha) for anonymous sign-ins in Supabase Auth settings before a public launch.
- The quote form has no rate limit. Add an Edge Function with rate limiting if spam appears.
- No Subresource Integrity hash on the CDN script yet. Generate one for your pinned version and add `integrity` and `crossorigin`.

## Deployment checklist

1. Run the latest `schema.sql`.
2. Confirm RLS is enabled on all four tables.
3. Confirm only the `anon` key is in `supabase-config.js`.
4. Enable CAPTCHA for anonymous sign-ins.
5. Submit `<script>alert(1)</script>` as a quote, approve it, and confirm it shows as plain text.
6. In the browser console, try `supabase.from('profiles').update({xp: 9999})`. It must fail.