// The composition workspace is a browser-native WebGPU editor. Its server load
// still resolves Preset data, but evaluating the editor's renderer graph during
// SSR makes unrelated pipeline HMR failures take down every `/p/*` HTML request.
export const ssr = false;
