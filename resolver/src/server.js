import { createServer } from 'node:http'
import { port, bindHost } from './env.js'
import { route } from './http/router.js'

const srv = createServer(route)

function boot() {
  const addr = srv.address()
  const host = typeof addr === 'string' ? addr : `${addr.address.includes(':') ? `[${addr.address}]` : addr.address}:${addr.port}`
  console.log(`http://${host}/`)
}

srv.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Resolver] Port ${port} is already in use.`);
    process.exit(98);
  }
  console.error('[Resolver Server Error]', err);
  process.exit(1);
});

srv.listen(port, bindHost, boot)
