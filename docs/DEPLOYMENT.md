# Deployment and operations

## Development

Use Node.js 22:

```sh
npm ci
cp .env.example .env.local
node scripts/configure-admin.mjs
npm run dev
```

Open `http://localhost:3000` or `/admin`. Windows users can use `Copy-Item` instead of `cp`. Credentials are not built into the source. The helper stores a scrypt hash, not a password.

The database starts empty. Add a named Booked slot to create a student, then assign their company in Students & companies. Configure optional first-import assignments through private `CARRIE_STUDENTS` configuration. Never commit real student records or production configuration.

## Configuration

| Variable | Purpose |
|---|---|
| `ADMIN_USERNAME` | Teacher login identifier |
| `ADMIN_PASSWORD_HASH` | 64-byte scrypt hash, encoded as 128 hex characters |
| `CARRIE_STUDENTS` | Optional comma-separated names for initial company assignment |
| `DATA_DIR` | Persistent database directory; default `./data` |
| `COOKIE_SECURE` | Set `true` when served over HTTPS |
| `NEXT_TELEMETRY_DISABLED` | Set `1` to disable Next.js telemetry |

The compatibility salt is `matrona-local-login-v1`. A salt is not a secret; the hash and runtime configuration remain private. Existing deployments can move their hash into the environment without changing their login.

## Production

Docker Compose is an alternative packaging path. Configure `.env.local` first, then run `docker compose up -d --build`. The database uses a named volume; do not remove it during ordinary deployments. The live installation uses systemd and Nginx.

For systemd, build in a staged release on the target architecture, keep the database outside the release directory, and supply a private `EnvironmentFile`. Bind Next.js to loopback behind Nginx, preserve Host/forwarded protocol headers, and terminate public HTTPS at ingress. The live site uses Cloudflare Tunnel rather than exposing the application port.

## Safe release sequence

1. Run tests, TypeScript, build and HTTP integration.
2. Use SQLite's online backup API. Copying only a live database file can omit WAL changes.
3. Stage source and Linux dependencies. Never copy Windows native modules to Linux.
4. Build with resources appropriate to the host; small Pis may need swap and a single build worker.
5. Check a staged process on a spare loopback port against isolated data.
6. Switch the service, retaining the real persistent database.
7. Verify live health and login. Retain the previous release and backup for rollback.

The Blocked migration expands a CHECK constraint transactionally. Register tables are additive. Check schema compatibility before rolling back an older application, and retain a pre-release database backup.

## Backups

```python
import sqlite3
source = sqlite3.connect('file:/path/to/data/matrona.sqlite?mode=ro', uri=True)
backup = sqlite3.connect('/private/backups/teacher-zaan.sqlite')
source.backup(backup)
backup.close()
source.close()
```

Keep backups private: they contain student records and session hashes. Restore with the service stopped, preserve ownership and check integrity. Never overwrite production data when deploying code or importing portfolio fixtures.
