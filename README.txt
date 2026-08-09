JoeAnimeDB Mobile and Tablet JoeAI Composer Fix

This patch fixes the cramped JoeAI prompt composer on phone and tablet
layouts without changing the desktop composition.

Changed file:
src/styles/mobile.css

Responsive behavior through 1024 px:
The composer uses the full available chat width.
The textarea and Ask JoeAI button stack vertically.
The textarea is taller and remains vertically resizable.
Desktop width, grid, flex, and minimum-button constraints are reset.
The Ask JoeAI button uses the full row width and a 48 px minimum height.

Phone layouts through 760 px receive a 104 px minimum textarea height.
Tablet layouts receive an 88 px minimum textarea height.

Verification:
npm run build

Result: passed.
