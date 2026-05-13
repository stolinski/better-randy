# HTML-In-Canvas + TypeGPU: Hard-Won Lessons And Concrete Patterns

Read this before designing any tool that mixes html-in-canvas with shaders or programmatic pixel access. The 2D-context path of the proposal has implementation quirks that make it the wrong default for shader work. The canonical pattern is the WebGPU variant.

**Canonical model:** [WICG webgpu-jelly-slider example](https://github.com/WICG/html-in-canvas/tree/main/Examples/webgpu-jelly-slider). This is the reference implementation maintained by WICG. Match its shape before improvising. The patterns below are distilled from it and from this project's research-paper pipeline.

## The working pipeline shape

- Single `<canvas layoutsubtree>` element with DOM children inside.
- `canvas.getContext('webgpu')` — the canvas's context is WebGPU from the start.
- `device.queue.copyElementImageToTexture(domChild, width, height, { texture })` writes the DOM child's rasterization directly into a GPU texture.
- Texture usage: `TEXTURE_BINDING | COPY_DST | RENDER_ATTACHMENT` (`0x14`).
- Shader passes (WGSL) sample the texture, compose, output to the canvas's swap chain.
- `canvas.onpaint` is the right place to re-upload the DOM texture (fires when the layoutsubtree children need repainting). `canvas.requestPaint()` triggers it manually after state edits.

## Concrete code patterns (TypeGPU 0.11.x)

### 1. Host setup

Live shape from `src/lib/platform/gpu-host.ts`:

```ts
import tgpu, { type TgpuRoot } from 'typegpu';

const root = await tgpu.init();
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const format = navigator.gpu.getPreferredCanvasFormat();
context.configure({ device: root.device, format, alphaMode: 'premultiplied' });
```

### 2. DOM texture for `copyElementImageToTexture`

Use raw `device.createTexture` (TypeGPU's `createTexture` doesn't expose `COPY_DST + RENDER_ATTACHMENT` cleanly for this use case). Define numeric flags locally to dodge the missing `GPUTextureUsage` global type:

```ts
const DOM_TEXTURE_USAGE =
	0x04 /* TEXTURE_BINDING */ | 0x02 /* COPY_DST */ | 0x10; /* RENDER_ATTACHMENT */

const domTexture = device.createTexture({
	size: [domWidth, domHeight, 1],
	format: 'rgba8unorm',
	usage: DOM_TEXTURE_USAGE
});
```

Size the DOM texture to the source element's natural rendered dimensions (`element.getBoundingClientRect()` scaled by `devicePixelRatio`). Don't force it to canvas size — the browser rasterizes the element AT the texture's `(w, h)` and you lose detail if those don't match the element's natural size.

### 3. Bind group layout + structs

TypeGPU's typed layout and uniform schema:

```ts
import tgpu, { d } from 'typegpu';

const PaperUniforms = d.struct({ paperRect: d.vec4f });

const composeLayout = tgpu.bindGroupLayout({
	domTexture: { texture: d.texture2d(d.f32) },
	marksTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	uniforms: { uniform: PaperUniforms }
});
```

### 4. Shader entry points

Use the template-literal form for vertex and fragment functions. Fullscreen triangle vertex with passed-through UVs:

```ts
const vsTriangle = tgpu['~unstable'].vertexFn({
	in: { vertexIndex: d.builtin.vertexIndex },
	out: { position: d.builtin.position, uv: d.vec2f }
}) /* wgsl */ `{
	var positions = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
	var uvs = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));
	return Out(vec4f(positions[in.vertexIndex], 0, 1), uvs[in.vertexIndex]);
}`;
```

Fragment with bind-group access. **The whole layout is passed via `.$uses({ layout: composeLayout })`**, then referenced in WGSL as `layout.$.fieldName`. TypeGPU resolves this during codegen.

```ts
const composeFs = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
	let rect = layout.$.uniforms.paperRect;
	let localUv = (in.uv - rect.xy) / rect.zw;
	let isInside = localUv.x >= 0.0 && localUv.x <= 1.0 && localUv.y >= 0.0 && localUv.y <= 1.0;
	let inside = select(0.0, 1.0, isInside);
	let safeUv = clamp(localUv, vec2f(0.0), vec2f(1.0));
	let domSample = textureSample(layout.$.domTexture, layout.$.samp, safeUv);
	let domColor = domSample * inside;
	let marksColor = textureSample(layout.$.marksTexture, layout.$.samp, in.uv);
	let outAlpha = marksColor.a + domColor.a * (1.0 - marksColor.a);
	let outRgb = marksColor.rgb + domColor.rgb * (1.0 - marksColor.a);
	return vec4f(outRgb, outAlpha);
}`.$uses({ layout: composeLayout });
```

### 5. Bind group + uniform buffer

```ts
const sampler = root['~unstable'].createSampler({
	magFilter: 'linear',
	minFilter: 'linear',
	addressModeU: 'clamp-to-edge',
	addressModeV: 'clamp-to-edge'
});

const uniformBuffer = root
	.createBuffer(PaperUniforms, { paperRect: d.vec4f(0, 0, 0, 0) })
	.$usage('uniform');

const bindGroup = root.createBindGroup(composeLayout, {
	domTexture,
	marksTexture,
	samp: sampler,
	uniforms: uniformBuffer
});
```

### 6. Pipeline + draw

```ts
const pipeline = root['~unstable']
	.withVertex(vsTriangle, {})
	.withFragment(composeFs, { format })
	.createPipeline();

// Per frame:
uniformBuffer.write({ paperRect: d.vec4f(x, y, w, h) });

pipeline
	.with(bindGroup)
	.withColorAttachment({
		view: context.getCurrentTexture().createView(),
		clearValue: [0, 0, 0, 0],
		loadOp: 'clear',
		storeOp: 'store'
	})
	.draw(3);
```

### 7. DOM upload wiring

Use `canvas.onpaint` so the browser tells you when the DOM changed; trigger it with `canvas.requestPaint()` after Svelte state edits:

```ts
canvas.onpaint = () => {
	device.queue.copyElementImageToTexture(domChild, domWidth, domHeight, { texture: domTexture });
	renderFrame(currentTimestamp);
};
canvas.requestPaint(); // initial

// Svelte $effect that touches state-affecting fields:
$effect(() => {
	state.title;
	state.body;
	state.fontFamily; // touch
	canvas.requestPaint();
});
```

### 8. Mixing 2D-drawn overlays (annotations, etc.)

When a tool has CPU-drawn 2D content alongside DOM, render it to an `OffscreenCanvas` and upload as a second GPU texture each frame with `copyExternalImageToTexture`:

```ts
const marksCanvas = new OffscreenCanvas(canvasWidth, canvasHeight);
const marksContext = marksCanvas.getContext('2d', { alpha: true })!;

// Each frame:
marksContext.clearRect(0, 0, canvasWidth, canvasHeight);
drawAnnotationMarks({ context: marksContext, ... });
device.queue.copyExternalImageToTexture(
	{ source: marksCanvas },
	{ texture: marksTexture },
	[canvasWidth, canvasHeight]
);
```

This is the cleanest way to keep existing 2D-canvas drawing code working while moving the final composition to WebGPU.

## TypeGPU pitfalls

- **`layout.$.field` is codegen-mode-only.** Reading it at JS level (e.g. `.$uses({ srcTex: layout.$.src })`) throws "Accessed view 'src' outside of codegen mode." Pass the whole layout (`.$uses({ layout: composeLayout })`) and reference `layout.$.field` inside the WGSL template.
- **The `~unstable` API surface is real, not optional.** `tgpu['~unstable'].vertexFn / fragmentFn / createTexture / createSampler` are the entry points for shader work in 0.11.x. `tgpu.bindGroupLayout`, `root.createBuffer`, `root.createBindGroup` are stable.
- **Bind groups attach at draw time** via `pipeline.with(bindGroup)`. Recreate the bind group if any underlying resource (texture, buffer) is recreated (e.g. on resize).
- **TypeGPU's `createTexture` may not expose `COPY_DST + RENDER_ATTACHMENT` together cleanly for the html-in-canvas upload use case.** Drop to raw `device.createTexture` for the DOM-receiving texture. The output remains usable by TypeGPU's bind group system because TypeGPU's texture schemas (`d.texture2d(d.f32)`) accept raw `GPUTexture` resources.
- **WebGPU global types like `GPUTextureUsage` aren't declared in `lib.dom.d.ts` as values.** Define the numeric usage flags locally rather than fighting the type system.

## WGSL pitfalls

- **`textureSample` must be in uniform control flow.** Conditional sampling based on per-pixel UV (`if (uv.x >= 0) { textureSample(...) }`) violates this and the shader fails to compile. Pattern: clamp UV, sample unconditionally, multiply the result by a 0/1 mask computed via `select(0.0, 1.0, condition)`.
- **WGSL has `&&` and `||` for booleans** and accepts `vec2f >= vec2f` returning `vec2<bool>`. `all()` and `any()` reduce a bool vector to a scalar.

## Why NOT the 2D path (`drawElementImage`) for shader work

- A canvas can have only one context type — `2d` or `webgpu` or `webgl`. They are mutually exclusive. A 2D canvas can't host shaders directly; you would need a second canvas with a GPU context plus a bridge between them. The bridge is broken in practice (next bullets).
- `drawElementImage(liveElement, ...)` on a layoutsubtree canvas writes through Chrome's compositor overlay, NOT into the canvas's readable bitmap. The canvas displays correctly to the user, but `copyExternalImageToTexture` (via WebGPU upload), `drawImage(canvas → canvas)`, and similar bitmap-readback paths see nothing — only what was written via standard 2D API calls (`fillRect`, `stroke`, etc.) survives there. `getImageData` reads a different buffer than `drawImage(canvas)` sources from.
- `canvas.captureElementImage(element)` returns an `ElementImage` object (sync, not a Promise, not an `ImageBitmap`). It has `width`, `height`, `close`, and is designed as a source argument to `drawElementImage`. It is not directly accepted by `drawImage` or `copyExternalImageToTexture`.
- `drawElementImage(snapshot)` (snapshot source on a regular canvas) writes pixels to the bitmap **only when the destination canvas is at or near the snapshot's natural dimensions**. On a much-larger destination (e.g. 4K) it silently no-ops. This makes the snapshot → bridge → 4K-canvas approach unworkable.

## Hiding the layoutsubtree canvas

- `display: none` — children don't lay out; `drawElementImage` fails.
- `visibility: hidden` — removes paint records; `drawElementImage` throws "No cached paint record for element."
- `opacity: 0` — keeps paint records but `drawElementImage` produces zero-alpha pixels.
- The right answer for the canonical WebGPU pattern is **don't hide it** — it IS the visible canvas. If a multi-canvas setup is ever required, use offscreen positioning (`transform: translate(200%)`) — that preserves paint records and the bitmap.

## Test discipline

- Chrome's html-in-canvas behavior is undocumented in edge cases (size limits, bitmap vs compositor, snapshot semantics). When something behaves unexpectedly, **probe in DevTools console with `getImageData` and prototype enumeration before refactoring code**. One probe answers a question; refactoring on a hunch wastes hours.
- Always test html-in-canvas via browser automation unless the user says not to.
