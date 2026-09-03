/** A Blob as a `data:` URL, read through the browser's own encoder. */
export function readBlobAsDataUrl(blob: Blob): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error('Blob data URL read failed.'));
		reader.onload = () => resolve(String(reader.result));
		reader.readAsDataURL(blob);
	});
}

/** A Blob's bytes as base64, without the `data:` URL prefix. */
export async function readBlobAsBase64(blob: Blob): Promise<string> {
	const dataUrl = await readBlobAsDataUrl(blob);
	const separator = dataUrl.indexOf(',');
	if (separator === -1) throw new Error('Blob data URL carried no payload.');
	return dataUrl.slice(separator + 1);
}
