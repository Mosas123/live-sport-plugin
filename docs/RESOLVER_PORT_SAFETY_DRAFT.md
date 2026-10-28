# Resolver port ownership: local review draft

This is a design and test contract, not an implemented fix. PR #59 remains a
draft. No existing occupant may be killed merely because it owns the port.

## Observed behavior

The manager currently accepts any HTTP response, including an error response,
as proof of a healthy resolver. Raj's isolated test showed that an unrelated
HTTP server remains alive but is treated as the resolver. The same loopback
port is used by the public stream proxy and by the shared L2 resolve cache.
Preventing a false readiness log alone does not prevent either route from
contacting an unrelated listener.

A local characterization test uses a mocked endpoint that returns plausible
cache-miss and claim responses. Under those conditions the current shared-cache
code sends the generated stream object, including any proxy header hints, to
that endpoint. This demonstrates a conditional data-exposure path; it does not
claim Raj's decoy actually received those objects. The test documents the defect
and is not proof of a fix.

## Required behavior

- Before sending resolver requests, every worker must have evidence that the
  endpoint belongs to the intended resolver instance. A successful health
  response, a matching process name, or a PID file alone is not that evidence.
- On an unverified occupied port, do not kill, adopt, retry indefinitely, or
  pass requests to the occupant. Surface a bounded, explicit conflict. The
  conflict must not introduce an uncontrolled restart loop.
- A worker unable to use the shared cache must retain local-cache behavior;
  resolver-dependent proxy requests must fail clearly without contacting the
  unverified listener. Do not expose URLs, headers, cookies, or credentials in
  the conflict diagnostic.
- Support the current two-worker shared resolver, staggered startup, restart,
  owner exit, and independent deployment instances. Do not claim correctness
  for multiple workers until the mechanism is validated across processes.
- Process handles establish identity for a directly spawned child; sharing
  trustworthy ownership evidence across workers is a separate requirement.
  Health checks are readiness checks after ownership is established, not proof
  of ownership. Metadata and process-tree observations must account for stale
  state and PID reuse. A check followed by a connection also has a race; the
  design must state how it prevents or limits that race.

## Before proposing an implementation

Choose and document the process coordination and platform scope, including
reload behavior and what happens if the owner dies. The project currently runs
two PM2 workers; a single-worker-only solution must not be presented as a full
fix. Avoid new native dependencies unless their installation and platform
behavior are reviewed. Do not infer a process belongs to us from a response it
controls. Do not silently adopt a pre-existing orphan.

## Coordination options to investigate

| Option | Potential benefit | Open questions |
| --- | --- | --- |
| Explicit application supervisor with IPC | A supervisor can keep an owned child handle and distribute verified state to workers. | PM2 currently owns cluster lifecycle. Determine how to integrate without unsupported internals; test owner death and reload. |
| System-managed socket and resolver service | A service manager can own and pass a listening socket to the resolver. | This changes deployment architecture and is systemd-specific. Determine how workers establish trust, how restart behaves, and what non-systemd installations do. |
| Per-worker resolver endpoints | Each worker can keep its own child handle instead of adopting a listener. | Changes resource costs and shared L2 caching; preserving cross-worker cache requires a separate design. |

Node's cluster API can pass handles through a primary process, but the project
does not currently control PM2's primary. A documented Node capability alone
does not prove that an application-owned supervisor can be inserted into the
existing deployment. An unverified HTTP response, a lock file, or a command
line alone is not sufficient identity evidence.

References: Node cluster documentation https://nodejs.org/api/cluster.html;
systemd socket documentation https://www.freedesktop.org/software/systemd/man/254/systemd.socket.html.

## Required checks

1. A foreign listener returning 200 and one returning 404 both remain untouched;
   neither receives stream or shared-cache requests. The conflict is clear.
2. Two workers started in either order use the same verified resolver; neither
   silently adopts an unrelated listener or creates a restart storm.
3. Test stale ownership state, PID reuse, resolver exit and port replacement
   between verification and request, and restart during initialization.
4. Test a prior orphan and an occupant belonging to another live supervisor;
   neither is signaled without verified ownership. Distinguish explicit
   operator cleanup from the automated startup path.
5. Test the normal cache fallback and public proxy failure paths, including no
   sensitive request details in logs. Run simulated tests first and repeat in
   a real isolated instance before claiming the behavior is fixed.
