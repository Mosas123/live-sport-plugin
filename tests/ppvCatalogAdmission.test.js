'use strict';
jest.mock('../src/services/ProviderOutbound', () => ({ safeFetch: jest.fn() }));
const PpvStProvider = require('../src/providers/PpvStProvider');

test('PPV catalog fetch identifies itself for bounded startup admission', async () => {
  const provider = new PpvStProvider({ circuitBreaker: {} });
  provider.proxyFetch = jest.fn(async () => ({ ok: true, json: async () => ({ success: true, streams: [] }) }));
  await expect(provider.getMatches()).resolves.toEqual([]);
  expect(provider.proxyFetch).toHaveBeenCalledWith('https://api.ppv.st/api/streams', expect.objectContaining({ diagnosticOwner: 'catalog' }));
});
