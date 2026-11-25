# Android release: outstanding decisions and checks

This is an internal working checklist, not a public privacy policy or a claim of Play compliance.

## Identity and signing

- Confirm the final HTTPS origin and Android application ID with the owner. An application ID used for a published app must not be replaced casually.
- Obtain the SHA-256 fingerprint of the Play App Signing certificate from Play Console. Also obtain the development or upload certificate fingerprint when testing a build signed with that certificate. Never put a private key or keystore password in this repository.
- Set `ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_FINGERPRINTS` in the deployed web environment and restart it. Confirm that `/.well-known/assetlinks.json` returns the intended package and certificate over HTTPS without a redirect. See `ANDROID-HANDOFF.md`.
- Create the Android project and signed APK/AAB using the approved identity and a securely held signing key. A build signed with a different certificate needs that certificate's fingerprint in the association as well.

## Privacy and account deletion

- The owner supplied `sw-zihadul@networld-bd.com` for support and specified 30 days for retention. Confirm the exact records, start point, exceptions and handling of backups and shared business records; the existing application does not enforce this period. Identify the legal operator, processors and actual deployment configuration before publishing a policy.
- The code handles account details, messages and attachments, attendance and location, ticket/workspace records, session cookies and optional push subscriptions. Verify all active providers and integrations, including location lookup, hosting and notification delivery, before writing disclosures.
- Decide a verified request and support process, including how requests are received and tracked, identity is checked, associated data is deleted, retained records are explained, backups expire and users receive a response. Audit foreign keys, files, shared records and tokens before implementing deletion. An admin-only delete button does not establish that all associated data is deleted.
- Publish an accurate privacy policy and a public account deletion request page, and provide discoverable in-app access to both. Test the actual request process end to end. Complete Play Console Data safety declarations using the final app and service configuration.

## Device acceptance

Install the actual signed release on a physical Android device and record the device, Android version, app version, signing certificate and results. Check association/full-screen launch, login and session restoration, notification permission and delivery, file upload/download, location permission and attendance, Android Back, rotation, offline recovery and accessibility. A web browser test does not substitute for this device run.

Official references: https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2 and https://support.google.com/googleplay/android-developer/answer/13327111.
