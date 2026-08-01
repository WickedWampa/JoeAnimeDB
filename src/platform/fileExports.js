import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativeAndroid } from './runtime';

export function saveTextExport(filename, text, mimeType = 'text/plain') {
  if (!isNativeAndroid()) {
    const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return;
  }

  void (async () => {
    await Filesystem.writeFile({
      path: filename,
      data: String(text),
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true
    });
    const { uri } = await Filesystem.getUri({
      path: filename,
      directory: Directory.Cache
    });
    await Share.share({
      title: filename,
      text: 'JoeAnimeDB export',
      url: uri,
      dialogTitle: `Save or share ${filename}`
    });
  })().catch((error) => {
    console.error(`Could not export ${filename}:`, error);
    window.alert('The export could not be opened. Your library was not changed.');
  });
}
