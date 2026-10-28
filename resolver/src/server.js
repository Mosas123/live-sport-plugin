import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { port, bindHost } from './env.js'
import { route } from './http/router.js'
import { systemdSocketFd } from './systemdSocket.js'
import { systemdTlsOptions } from './systemdTls.js'

// Invalid explicit activation or TLS configuration must fail startup; it must
// never silently fall back to an unauthenticated TCP listener.
const activatedFd = systemdSocketFd(process.env, process.pid)
const tlsOptions = systemdTlsOptions(process.env, activatedFd)
const srv = tlsOptions ? createHttpsServer(tlsOptions, route) : createHttpServer(route)

function boot() {
  const addr = srv.address()
  const host = typeof addr === 'string' ? addr : `${addr.address.includes(':') ? `[${addr.address}]` : addr.address}:${addr.port}`
  console.log(typeof addr === 'string' ? '[Resolver] Activated socket is listening' : `http://${host}/`)
}

srv.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Resolver] Port ${port} is already in use.`);
    process.exit(98);
  }
  console.error('[Resolver Server Error]', err);
  process.exit(1);
});

// Explicit opt-in only: fail at startup if activation metadata is invalid.
// The regular TCP startup path remains the default.
if (activatedFd === null) srv.listen(port, bindHost, boot)
else srv.listen({ fd: activatedFd }, boot)
