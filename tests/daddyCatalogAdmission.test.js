'use strict';
jest.mock('../src/services/ProviderOutbound', () => ({ safeFetch: jest.fn() }));
const DaddyLiveProvider = require('../src/providers/DaddyLiveProvider');
const { safeFetch } = require('../src/services/ProviderOutbound');

test('schedule and channel fetches are tagged for bounded catalog admission', async () => {
  const circuitBreaker = { wrapSync: (_name, fn) => ({ fire: fn }) };
  const provider = new DaddyLiveProvider({ circuitBreaker });
  provider.proxyFetch = jest.fn(async () => ({ ok: true, text: async () => '<html>fixture</html>' }));
  provider.parseScheduleHtml = jest.fn(() => ({ fixture: true }));
  await provider.fetchSchedule.fire();
  await provider.fetchChannels.fire();
  expect(provider.proxyFetch).toHaveBeenCalledTimes(2);
  for (const call of provider.proxyFetch.mock.calls) expect(call[1]).toMatchObject({ diagnosticOwner: 'catalog', attempts: 1 });
});

test('schedule priority reaches the guarded transport through the real provider wrapper', async () => {
  const circuitBreaker = { wrapSync: (_name, fn) => ({ fire: fn }) };
  const provider = new DaddyLiveProvider({ circuitBreaker });
  provider.parseScheduleHtml = jest.fn(() => ({ fixture: true }));
  safeFetch.mockResolvedValueOnce({ ok: true, text: async () => 'fixture' });
  await provider.fetchSchedule.fire();
  expect(safeFetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ diagnosticOwner: 'catalog' }));
});
