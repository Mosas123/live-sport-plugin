# Resolver socket/TLS: isolated test plan (review draft)

This plan is for review before execution. It is not an instruction to deploy,
modify production, change the existing PM2 daemon, run `pm2 save`, or enable
the examples at boot. Keep #59 in draft. Freeze and record the tested SHA.
The default TCP path still has an unresolved unverified-listener issue.

## Preconditions and safety boundary

* Use a separate isolated build and PM2 home, non-production port, instance
  name, socket and runtime directory. Confirm no existing resource occupies
  them; do not kill or unlink an unverified occupant.
* The example paths under `/opt/nuvio-isolated/<id>` and
  `/run/nuvio-resolver-test-<id>` are placeholders. Confirm Node, OpenSSL,
  source helper, built resolver, dependencies, credentials and systemd PATH on
  the actual host. Verify the archive against every commit blob before build.
* The test identity lasts one day and is not a production credential. All
  example processes run as root; a process with access to the key can impersonate
  the resolver. Directory checks and pinning do not defend against malicious
  same-user/root access or eliminate filesystem check/use races.
* Review diagnostics for URLs, headers, cookies, proxy credentials and tokens
  before sharing. Retain a complete sanitized capture from start to shutdown.

## Local preparation to review

The example script `scripts/provision-isolated-resolver.js <id>` creates a new
instance-specific runtime directory and test certificate, and refuses to reuse
an existing name. It writes to `/run` when actually invoked; do not invoke it
against an existing instance or production. Failures leave the new directory for
inspection. The service reads `identity/resolver.crt` and `identity/resolver.key`
via systemd credentials; workers need only the same public certificate. Confirm
both workers receive identical public certificate bytes and never log the key.

The example socket precheck requires the runtime directory to be owned by the
service user with mode 0700 and rejects a pre-existing `resolver.sock` path.
`RemoveOnStop=no` is deliberate; a later start may fail until a verified stale
path is handled by the operator. Never automatically remove an unverified path.
The example units are manually controlled, are not installed automatically and
have not been run under systemd. Review their paths, restart limits and ordering
with Raj before using them. No AF_UNIX-only or private-network isolation is set,
since the resolver needs external egress.

For both workers, the experimental configuration must select
`RESOLVER_TRANSPORT=systemd-unix-tls`, set `RESOLVER_SOCKET_PATH` to the
isolated socket, `RESOLVER_CERT_DIR` to the public certificate directory,
`RESOLVER_TLS_SERVERNAME=resolver.internal`, and use the isolated
`RESOLVER_PORT` as the cache adapter's legacy URL constraint. An invalid or
missing identity must not fall back to TCP. These settings do not automatically
provision, reload or rotate credentials.

## Ordered checks

1. On the isolated source checkout run the synthetic tests and the real socket
   tests `node --test tests/resolverUnixSocket.node.cjs tests/resolverUnixTlsSocket.node.cjs`.
   Record the exact commands, platform, results and failures. Passing these is
   not evidence that the packaged server or systemd activation works.
2. After unit and path review, verify the directory owner/mode and isolated
   socket unit before starting the isolated resolver and workers. Confirm the
   resolver receives exactly one activated FD and the intended credentials;
   check no unexpected service, port, process or production daemon changed.
3. With both workers running, verify cache sharing and proxy resolution over
   the intended socket. A foreign TCP listener and a Unix peer with a different
   certificate must receive no sensitive request; missing or stale credentials
   must fail without TCP fallback. Record the peer and listener state without
   killing or unlinking unverified processes.
4. Exercise clean shutdown, abrupt resolver termination, recovery, restart-rate
   limits, worker restart and repeated stop/start. Capture process roles,
   PID/PPID/state, socket owner/path and shutdown markers. Test a new certificate
   generation: a worker with the old pin must fail; both workers reconfigured
   to the new pin must succeed. No automatic or zero-downtime rotation is claimed.
5. Under any proposed sandbox, validate DNS, golf, streamed and goat routes,
   a real playlist and CDN segment relay, credential loading and an incorrect
   certificate. `ProtectHome` may hide `/root` paths; file-write needs of
   dependencies are not ruled out by inspecting only resolver source. Do not
   claim the settings are safe until exercised under the exact unit.

Stop the experiment on an unexpected production change, unverified listener
contact, leaked secret, restart storm, or an unexplained failure. Report results
per step and SHA. A passing isolated run is evidence for this candidate, not
automatic approval to merge or deploy.
