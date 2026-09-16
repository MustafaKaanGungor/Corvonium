/**
 * Hand a file to the person, in whatever way this device actually can.
 *
 * On a phone a download is close to useless — it lands somewhere you never look,
 * and on iOS an installed app may not download at all — so a touch device with
 * file sharing gets the **share sheet**: Files, Drive, or a message to yourself.
 * Everywhere else it is an ordinary download.
 *
 * The share sheet is limited to coarse pointers on purpose: desktop Chrome
 * supports sharing files too, and a share dialog where a download was expected
 * is a surprise.
 */
export async function saveFile(
  name: string,
  text: string,
  type: string,
): Promise<'saved' | 'cancelled'> {
  const file = new File([text], name, { type });

  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'saved';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Refused for any other reason — fall through to a download.
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked late: some browsers start reading the blob only after `click` returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);

  return 'saved';
}
