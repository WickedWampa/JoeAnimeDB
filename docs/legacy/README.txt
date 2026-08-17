JoeAnimeDB medium-width sidebar fix

Extract this ZIP into the project root and replace the matching file.

Changed file:
src/styles/sidebar-command-rail.css

Behavior:
- Above 1050px: full desktop sidebar.
- From 761px through 1050px: compact fixed left sidebar.
- At 760px and below: existing mobile bottom navigation.

Verified with:
- npm run build
- npm run test:release
