# Roadmap

- [x] Cloud backend, schema/RLS/RPCs, demo seed, all role flows, perf fixes, login-first homepage
- [x] ICORG logo asset + brand lockup in headers + "Organized by ICORG" footers
- [x] Auth page: Google-only social sign-in, "School registration" link
- [x] Instant student signup (email auto-confirm on) — lands on dashboard immediately
- [ ] Parent notification email + template (BLOCKED: email domain not configured — waiting for user's domain setup)
- [x] /school-register: name, designation, school, city, email, mobile, password + back link
- [x] /parent-revoke: student details first, explicit two-step confirmation
- [x] Student pre-team onboarding stepper on dashboard (steps 1–3)
- [x] profiles.designation column + parent info RPCs (migration 0010)
- [x] Scale work: DB indexes (migration 0011), admin team/submission directory RPCs + paginated pages, judge pagination, student autosave hardening (migration 0012 fixed upsert_submission stage-settings call), load test at 654 teams/934 submissions, load-test data cleaned up
- [x] Digital project one-pager form (migration 0013): sections 01–07 from the offline guide — project info, theme, Swarna Andhra Sutras + explanation, observed problem, proposed solution, additional information (links + titled attachments with preview), auto-filled team members. Sutras reference table seeded; submission RPC enforces theme + sutras + ≥1 attachment + ≥3-member roster on submit
- [x] Deadline auto-submit: finalize RPC + daily reconciliation job (migration 0014); stage locks after deadline
- [x] Admin: submissions manager CSV export, per-entry printable one-pager download; directory CSV export (members + submissions)
- [x] Judge blind view updated with theme + Sutras + titled attachment previews
- [x] Verification: typecheck, tests, build, Playwright flows (student form + autosave + attachment, gate for short teams, admin inspector + export, judge blind view) — all green
- [ ] Final competition themes: currently the 4 seeded themes (AgriTech, CleanTech, Health, Education); user will finalize the full theme list later — theme selection UX (per-team theme pick before submission) to be revisited then
- [ ] Mentor role: future access to submission forms with blind surfaces (team code + title only); schema already identity-safe
