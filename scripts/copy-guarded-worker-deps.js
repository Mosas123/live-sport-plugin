'use strict';
const fs = require('node:fs');
const path = require('node:path');
const destination = process.argv[2];
if (!destination) throw new Error('Build output directory required');
const services = ['ProviderOutbound', 'ProviderRequestHeaders', 'SharedOutboundFetch', 'GuardedOutbound', 'OutboundUrlGuard', 'NativeGuardedFetch', 'NativeGuardedSlot', 'NativeExclusiveSlot', 'NativeSocksConnection'];
fs.mkdirSync(path.join(destination, 'services'), { recursive: true });
for (const service of services) fs.copyFileSync(path.join('src', 'services', `${service}.js`), path.join(destination, 'services', `${service}.js`));
fs.copyFileSync(path.join('src', 'impitClient.js'), path.join(destination, 'impitClient.js'));
