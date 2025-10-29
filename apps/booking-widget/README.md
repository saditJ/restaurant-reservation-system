## Development notes

- Start the dev server with `pnpm dev`.
- Only call the backend through `/api/*`; the proxy hides service ports so the browser never sees localhost origins.
- Define local environment variables in `.env.local` and keep `.env.local.example` updated.

For end-to-end setup see the platform README.
