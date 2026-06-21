# Decisions

- Use `pnpm` as the preferred package manager and execution entrypoint.
- Run the combined app using Git Bash when possible.
- The Puppeteer scraping server should listen on port `7070`.
- Vite client startup should use `pnpm exec vite dev --host 0.0.0.0` and target the project root.
- Ignore stale PID cleanup for now; focus on the active startup path.
- Prefer direct Windows commands to inspect processes when shell tools like `lsof` are unavailable.
