# AYA Regulars Manager - PRD

## Problem Statement
Attendance + pass tracking web app for AYA Dance Club. Manages attendance, pass validity, drop-ins, and renewal reminders. Payments collected offline.

## Architecture
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **Frontend**: React + Tailwind CSS + shadcn/ui
- **Auth**: JWT-based email/password
- **Theme**: Monochrome (black/white/gray), light/dark toggle

## User Personas
1. **Super Admin (AYA)**: Full access, manages batches/instructors, views all data, audit log
2. **Instructor**: Restricted to assigned batches, marks attendance, manages dancers/passes

## Core Requirements
- Role-based access (admin vs instructor)
- Attendance marking optimized for mobile (big tap targets)
- Pass tracking: Monthly Unlimited, Class Pack, Drop-in
- Pass consumption logic (class packs decrement, drop-ins mark used)
- In-app renewal/expiry notifications
- Audit log with before/after snapshots
- CSV export for reports
- Configurable expiry warning thresholds

## What's Been Implemented (Feb 27, 2026)
- Full backend API (auth, users, batches, dancers, enrollments, passes, sessions, attendance, audit log, notifications, reports, settings, seed)
- Admin dashboard with stats cards and alerts
- Admin pages: Batches CRUD, Dancers view, Instructors CRUD, Audit Log with filters, Reports with charts and CSV export, Notifications center, Settings
- Instructor dashboard with batch cards
- Instructor batch view with tabs: Today (attendance), Dancers (add/remove/pass), History
- Attendance marking with one-tap toggle, mark all present, search, filters
- Drop-in dancer quick add
- Pass assignment and renewal
- Dark/light mode toggle
- Demo data seeded (1 batch, 2 instructors, 5 dancers with mixed passes)

## Prioritized Backlog
### P0 (Done)
- [x] JWT auth with role-based access
- [x] Attendance marking flow
- [x] Pass tracking and consumption
- [x] Admin dashboard and management pages
- [x] Instructor batch management
- [x] Audit log
- [x] CSV export

### P1 (Next)
- [ ] Multiple batch support (add more batches for different studios)
- [ ] Attendance history detail view per dancer
- [ ] Low attendance dancer reports
- [ ] Better mobile navigation for admin

### P2 (Future)
- [ ] SMS/WhatsApp renewal reminders
- [ ] Dancer self-service portal
- [ ] Payment tracking integration
- [ ] Batch scheduling calendar view
- [ ] Bulk import dancers from CSV
