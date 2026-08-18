JoeAnimeDB Workers AI POC worker fix

Replace:
  cloudflare/joeai-worker/src/index.js

with the file in this ZIP.

Then Wrangler should auto-reload. If it does not, stop it with x/Ctrl+C and run:
  npx.cmd wrangler dev

Retry the same /cloud prompt.
