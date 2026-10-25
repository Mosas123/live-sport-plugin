'use strict';

const SkTechCrypto = require('./SkTechCrypto');
const SkTechEmbedExtractor = require('./SkTechEmbedExtractor');
const SkTechMatchResolver = require('./SkTechMatchResolver');
const SkTechChannelResolver = require('./SkTechChannelResolver');

module.exports = {
  crypto: SkTechCrypto,
  embedExtractor: SkTechEmbedExtractor,
  matchResolver: SkTechMatchResolver,
  channelResolver: SkTechChannelResolver
};
