# Greenscape Employee (PWA)

| | |
|---|---|
| Name / short name | Greenscape Employee / GS Employee |
| Origin | `https://employee.greenscapelandscapingph.com` |
| Start URL, scope | `/`, `/` |
| Theme / background | `#368A5B` / `#F7FAF7` |
| Icon | Leaf as the hand of a clock, fresh green |

## What changed in the app

- **Install**: Profile → "Install the app".
- **Attendance offline**: the Clock in / Clock out button is disabled and the card says **"Internet connection is required to record attendance."** Nothing is queued: a punch exists only when the server recorded it, with the server's time.
- **Offline notice** above the bottom navigation, with Retry. A page that cannot load shows the offline screen.
- **Layout**: the header respects the top safe area, the bottom navigation the bottom one (it already did).
- **Brand**: header and sign-in screen show the GS mark; the app icon (home screen, tab, notifications) is the Employee clock.

The dashboard, live clock, attendance summary and calendar, schedule, requests, bottom navigation and bell were already there (`docs/ui-ux/employee-redesign.md`) and are unchanged.

## Notifications

Unchanged pipeline: schedule changes, leave decisions, correction decisions, missed clock-out, announcements. Push is turned on from the bell or Profile → Notifications and sounds. The system notification now uses the Employee icon.

## Known limit

`navigator.onLine` can say "online" on a network with no internet. The button is then enabled, the punch fails, and the card shows an error. It never shows a success the server did not confirm.
