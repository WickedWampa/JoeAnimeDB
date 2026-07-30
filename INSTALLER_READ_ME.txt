JOEANIMEDB 5.0.0 BETA 5 — WINDOWS INSTALLER

BUILD
1. Open the JoeAnimeDB project root.
2. Double-click BUILD-WINDOWS-INSTALLER.bat.
3. The builder updates dependencies, builds the React app, and creates the
   Windows NSIS installer in dist-desktop.

RELEASE FILES
Keep these files from the same build together:
- JoeAnimeDB-Setup-5.0.0-beta.5.exe
- JoeAnimeDB-Setup-5.0.0-beta.5.exe.blockmap
- latest.yml

The installer can be shared by itself for a manual installation. All three
files must be uploaded to the same published GitHub release for automatic
updates.

INSTALLER BEHAVIOR
- Installs for the current Windows user.
- Allows the user to choose the installation directory.
- Creates Start Menu and Desktop shortcuts.
- Registers a normal Windows uninstaller.
- Stores each user's database under that user's Windows AppData profile.
- Does not package a project-root JoeAnime.db.
- Preserves the database and backups during application updates.
- Leaves personal data in AppData when the application is uninstalled.

AUTOMATIC UPDATES
- Installed builds check the public JoeAnimeDB GitHub releases.
- The user chooses when to download and restart to install.
- Portable and development builds do not self-update.
- GitHub draft releases are not visible to installed applications.
- Beta 1 did not contain the updater, so Beta 1 testers must install Beta 2
  manually once. Later releases can update from inside JoeAnimeDB.

See AUTO_UPDATE_RELEASE_GUIDE.md for tagging, publishing, and end-to-end test
instructions.

IMPORTANT
This beta is unsigned. Windows SmartScreen may display an Unknown publisher
warning. Removing that warning requires a Windows code-signing certificate.
