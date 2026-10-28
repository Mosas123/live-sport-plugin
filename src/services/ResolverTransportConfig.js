'use strict';
const { readResolverPublicIdentity } = require('./ResolverPublicIdentity');
const { createPinnedResolverUnixClients } = require('./ResolverUnixClients');

// Experimental composition only, not wired to startup. Absence of the mode
// preserves existing behavior; explicitly selecting it must never downgrade.
function createConfiguredResolverTransport(env, dependencies = {}) {
  const mode = env.RESOLVER_TRANSPORT;
  if (mode === undefined || mode === '') return null;
  if (mode !== 'systemd-unix-tls') throw new TypeError('Invalid resolver transport mode');
  const readIdentity = dependencies.readIdentity || readResolverPublicIdentity;
  const createClients = dependencies.createClients || createPinnedResolverUnixClients;
  const tlsIdentity = readIdentity(env.RESOLVER_CERT_DIR, env.RESOLVER_TLS_SERVERNAME);
  // A malformed injected or future reader must fail before any socket request.
  if (!tlsIdentity || typeof tlsIdentity.certificatePem !== 'string' || !tlsIdentity.certificatePem ||
      typeof tlsIdentity.expectedHost !== 'string' || !tlsIdentity.expectedHost) {
    throw new Error('Resolver public certificate unavailable');
  }
  return createClients({ socketPath: env.RESOLVER_SOCKET_PATH, legacyPort: env.RESOLVER_PORT || '7003', tlsIdentity });
}

module.exports = { createConfiguredResolverTransport };
