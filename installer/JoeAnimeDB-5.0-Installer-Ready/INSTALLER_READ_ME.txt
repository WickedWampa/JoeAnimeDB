JoeAnimeDB 5.0 — Clean Windows Installer Build

1. Extract this ZIP to a normal folder on Windows.
2. Double-click BUILD-WINDOWS.bat.
3. The script creates both files in dist-desktop:
   - JoeAnimeDB-5.0.0-x64.exe (installer)
   - JoeAnimeDB-5.0.0-x64.exe (portable target may receive a descriptive suffix from electron-builder)

Requirements:
- Windows 10/11 x64
- Node.js 22 LTS
- Internet access during the first build

Clean-start verification:
- src/data/animeSeed.json contains zero anime titles.
- Electron stores each user's database in their own AppData folder.
- No JoeAnime.db file is packaged.
- No prior dist-desktop output is included in this ZIP.
