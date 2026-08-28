# Sentry dev flow

Errors report to `scott-tolinski-projects/supers`. That project slug — and the
`SUPERS-<n>` short ids derived from it — is `frozen` under ADR-0053, because it
holds every historical event and lives in Sentry rather than in this repository.

Releases registered before the rename carry `supers@<sha>` and stay queryable.
