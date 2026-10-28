'use strict';
jest.mock('../src/services/ProviderOutbound', () => ({ safeFetch: jest.fn() }));
const DamiTvProvider = require('../src/providers/DamiTvProvider');

test.each([
  ['fetch', Object.assign(new Error('secret token'), { code: 'ERR_OUTBOUND_CAPACITY' }), 'fetch', 'ERR_OUTBOUND_CAPACITY'],
  ['parse', new SyntaxError('secret payload'), 'parse', 'SyntaxError']
])('reports sanitized %s extraction failures while retaining fallback', async (step, error, phase, expected) => {
  const breaker = { wrapSync: (_name, fn) => ({ fire: fn }) };
  const provider = new DamiTvProvider({ circuitBreaker: breaker });
  provider.proxyFetch = jest.fn().mockImplementationOnce(async () => {
    if (step === 'fetch') throw error;
    return { ok: true, json: async () => { throw error; } };
  }).mockResolvedValue({ ok: false });
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const streams = await provider.resolveStream('https://damitv.st/embed/?id=fixture', 'basketball', 'Fixture');
    expect(streams.length).toBeGreaterThan(0);
    const log = warn.mock.calls.map(call => call.join(' ')).join('\n');
    expect(log).toContain(`"phase":"${phase}"`);
    expect(log).toContain(expected);
    expect(log).not.toContain('secret');
  } finally { warn.mockRestore(); }
});
