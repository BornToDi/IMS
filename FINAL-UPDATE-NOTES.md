# Final update notes

## Implemented

- Workspace chat now supports optional message location sharing.
- Company chat now supports optional message location sharing.
- Location is permission based. The browser will ask the user before sending coordinates.
- Each message with location shows a Google Maps link below the message bubble.
- Image/file sending stays WhatsApp-style: image preview in chat, fullscreen image click, file saved in Files.
- Workspace invite notifications now emit live through Socket.IO.
- Existing live notifications remain for workspace messages, files, and goals.
- Mobile workspace tab text was tightened to avoid awkward wrapping.

## Required after extracting

Run from project root:

```bash
npm install
cd apps\api
npx prisma generate
npx prisma db push
cd ..\..
npm run dev
```

If Prisma asks `Ok to proceed? (y)`, type only `y`, then run the next command after it finishes.

## Location behavior

The 📍 button beside the chat input toggles location sharing.

When ON:
- Browser requests location permission.
- Message stores `latitude`, `longitude`, and `locationLabel`.
- Message bubble shows a clickable Google Maps location link.

When OFF:
- Messages send normally with no location data.

Location works on localhost and secure HTTPS domains. It may fail on normal insecure HTTP domains because browsers block geolocation there.
