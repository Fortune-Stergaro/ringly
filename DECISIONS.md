# Decisions & deviations from the brief

* **Scheduler**: Supabase `pg_cron` + `pg_net` hit a protected Next.js route every minute; jobs are claimed with `FOR UPDATE SKIP LOCKED`; `UNIQUE(job_id, subscription_id)` on deliveries prevents duplicate sends after a crash; transient failures retry with 30s/2m/5m back-off (3 attempts).
* **Event writes are atomic** inside Postgres RPCs (`upsert_event`, `cancel_event`); clients cannot insert events, jobs or memberships directly.
* **Recurrence** is expanded in TypeScript with Luxon (not `rrule`) so wall-clock time in the event's IANA zone is preserved across DST. 90 days are materialised; a daily cron extends the window.
* **Foreground alarm** uses a client timer plus service-worker `postMessage`, not Supabase Realtime. Push remains the only path when the app is closed.
* **Urgent alerts** open `/alert/[id]` (no acknowledgement) and bypass the per-group mute.
* **Snooze** is a per-user `snooze` job (5 min, max 3 per occurrence).
* **Editing** a recurring event edits the whole series. Cancelling a single session is supported. "This and future" splitting is not implemented.
* **Calendar views**: agenda list per group and across groups. Month/week grids are not built.
* **Proposed events** (members suggest, admins approve): schema flag exists, UI not built.
* **Onboarding wizard** replaced by a prominent "set up notifications" card on Home.
* **Not included**: Playwright e2e tests, reports/abuse-report UI, ownership transfer, offline app-shell caching, strict CSP.
* UI uses plain Tailwind components instead of shadcn/ui to avoid a generator step.
* No generated DB types: Supabase clients are untyped; run `pnpm db:types` and pass `Database` to the clients to tighten.
