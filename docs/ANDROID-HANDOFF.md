# TrackField web and Android developer handoff

This repository contains the running Next.js website and Express/Prisma API. Keep the same VM and database for web and mobile. Do not copy the SQLite database into an APK.

## Addresses and implementation choice

Public read-only checks on 2026-11-16 returned HTTP 200 for login, manifest and API health at `http://27.147.139.157:3001`. HTTPS login and health also returned HTTP 200 at:

```text
Website:  https://27-147-139-157.sslip.io
API base: https://27-147-139-157.sslip.io/api
Socket:   https://27-147-139-157.sslip.io  (path /socket.io)
Manifest: https://27-147-139-157.sslip.io/manifest.webmanifest
```

Those checks describe the currently deployed version, not deployment of this checkout. Confirm the final stable domain with the owner before signing/releasing Android. A domain owned by the business avoids coupling the app identity to a VM IP and third-party wildcard DNS.

For this existing server-rendered Next.js application, use a Trusted Web Activity (TWA) for the first Android release. It uses the hosted frontend, first-party browser cookies, web push, file pickers and the existing API. Keep the browser implementation as the source of truth. Do not try to put this server-rendered Next.js build directly into a static Capacitor bundle.

If building a separate native frontend instead, use the endpoint inventory and Postman collection. The current API refresh mechanism uses an HttpOnly cookie, not a JSON refresh-token field. Native clients must persist the server's cookies in their HTTP client's cookie jar and send them to refresh/logout. Keep access tokens in memory and protect persistent cookies using platform facilities. A WebView wrapper needs its own cookie persistence, external link handling, file chooser/download handling (including authenticated blobs), location permission flow and Android Back integration. Browser web push cannot be assumed to work in WebView. These wrapper integrations are not implemented by this repository.

Official references: [TWA quick start](https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2), [Digital Asset Links and signing](https://developer.android.com/training/app-links/configure-assetlinks).

## Android website association

The website serves `/.well-known/assetlinks.json` dynamically when both server-side web environment variables are valid:

```dotenv
ANDROID_PACKAGE_NAME=com.yourcompany.trackfield
ANDROID_SHA256_FINGERPRINTS=AA:BB:...32_BYTES_TOTAL
```

The fingerprint shown above is illustrative; enter the complete 32-byte SHA-256 certificate fingerprint. Comma-separated fingerprints support development/release certificates. The Play-installed application must use the **Play App Signing certificate**, which can differ from the upload certificate. No private signing key belongs on the VM or in this repository.

Until configured, this endpoint deliberately returns 404 and grants no app association. Restart the web process after configuring it. Verify HTTPS 200 JSON with no redirect, correct package name and correct release certificate before testing a Play-installed build. Use the same origin in Android launch URL, manifest and association. Future domain changes require corresponding association/app configuration changes.

## Authentication contract

All URLs below are relative to the HTTPS origin. JSON requests require `Content-Type: application/json`.

| Request | Body / purpose | Success |
| --- | --- | --- |
| `POST /api/auth/login` | `{ "email": "...", "password": "..." }` | `{ "user": {...}, "accessToken": "..." }` plus `Set-Cookie` |
| `POST /api/auth/refresh` | No body; send cookie | Fresh user and access token |
| `GET /api/auth/me` | Bearer access token | `{ "user": {...} }` |
| `POST /api/auth/logout` | Send cookie | `{ "ok": true }`, clears refresh cookie |
| `PUT /api/auth/profile` | `{ "name": "..." }`; password change also needs `currentPassword`, `newPassword` | Updated user |
| `POST /api/auth/register` | Bank registration example in Postman | User/access token; bank membership starts pending |

Access tokens expire after 15 minutes; refresh cookies after 7 days. Refresh cookie: HttpOnly, SameSite=Lax, path `/api`, Secure when the API sees HTTPS through the trusted local proxy. Preserve `X-Forwarded-Proto` from Nginx. In browsers use same-origin requests with `credentials: 'include'`. Do not move the UI onto a different site and assume this cookie policy will work unchanged.

Authenticated API requests use `Authorization: Bearer <accessToken>`. On 401, coalesce concurrent refreshes, refresh once and retry once. A refresh 401 means sign in again. Network errors and 5xx mean connection/service failure, not logout. Never loop refresh requests, silently replay uncertain mutations after network failure, or store credentials in URL parameters. The browser keeps the access token in memory.

Logout clears the browser cookie; current refresh JWTs do not have server-side per-device revocation. Do not advertise remote logout/revocation capabilities that do not exist.

## Roles, data and concurrency

Authorization is enforced on the server, not just by hidden navigation. Respect `userRole`, `bankId`, `bankRole` and `bankStatus` from the latest session. Bank applicants may be `PENDING`, `APPROVED`, `SUSPENDED` or `REJECTED`. Pending users can view membership status; operational access requires approval. Internal accounts are created by IMS administrators; self-registration cannot grant existing global admin access. Do not hardcode bank IDs or assume all BANK accounts have the same permissions.

Bank team requests use `bankId` for an IMS admin's selected bank. Device/member mutations use version checks. On HTTP 409, reload the current record and ask the user to review before retrying. Keep assignments and bulk movements on the server's existing atomic endpoints.

Use [API-ENDPOINTS.md](API-ENDPOINTS.md) for all mounted methods/paths. The generated [Postman collection](trackfield.postman_collection.json) contains a login token capture script, cookie-based refresh, route parameters and selected example bodies. It is an endpoint inventory, **not a complete OpenAPI schema**. For additional request/response schemas use the linked controller source and existing integration tests. Regenerate after routing changes with `node scripts/generate-api-handoff.cjs`. Set credentials only in your local Postman environment and never export real credentials/tokens.

## Files and realtime

| Flow | Contract |
| --- | --- |
| Private message text | `POST /api/direct-messages/:contactId`, `{ "content": "..." }` |
| Private attachment | `POST /api/direct-messages/:contactId/attachments`, multipart `file` and optional `content`, max 20 MB |
| Private download | `GET /api/direct-messages/attachments/:messageId`, bearer required; stream bytes using returned headers |
| Private history | `GET /api/direct-messages/:contactId?before=<messageId>`, `{ contact, messages, hasMore }` |
| Inventory documents | `POST /api/hardware/:id/documents`, multipart `file`, max 10 MB; authenticated download via document endpoint |
| Global chat files | `POST /api/chat/files`, multipart `file`, max 100 MB |
| POS import | `POST /api/pos-serials/import`, multipart `file`, max 20 MB |

Do not manually set a multipart boundary. Private-message attachments are authorized per conversation and cannot be accessed as public `/uploads` files. Other legacy upload flows have different access behavior; do not promise that every legacy upload URL is private. A native client must stream authenticated downloads rather than handing a bearer-protected URL to an unauthenticated browser download manager.

Use **Socket.IO**, not a plain WebSocket client: connect to the origin with `auth: { token: accessToken }`, path `/socket.io`. Reconnect when the token changes and reload authoritative history/notifications after reconnect. Consult `apps/api/src/server.js` and each controller's emit calls for event payloads. Nginx must pass Upgrade/Connection headers and allow long-lived connections.

Web push uses VAPID configuration (`/api/notifications/push/public-key`, `/push/subscribe`). Device notifications are enabled by an explicit user action. Missing VAPID configuration, denied OS permission or unsupported browsers must leave in-app notifications usable. This API does not implement an FCM registration endpoint for a separate native app.

## Web/mobile behavior

The manifest includes 192/512 icons and a maskable icon, standalone display and root scope. The service worker registers on public and protected pages. It caches only the public offline document; it does not offer offline inventory edits, offline chat sending or business-data synchronization. Offline navigation shows a retry page; an open page shows a connection notice. Never claim a write succeeded without its server response.

Mobile layout includes safe-area spacing, dynamic chat viewport height, 16px mobile form text, touch targets and a drawer with Escape/focus handling. HTTPS is required for production location, service worker and push features. Do not add `user-scalable=no` or disable pinch zoom in a wrapper.

## Deploy this change to the existing VM

No VM credentials are present in the task, and this work does not deploy remotely. Before deployment, back up SQLite using its online backup facility (including a consistent snapshot if WAL is active), plus both public and private upload directories. Keep backups outside the web root. Use the production environment's existing database URL and secrets; never replace the production database with the local `dev.db`.

```bash
npm ci --include=dev
npm --workspace apps/api run prisma:generate
npm --workspace apps/api run migrate:deploy
npm --workspace apps/web run build
```

The repository's existing `deploy/redeploy.sh` rebuilds/restarts services but does not currently back up the DB or run migration deployment. Complete those steps explicitly as part of the deployment procedure. Use the established service/process manager. The existing server uses API 5000 and web 3001; the Nginx template forwards to those ports. Keep API traffic, uploads and Socket.IO on the same public HTTPS origin. Set production `CLIENT_URLS` to allowed HTTPS website origins; do not use wildcard credentialed CORS. Native HTTP clients do not require a browser CORS bypass.

After deployment check `/api/health`, login/refresh/logout, manifest/icon URLs, service worker cache headers, file transfer, location and websocket reconnect. `sw.js` must not be served with long-lived immutable caching. Configure Android association once the Android developer supplies the real package and certificate.

## Release acceptance owned jointly with the Android developer

- Confirm owner-approved final HTTPS domain, package name, signing identity, app name/icon and support contact.
- Prepare an accurate privacy policy and Data safety declaration covering accounts, chat/files, location/attendance and any third-party SDKs the Android developer adds. This repository does not invent an owner's legal/privacy commitments.
- Account creation exists. A Play-compliant account/data deletion request flow and public deletion-request URL still need owner-defined retention handling and implementation before submission. Admin account deletion is not an equivalent self-service request flow. See [Google account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).
- Test an actual Android release build: login after process death/reboot; expiry/reconnect; downloads/upload picker; denied permissions; location; notification tap deep link; keyboard; Back navigation; rotation; 320px phones/tablets; accessibility font scaling and zoom.
- Supply a restricted review account and realistic seeded review data. Complete Play Console testing, listing, content rating and declarations. Web browser checks do not certify Play Store acceptance.

## Reproduce checks

```bash
node --experimental-sqlite --test apps/web/lib/*.test.mjs apps/api/src/utils/*.test.js apps/api/src/controllers/*.test.js
npm --workspace apps/web run build
node --experimental-sqlite scripts/check-mobile.cjs
```

On Windows use `npm.cmd` where PowerShell blocks `npm.ps1`. Browser checks require Chrome (override `CHROME_PATH` if needed), ports 3009/5009/9229 and permission to launch it. They build an isolated production website with a temporary fixture SQLite DB, separate `.next-mobile-check-production` output and reports/screenshots in `reports/mobile-check/`; they do not use the live database. An intentionally obsolete `NEXT_PUBLIC_API_URL` verifies that browser flows use the current origin. Temporary artifacts are retained for diagnosis. No production user credentials are needed.
