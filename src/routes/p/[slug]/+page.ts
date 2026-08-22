// The composition workspace is a browser-native WebGPU editor. Its server load
// still resolves Preset data, but evaluating the editor's renderer graph during
// SSR makes unrelated pipeline HMR failures take down every `/p/*` HTML request.
// Keep client rendering explicit so route configuration cannot disable the only
// supported rendering environment while this page remains isolated from SSR.
export const ssr = false;
export const csr = true;
