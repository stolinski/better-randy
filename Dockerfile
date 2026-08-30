# syntax=docker/dockerfile:1
#
# The reproducible public gfx.computer runtime (ADR-0052): one long-lived Node
# process, ffmpeg on the same host, private per-session temp disk, no durable
# content of any kind. Cloudflare supplies DNS and proxy only — nothing here
# targets Workers.
#
# Build it with the commit it serves, because there is no checkout inside the
# image for /api/health to fall back to:
#
#   docker build --build-arg GFX_RELEASE="gfx@$(git rev-parse HEAD)" -t gfx .
#
# `pnpm verify:production-image` builds it twice, smokes it, exports through it,
# and stops it — see scripts/verify-production-image.ts.
#
# Every version this image depends on is pinned here and nowhere else: the base
# image by digest, pnpm and ffmpeg by exact version. The build fails rather than
# drifts, and the resolved versions are recorded at /app/runtime-versions.json so
# a running container can be asked what it is made of.

ARG NODE_IMAGE=node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e

FROM ${NODE_IMAGE} AS build

ARG PNPM_VERSION=11.1.3
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:${PATH}
RUN npm install --global --no-audit --no-fund "pnpm@${PNPM_VERSION}"

WORKDIR /src

# The dependency layer is the expensive one, so it is keyed on the manifests
# alone. `patches/` is part of it: pnpm applies the pinned @sveltejs/kit patch
# during install, not as a postinstall script.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches

# Nothing in this image renders in a browser — the visitor's browser does, and
# the origin only encodes what it uploads — so Playwright's browser download is
# skipped rather than shipped. The libvips override is what lets sharp build
# against its bundled copy instead of a host one.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    SHARP_IGNORE_GLOBAL_LIBVIPS=1 \
    CI=true
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# The encoder names the runtime stage asserts against its real ffmpeg, read from
# the ratified contract rather than restated, so the two cannot drift.
RUN node --experimental-strip-types --input-type=module \
      --eval "const c = await import('/src/src/lib/platform/public-runtime-contract.ts'); process.stdout.write(c.REQUIRED_FFMPEG_ENCODERS.join('\n'));" \
      > /src/required-ffmpeg-encoders.txt

# The adapter output is not self-contained — the server chunks import the
# production dependencies by name — so the image carries the production tree
# only. Scripts stay off: no dependency here needs one, and a production image
# is the wrong place to find out otherwise.
RUN pnpm install --prod --frozen-lockfile --ignore-scripts


FROM ${NODE_IMAGE} AS runtime

ARG FFMPEG_APT_VERSION=7:5.1.9-0+deb12u1
ARG GFX_RELEASE

# No fonts are installed on purpose. The origin never rasterizes text: it reads
# PNG frames the browser already rendered and pipes them into ffmpeg. Every
# typeface the demo uses is a web font served from build/client.
RUN apt-get update \
 && DEBIAN_FRONTEND=noninteractive apt-get install --yes --no-install-recommends \
      "ffmpeg=${FFMPEG_APT_VERSION}" \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /src/required-ffmpeg-encoders.txt /tmp/required-ffmpeg-encoders.txt

# An ffmpeg that cannot encode a public lane is a broken image, not a 503 at
# three in the morning. `-encoders` rows start with six capability flags.
RUN set -eu; \
    encoders="$(ffmpeg -hide_banner -encoders 2>/dev/null)"; \
    while read -r encoder; do \
      [ -n "${encoder}" ] || continue; \
      printf '%s\n' "${encoders}" | grep -qE "^ [A-Z.]{6} ${encoder} " || { \
        echo "ffmpeg ${FFMPEG_APT_VERSION} cannot encode ${encoder}, which a public export lane requires." >&2; \
        exit 1; \
      }; \
    done < /tmp/required-ffmpeg-encoders.txt; \
    rm /tmp/required-ffmpeg-encoders.txt

# /api/health reports the release a deploy or rollback is verified against, and
# there is no checkout in here to derive it from.
RUN test -n "${GFX_RELEASE}" \
 || { echo 'GFX_RELEASE build argument is required: pass the commit this image serves.' >&2; exit 1; }

RUN printf '{"node":"%s","ffmpeg":"%s","ffmpegPackage":"%s"}\n' \
      "$(node --version)" \
      "$(ffmpeg -hide_banner -version | head -1)" \
      "${FFMPEG_APT_VERSION}" \
      > /app/runtime-versions.json

COPY --from=build --chown=root:root /src/build ./build
COPY --from=build --chown=root:root /src/node_modules ./node_modules
COPY --from=build --chown=root:root /src/package.json ./package.json

# Export work directories are the only thing this host writes. They live on a
# declared volume rather than the container's writable layer, because a
# native-target ProRes session is measured in gigabytes and the readiness check
# reserves free space it can actually see.
RUN mkdir -p /var/lib/gfx/export && chown node:node /var/lib/gfx/export
VOLUME ["/var/lib/gfx/export"]

ENV NODE_ENV=production \
    GFX_RUNTIME_PROFILE=public \
    GFX_RELEASE=${GFX_RELEASE} \
    GFX_EXPORT_TEMPORARY_DIRECTORY=/var/lib/gfx/export \
    PUBLIC_GFX_COMPOSITION_STORE=browser \
    HOST=0.0.0.0 \
    PORT=3000 \
    SHUTDOWN_TIMEOUT=10
# PUBLIC_EXPORT_RUNTIME_LIMITS.maxFrameBytes. The adapter's 512K default rejects
# every native-target frame upload with 413; `pnpm verify:production-image`
# asserts this value still matches the ratified limit.
ENV BODY_SIZE_LIMIT=67108864

# ORIGIN is deliberately not baked in: it names the public origin this image is
# being deployed as, and the startup check refuses to serve without it.

EXPOSE 3000
USER node

# Liveness and readiness are the same question here — the host can serve both
# export lanes or it cannot — and /api/health already answers it redacted.
HEALTHCHECK --interval=15s --timeout=10s --start-period=20s --retries=3 \
  CMD ["node", "--eval", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.status === 200 ? 0 : 1), () => process.exit(1))"]

# Node runs as PID 1 without an init shim on purpose: the adapter installs its
# own SIGTERM and SIGINT handlers, so the default-disposition problem does not
# apply, and every ffmpeg the host spawns is its direct child and is reaped as
# one. A pinned init package cannot be pinned across architectures anyway.
CMD ["node", "build/index.js"]
