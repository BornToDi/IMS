# Web and mobile verification

Verified locally on 2026-11-16 against the changed source. Base repository commit: `872b3ae`; changes are not committed or deployed by this task.

| Check | Result | Evidence |
| --- | --- | --- |
| Next.js production build | Pass | `reports/mobile-check/production-build.txt` |
| API/frontend automated suite | 91 passed, 0 failed | `reports/mobile-check/unit-tests.txt` |
| Chrome responsive layout assertions | 98 passed | `reports/mobile-check/results.json` |
| Browser behavior/integration checks | 11 passed | Same report |
| Uncaught browser runtime errors / observed API 5xx | None in final browser run | Same report |
| Git whitespace check | Pass | `git diff --check` |

The browser runner creates a separate production build and a temporary SQLite database. Its fixture includes administrator, approved bank admin and employee accounts, a bank, POS, ticket, workspace, goal and conversation. It deliberately sets an obsolete public API URL to ensure browser requests still use the website origin. No production database or user credentials were used.

## Screen coverage

Four viewport widths: 320, 390, 768 and 1440 pixels. Layout assertions compare actual document width to the layout viewport so mobile auto-expansion cannot hide overflow.

Public pages: login, registration and bank registration. Authenticated administrator pages: dashboard, ticket list/detail, hardware inventory, bank team, private support, employee directory, field task list/detail, workspace goals, goal detail, goals, action items, meetings, announcements, company chat, profile, POS serials and PDF conversion. Additional bank and employee checks cover their respective primary pages. The 98 assertions include repeated routes at different sizes and roles, not 98 distinct screens.

Screenshots were also inspected for mobile dashboard/chat/conversation and tablet chat. Generated screenshots remain in `reports/mobile-check/`.

## Behavior coverage

1. API health and no-store response headers.
2. Website association with a configured test Android package/certificate.
3. Manifest scope and successful retrieval of every icon.
4. Service worker update cache headers.
5. Mobile navigation opening and closing on route selection.
6. A deliberately expired API token triggers cookie refresh and one retry on the legacy announcements flow.
7. Mobile company-chat contacts drawer opening/closing.
8. Inventory stock form fits the mobile viewport.
9. A private message sent through the mobile UI is persisted exactly once in the fixture database.
10. Cookie session restoration after a full page reload.
11. Offline navigation falls back to the public offline document.

Automated API tests additionally exercise bank access boundaries, approval/assignment/version rules, ticket workflows, attachment authorization and upload validation, inventory bulk operations/exports, attendance and session handling. Service-worker tests cover cache scope, malformed push payloads, failed badging and same-origin notification links.

## What changed

- Fixed narrow-screen overflow in employee filters and nested goal details; made the legacy invite form stack on phones.
- Improved drawer focus/Escape behavior, storage failure handling and navigation resizing.
- Improved tablet messaging layouts and added a reachable chat contacts control.
- Added viewport/safe-area support, mobile form text sizing and touch targets.
- Added installable PWA icons, an install action inside navigation, universal service-worker registration and an offline fallback without caching business data.
- Changed push opt-in to an explicit action separate from opening notifications.
- Consolidated legacy browser requests onto the current website origin and shared session refresh handling.
- Added configured Android Digital Asset Links, API cache protections, corrected VM example ports and automatic Prisma client generation before API development startup.
- Added an endpoint inventory and Postman collection for the Android developer.

## Deployment and Android release limits

The live VM's public login/manifest/health responses and existing HTTPS endpoint were checked read-only. This task did not deploy the changed checkout, alter the VM, generate an APK/AAB or sign/publish an Android application.

Physical Android device testing, actual push delivery, camera/file-picker integration, Android Back behavior, OS permission handling and Play review must be verified in the developer's final Android build. Privacy/Data safety declarations and an account deletion request flow still need completion before store submission. Real package name and Play signing certificate must be configured on the deployed website. See [ANDROID-HANDOFF.md](ANDROID-HANDOFF.md) for deployment and release responsibilities.

Reproduce the final production-browser run with `node --experimental-sqlite scripts/check-mobile.cjs`. It requires Chrome and local process/network permissions and leaves diagnostic artifacts under `reports/mobile-check/`.
