# Vercel + Kakao login

Deploy the existing `codex/genre-atlas-active` branch, not the older `main`.
`vercel.json` selects Next.js and `npm run build:vercel`. Sites scripts remain
available for the preserved previous deployment; this authentication change is
intended for Vercel and must not be deployed to Sites without platform review.

Set these deployment environment variables before building:

- `NEXT_PUBLIC_SUPABASE_URL`: the Genre Atlas Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: its browser-safe publishable key.
- `LASTFM_API_KEY`: optional existing recommendation source, server only.

Never add Kakao Client Secret, Supabase secret/service-role key, or database
password to the client or repository. Kakao credentials stay in Supabase Auth.

For the verified production origin, add its exact `/auth/callback` URL to
Supabase Authentication → URL Configuration → Redirect URLs. Set Site URL to
that production origin when switching traffic. Preserve the old URL until the
new login is tested. Do not allow arbitrary Vercel preview domains.
Kakao's Redirect URI stays `https://<project-ref>.supabase.co/auth/v1/callback`.

Kakao must be enabled with profile nickname/image consent and Supabase's
"Allow users without an email" option if no email permission is available.
The hosted provider still adds `account_email` when using the SDK `scopes`
option. Use `queryParams.scope = "profile_nickname profile_image"` instead.
Verified against the production authorize endpoint on 2026-10-07: its 302
redirect requests only those two scopes. Recheck this on Auth upgrades; if
scope overrides stop being supported, do not silently request email access.

The browser uses PKCE, and the callback exchanges a single-use code. Likes are
authorized by a fresh Supabase `getUser(token)` check on the server. Forwarded
ChatGPT identity headers and client-supplied IDs are not trusted on Vercel.
Likes and learning records remain account-separated **browser-local** storage;
this change does not implement cross-device favorites or playlist persistence.

Validation: `node scripts/test-kakao-auth.cjs`, `npm run build:vercel`.
Manually check Kakao consent → return → reload stays signed in → logout → likes
require sign-in again. Test with a second account before enabling shared storage.
