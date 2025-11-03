# Communications

## Environment
- `MAIL_FROM` (default `Reservations <no-reply@example.test>`) sets the display name and address for outgoing mail.
- `SMTP_URL` (default `smtp://localhost:1025`) is passed to Nodemailer to connect to the SMTP relay.
- `COMMS_BASE_URL` (optional, defaults to `https://example.test`) is used to build `manageUrl`/`offerUrl` links embedded in templates and ICS attachments.

## Local Mailbox
- MailHog SMTP listens on `localhost:1025`.
- MailHog web UI: http://localhost:8025.

## Template Variables
- `{{guestName}}`
- `{{time}}`
- `{{partySize}}`
- `{{venueName}}`
- `{{manageUrl}}`
- `{{offerUrl}}`

## Lifecycle Hooks
- Creating a reservation (or converting a hold) sends the `CONFIRM` template with an ICS attachment.
- Moving a reservation to `CANCELLED` sends the `CANCELLED` template.
- Reminder emails are dispatched by the worker described below when `reminderHoursBefore` is configured.

## Reminder Scheduling
- Each venue has a nullable `reminderHoursBefore` policy. When set (for example `24`), reservations that start within that many hours and have not already been reminded are eligible for email reminders.
- Reminder state is stored on each reservation via `reminderSentAt` to prevent duplicate sends.

### Worker
- Run `pnpm --filter api comms:reminder` to start the reminder dispatcher. It polls every minute, looks ahead 48 hours, and sends REMINDER emails with ICS attachments for confirmed reservations within the configured window.
- The worker uses PII-protected email addresses directly from the database and marks `reminderSentAt` after a successful send (or immediately when no guest email exists).

## Metrics
- `comms_sent_total{kind}` increments after successful deliveries (e.g. `kind="confirm"`, `kind="reminder"`).
- `comms_failed_total{kind}` increments whenever a render/send attempt throws.

## Sample Render Payload
```json
{
  "venueId": "venue-brooklyn",
  "kind": "CONFIRM",
  "data": {
    "guestName": "Taylor Lake",
    "time": "December 24, 2025 7:00 PM",
    "partySize": "4",
    "venueName": "Riverfront Brooklyn",
    "manageUrl": "https://example.test/reservations/BK001",
    "offerUrl": "https://example.test/offers/winter-special"
  }
}
```
