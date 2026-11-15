# Greenscape Admin (PWA)

| | |
|---|---|
| Name / short name | Greenscape Admin / GS Admin |
| Origin | `https://admin.greenscapelandscapingph.com` |
| Start URL, scope | `/`, `/` |
| Theme / background | `#193C2B` / `#F5F8F5` |
| Icon | Leaf inside a gear, deep forest green |

## What changed in the app

- **Install**: Settings → "Install the app" (`InstallApp`). The account menu already links to Settings.
- **Offline**: a floating notice, "You are offline. Changes cannot be saved until you are back online.", with Retry. A page that cannot load shows the offline screen.
- **Mutations**: forms use server actions; offline they fail and say so. Nothing is queued or replayed.
- **Layout**: the header and the mobile menu respect the top safe area; the existing sidebar (rail on desktop, drawer on phones), dashboard cards and notification bell are unchanged.
- **Brand**: the sidebar and sign-in screen show the GS mark; the app icon (home screen, tab, notifications) is the Admin gear.

## Notifications

Unchanged pipeline (`docs/notifications.md`): new paid orders, quote requests, messages, low stock, leave requests, time corrections, reviews to moderate, announcements. Push is turned on from the bell or from Notifications; sounds from the speaker button. The system notification now uses the Admin icon.

## Sign-in

Installing changes nothing about access. Every page still goes through `proxy.ts` (session) and the API (permissions). An installed app opened without a session shows the sign-in screen.
