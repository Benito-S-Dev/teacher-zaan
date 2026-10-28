# Case study: from timetable to teaching register

## Problem

A language teacher needed to share availability while keeping student information private. A recurring weekly grid could not answer how many classes a student actually received, which lessons were missed, or where a make-up class belonged for billing.

Most providers used calendar months; one used 16th–15th periods. Manually entered names varied in capitalization, and some blocked bookings had no name.

## Solution

A public, printable timetable is paired with a teacher-only dated register. Students have stable IDs and normalized names. The teacher assigns a providing company, corrects attendance, separately marks billable absences and reschedules individual classes. Reports expose totals and dated details. Versioned rules preserve past records when the weekly plan changes.

## Interview discussion points

**A template is not a ledger.** Dated records preserve history while the weekly plan remains editable.

**Attendance is not billing.** An absence can be chargeable without being counted as teaching delivered.

**Reconciliation must be idempotent.** Unique source keys and transactions prevent duplicate classes after refreshes and restarts.

**Authorization belongs on the server.** Hiding tabs is insufficient. Public queries omit private fields, and each register route requires authentication.

**One-off moves are not weekly edits.** A linked replacement prevents accidental recurring changes and double billing.

**Operations are part of the implementation.** Target-compatible native modules, small-host builds, consistent backups and rollback are required for a useful real deployment.

## Evidence and scope

The repository includes isolated store tests, HTTP integration, CI configuration, deployment instructions and architecture notes. The live public site demonstrates the deployed timetable; admin credentials and real student records are intentionally not shared.

This is a single-teacher system. It does not claim multi-tenant scale, automated invoices, verified physical attendance or WhatsApp integration. Future work could add multi-user identities, configurable provider tracking dates, report exports and a teacher-authorized messaging interface.
