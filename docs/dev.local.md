# Local Development Smoke Test

1. Install dependencies and copy environment files:
   ```bash
   pnpm install
   cp configs/.env.example apps/api/.env
   cp configs/.env.example apps/b2b-console/.env.local
   cp configs/.env.example apps/booking-widget/.env.local
   cp configs/.env.example apps/provider/.env.local
   ```
   Edit the app-level files to set `API_KEY` and any venue-specific overrides.
   On Windows PowerShell use `Copy-Item` instead of `cp`.

2. Boot infrastructure and schema:
   ```bash
   pnpm stack:up
   pnpm db:migrate
   pnpm db:seed # optional sample data
   ```

3. Start application processes (run in separate terminals or tmux panes):
   ```bash
   pnpm --filter api dev
   pnpm --filter b2b-console dev
   pnpm --filter booking-widget dev
   ```
   The apps listen on `3003`, `3001`, and `3002` respectively.

4. Verify health:
   ```bash
   curl -s http://localhost:3003/health | jq
   curl -s http://localhost:3003/ready | jq
   curl -s http://localhost:3003/metrics | head
   ```

5. Open `http://localhost:3001/status` to confirm API, metrics, and database probes are green.

6. When finished:
   ```bash
   pnpm stack:down
   ```
