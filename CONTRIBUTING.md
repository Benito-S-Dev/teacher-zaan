# Contributing

Start with the README and architecture notes. Use Node.js 22, install with `npm ci`, and create private local credentials using the configuration helper.

Keep public and teacher-only data boundaries explicit. Changes to billing or dates should include fixed-clock tests, including period boundaries. Preserve database migrations, historical snapshots, version checks and idempotent generation. Avoid adding external services when an isolated local implementation is sufficient.

Before a pull request, run `npm test`, `npm run typecheck`, `npm run build` and `node tests/http-check.mjs`. Use synthetic data for screenshots and reproduction steps. Never commit `.env` files, production hashes, real student records or SQLite databases.

For work in the original collaborative project, ask the owner whether they want to perform final feature testing themselves before starting acceptance testing, unless they have already delegated it.
