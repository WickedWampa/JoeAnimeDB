const { spawnSync } = require('node:child_process');
const path = require('node:path');

const androidDirectory = path.resolve(__dirname, '..', 'android');
const isWindows = process.platform === 'win32';
const command = isWindows ? 'gradlew.bat' : 'sh';
const args = isWindows ? ['assembleDebug'] : ['./gradlew', 'assembleDebug'];

const result = spawnSync(command, args, {
  cwd: androidDirectory,
  stdio: 'inherit',
  shell: isWindows
});

if (result.error) {
  console.error(`Could not start the Android Gradle build: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
