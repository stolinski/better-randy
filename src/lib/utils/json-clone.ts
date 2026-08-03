/** Clone Preset-owned JSON data without retaining Svelte reactive proxies. */
export function cloneJsonValue<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
