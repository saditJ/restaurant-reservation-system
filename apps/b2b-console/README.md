## Development notes

- Start the dev server with `pnpm dev`.
- The UI must only call the backend via `/api/*`. Local ports are implementation details surfaced through the Next proxy route; never point the client at localhost origins.
- Environment variables live in `.env.local` – update the bundled example when keys change.

See the root README for full platform setup instructions.
