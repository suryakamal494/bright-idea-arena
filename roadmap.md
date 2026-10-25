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
- [x] Verification (tests, build, Playwright) + memory updates
