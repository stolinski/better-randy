# Deferred ideas
- Revisit atomic temp-file + rename writes for User compositions with a dedicated concurrent read/write reliability workload; steady-state route latency does not measure the partial-JSON failure it prevents.
- Revisit built-in fallback when an optional User override is corrupt/unreadable, measured with injected read/parse failures; it keeps `/p/<builtin-slug>` usable and the existing console integration logs the cause to Sentry.
