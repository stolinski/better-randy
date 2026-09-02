# Serving and rolling back the production artifact

How to build the production image, serve the GFX demo from it, prove the demo
works, and roll back to the release before it.

The origin this runbook stands up is **local and production-shaped**: the same
image, the same deployment inputs, and the same public runtime profile the
gfx.computer demo was designed for, served on loopback. There is no public
deployment — that was taken out of scope on 2026-08-31, and the gfx.computer
zone is reserved for a future docs site. Everything below is what you run on
your own machine.

Why the artifact exists at all, and what it promises, is
[ADR-0052](adr/0052-public-runtime-and-retention-architecture.md). What it must
never keep is [ADR-0053](adr/0053-gfx-namespace-and-legacy-supers-compatibility.md).

## Before you start

You need:

- A container runtime. `docker version` must answer.
- About 6 GB of free disk for one image, and twice that if you also build the
  rollback candidate.
- `ffmpeg` and `ffprobe` on your machine, for `pnpm verify:production-image`.
- Google Chrome, for `pnpm verify:production-demo`. The script starts it for
  you on the sanctioned CDP port.

## 1. Build the image

The image carries no checkout, so it cannot work out which commit it is. You
tell it, and `/api/health` reports that value back. Build from a clean tree, and
pass the commit you are building:

```sh
docker build --build-arg GFX_RELEASE="gfx@$(git rev-parse HEAD)" \
  --tag "gfx:$(git rev-parse HEAD)" .
```

The build fails rather than drifts. It refuses an ffmpeg that cannot encode a
public export lane, and it refuses to build at all without `GFX_RELEASE`.

Keep the tag. It is how you roll back later: **a rollback is serving an image
you already built**, so a release you might want to return to is a release you
keep tagged.

## 2. Serve it

Every deployment input the public profile needs is already baked into the image
except one. `ORIGIN` names the origin this host is being served as, and the host
resolves its own URLs from it alone, so it has to match the address you will
actually open:

```sh
docker volume create gfx-export
docker run --detach --name gfx \
  --publish 127.0.0.1:8787:3000 \
  --volume gfx-export:/var/lib/gfx/export \
  --env ORIGIN=http://127.0.0.1:8787 \
  "gfx:$(git rev-parse HEAD)"
```

The volume is not optional. Export work directories are the only thing this host
writes, a native-target ProRes session is measured in gigabytes, and the
readiness check reserves free space it can actually see.

If a required input is missing or wrong, the container exits before it binds a
port and names every unusable input at once, with the value that would fit. Read
`docker logs gfx`, fix the whole list, and start it again. A host that cannot
finish an export never accepts one.

Replacing a running artifact — a new image here, or the rebuild behind
`gfx.robo.online` — drops the previous build's hashed chunks. Tabs that were
already open recover on their own ([ADR-0058](adr/0058-stale-build-recovery-for-on-demand-imports.md)):
they poll `_app/version.json`, take their next navigation as a full page load,
and reload once if an on-demand import fails first. A tab that reloads while
the old process is still answering shows "Couldn't load renderer" once; reload
it by hand after the restart finishes.

## 3. Confirm it is serving

Ask the origin what it is:

```sh
curl -s http://127.0.0.1:8787/api/health
```

A host that is ready answers `200` with `{"status":"ready"}`, the release you
built, and `ok` for both `ffmpeg` and `temporaryDisk`. A `503` means the process
is alive but cannot serve an export right now — check disk and ffmpeg before
assuming the deploy failed.

Then run the two gates. They are separate because they ask different questions:

```sh
pnpm verify:production-image   # the artifact as a host
pnpm verify:production-demo    # the artifact as the demo a visitor gets
```

`verify:production-image` builds the image twice, withdraws each required
deployment input in turn, and drives the container over HTTP: readiness, nonroot
execution, the export volume, the response headers, the excluded surfaces, one
export per format, and a clean signalled stop. Evidence lands in
`runtime-probes/production-image.json`.

`verify:production-demo` builds the image, serves it, and points a real browser
at it: the GFX identity the app shell carries, a Starter opened from the library
and rendering real ink at a seeked frame, the WebMCP surface an attached agent
discovers, both export lanes completed by the page itself, nothing retained
afterwards, the layout at a phone width, the failure states a visitor can reach,
and every development-only surface answering 404. It then rolls back to the
previous commit and rolls forward again. Evidence lands in
`runtime-probes/production-demo-serving.json`.

Both scripts stand up and tear down their own container. Stop yours first, or
give it a different name and port.

## 4. Roll back

A rollback here is one move: stop the container serving the current release, and
start the image you built for the previous one on the same origin.

```sh
PRIOR="$(git rev-parse HEAD~1)"

docker stop --time 30 gfx && docker rm gfx
docker run --detach --name gfx \
  --publish 127.0.0.1:8787:3000 \
  --volume gfx-export:/var/lib/gfx/export \
  --env ORIGIN=http://127.0.0.1:8787 \
  "gfx:${PRIOR}"
```

If you never tagged that release, build it first from its own tree — not from
today's tree with yesterday's label, which would serve today's code under a name
that says otherwise:

```sh
git worktree add --detach /tmp/gfx-prior "${PRIOR}"
docker build --build-arg GFX_RELEASE="gfx@${PRIOR}" --tag "gfx:${PRIOR}" /tmp/gfx-prior
git worktree remove --force /tmp/gfx-prior
```

**Verify the rollback against the origin, not against the command you just ran:**

```sh
curl -s http://127.0.0.1:8787/api/health
```

The `release` field must now read `gfx@<prior commit>`. The served app shell
carries the same value in its `gfx-release` meta tag, so a browser can be asked
the same question. If either still names the release you rolled away from, the
old container is still serving — check `docker ps`.

Rolling forward again is the same move with the newer tag.

## What a rollback costs

In-flight exports, and nothing else. Export sessions live in memory and on the
temp volume; compositions live in the visitor's own browser and were never sent
to the origin. A visitor who was mid-export sees that export fail. A visitor's
work survives, because the origin never had it.

The temp volume is safe to keep across a rollback, and safe to delete when
nothing is serving. If you delete it, recreate it before the next `docker run` —
the host reserves space on it at startup.

## When a check fails

- **The container exits immediately.** A deployment input is wrong. `docker logs`
  names each one and the value that fits.
- **`/api/health` answers 503.** ffmpeg or the temp disk is unusable. The process
  stays up on purpose so this is a readiness problem, not a crash loop.
- **`verify:production-demo` reports a runtime fault.** The browser logged an
  error the demo does not explain. The evidence file records the message; treat
  it as a defect in the build, not as noise from the gate.
- **A development-only surface answers anything but 404.** The surface inventory
  and the served build disagree. Add the row, or take the route out — do not
  loosen the check.

## Cleaning up

```sh
docker stop --time 30 gfx && docker rm gfx
docker volume rm gfx-export
```

Stopping the host releases every open export session and empties the volume.
Nothing a visitor did survives, which is the whole design.
