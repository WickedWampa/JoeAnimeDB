JOEANIMEDB 5.0 BETA — WINDOWS INSTALLER PATCH

1. Copy every file/folder from this ZIP into the JoeAnimeDB project root.
2. Allow Windows to replace package.json, index.html, and electron/main.cjs.
3. Double-click BUILD-WINDOWS-INSTALLER.bat.
4. The finished installer will appear in dist-desktop as:
   JoeAnimeDB-5.0-Beta-Setup-x64.exe

INSTALLER BEHAVIOR
- Requests administrator permission.
- Installs for all users under Program Files.
- Creates Start Menu and Desktop shortcuts.
- Registers a normal Windows uninstaller.
- Keeps each tester's database under their Windows AppData profile.
- Does not package the project-root JoeAnime.db.
- Uninstalling the app leaves tester data in AppData by design.

IMPORTANT
This is an unsigned beta installer. Windows SmartScreen may display an "Unknown publisher" warning. The tester can choose More info > Run anyway. Removing that warning requires purchasing a Windows code-signing certificate.
