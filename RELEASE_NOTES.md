# JoeAnimeDB 5.0.0-beta.21

## JoeAnimeDB TV is here

Beta 21 brings JoeAnimeDB to Android TV.

This started as a quick "I wonder if the Android APK will run on a TV" test and turned into a full couch interface.

The same JoeAnimeDB library, JoeAI, Anime DNA, discovery tools, cloud sync, and metadata system now have a TV layout built around a remote instead of a mouse or touchscreen.

## Built for a D-pad

The TV interface is not just the phone layout stretched across a bigger screen.

Beta 21 adds dedicated TV navigation and focus handling across the app:

- Home
- JoeAI
- Library
- Favorites
- Discover
- Following
- Analytics
- Upcoming
- Settings
- About / Help
- Anime Details

Focus movement is now deterministic where it matters. Up and Down stay inside poster grids, page controls no longer randomly throw focus back into the sidebar, and search fields are kept out of the way unless you actually want them.

The goal was simple: if you can use a remote, you should be able to use JoeAnimeDB.

## Six titles across

Library, Favorites, Discover, Analytics results, and Upcoming have all been reworked for couch-distance viewing.

TV layouts now use:

- Six-across poster grids on standard TV widths
- Compact page heroes
- Smaller TV toolbars
- Larger, clearer focus states
- Reduced button clutter inside poster cards
- Fewer unnecessary D-pad stops
- Smooth section-to-section navigation

Poster cards are treated as the main target. Extra actions are moved out of the browsing path where possible so scrolling through a library does not feel like navigating a spreadsheet.

## Home got a TV pass

The Home screen now works as a compact launchpad.

The hero uses full-bleed artwork, with Ask JoeAI and Open Library positioned as the primary TV actions. Continue Watching and JoeAI Pick of the Day sit directly underneath so the useful stuff stays close together.

The page is designed to get you from launching the app to watching or finding something with as little remote gymnastics as possible.

## Library and Favorites

Library and Favorites now match the rest of the TV interface instead of behaving like desktop pages.

Both pages now follow the same structure:

```text
Hero
View / Update / Search toolbar
Titles
```

The control bar is smaller, the hero comes first, and the title grid starts immediately underneath.

Library and Favorites navigation was also tightened so entering the page lands in useful content instead of bouncing around the sidebar or search box.

## Discover without the D-pad workout

Discover got one of the biggest TV cleanups.

The page now has:

- A compact hero
- A two-row action bar
- Six-across recommendation shelves
- Better shelf-to-shelf navigation
- View All routes that return cleanly to their shelf
- A compact Daily Pick
- A cleaned-up Entire Catalog view
- Fewer secondary actions inside cards

The Entire Catalog browser also drops Quick Add and Follow buttons from TV cards. Open the title and use the full Details screen instead.

Much less clicking. Much less accidental keyboard summoning.

## Following, Analytics, and Upcoming

Following now uses a compact TV layout and removes controls that only make sense on Windows.

Analytics has a smaller hero, tighter Studio and Genre DNA sections, six-across title results, and a cleaner focus loop between the hero, DNA controls, and results.

Upcoming now has a compact hero and toolbar with six titles across. Follow and Add were removed from the TV cards so the grid stays clean and the Details screen remains the place for title actions.

## Anime Details stayed big on purpose

The Details screen already carried a lot of useful information, so Beta 21 does not try to turn it into a tiny TV card.

Instead, the poster was reduced just enough to keep the action buttons visible on the first screen.

The left-side controls now behave as a predictable vertical D-pad stack, including Favorite, Follow where available, and Repair Metadata.

Synopsis scrolling and the existing title navigation remain intact.

Details is still supposed to feel like Details.

## TV Settings cleanup

Settings no longer shows a pile of desktop file-management controls on Android TV.

TV keeps the useful stuff:

- Appearance and themes
- Content Safety
- Profile
- JoeAI Memory
- Cloud Sync
- Provider status
- Database and metadata tools
- Replay Tutorial
- Reset Local Data

Desktop-oriented file backup/import/export controls, Open Data Folder, View Logs, Export Diagnostics, and similar couch-unfriendly controls are hidden on TV.

Cloud Sync is the sane way to move a TV install between devices.

## Same library, different screen

JoeAnimeDB TV uses the same cloud sync system as the desktop, web, and Android builds.

That means you can keep JoeAnimeDB on your main computer, restore it on Android TV, and carry the same library data across devices without maintaining a separate TV library.

The TV work does not replace the existing desktop, web, or mobile layouts. It is its own interface layer on top of the same app.

## Beta 21 in one sentence

JoeAnimeDB can now live on the biggest screen in the house without feeling like somebody plugged a keyboard app into a television.

That was the goal.

---

**JoeAnimeDB 5.0.0-beta.21**

*Track it. Understand it. Find the next obsession.*
