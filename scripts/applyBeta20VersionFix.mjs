import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const VERSION = '5.0.0-beta.20';
const VERSION_CODE = '5000020';

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`Missing ${rel}. Run this from the JoeAnimeDB repo root.`);
  return fs.readFileSync(p, 'utf8');
}

function write(rel, text) {
  fs.writeFileSync(path.join(root, rel), text.replace(/\r?\n/g, '\n'), 'utf8');
  console.log(`[fixed] ${rel}`);
}

function updateJson(rel) {
  const obj = JSON.parse(read(rel));
  obj.version = VERSION;
  if (rel === 'package-lock.json' && obj.packages?.['']) {
    obj.packages[''].version = VERSION;
  }
  write(rel, JSON.stringify(obj, null, 2) + '\n');
}

updateJson('package.json');
updateJson('package-lock.json');

{
  const rel = 'android/app/build.gradle';
  let text = read(rel);
  text = text.replace(/versionCode\s+\d+/, `versionCode ${VERSION_CODE}`);
  text = text.replace(/versionName\s+"[^"]+"/, `versionName "${VERSION}"`);
  if (!text.includes(`versionCode ${VERSION_CODE}`) || !text.includes(`versionName "${VERSION}"`)) {
    throw new Error('Could not verify Android Beta 20 version identity.');
  }
  write(rel, text);
}

{
  const rel = 'scripts/testReleaseGate.mjs';
  let text = read(rel);

  // Update stale gate labels from the old Beta 18 wording.
  text = text.replaceAll('Beta 18 version identity is consistent across platforms', 'Beta 20 version identity is consistent across platforms');
  text = text.replaceAll('Beta 18 release gate failed', 'Beta 20 release gate failed');
  text = text.replaceAll('Beta 18 automated release gate passed', 'Beta 20 automated release gate passed');

  // Update the hard-coded platform identity assertions.
  text = text.replace(/assert\.equal\(packageMetadata\.version,\s*'5\.0\.0-beta\.\d+'\);/, `assert.equal(packageMetadata.version, '${VERSION}');`);
  text = text.replace(/assert\.match\(androidSource,\s*\/versionCode\\s\+\d+\/\);/, `assert.match(androidSource, /versionCode\\s+${VERSION_CODE}/);`);
  text = text.replace(/assert\.match\(androidSource,\s*\/versionName\\s\+"5\\\.0\\\.0-beta\\\.\d+"\/\);/, `assert.match(androidSource, /versionName\\s+"5\\.0\\.0-beta\\.20"/);`);

  const required = [
    `assert.equal(packageMetadata.version, '${VERSION}');`,
    `versionCode\\s+${VERSION_CODE}`,
    `versionName\\s+"5\\.0\\.0-beta\\.20"`,
    'Beta 20 version identity is consistent across platforms'
  ];
  for (const needle of required) {
    if (!text.includes(needle)) throw new Error(`Release gate update did not verify: ${needle}`);
  }
  write(rel, text);
}

console.log('\nBeta 20 version identity is synchronized across package, Android, and release-gate checks.');
