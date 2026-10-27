'use strict';
const NflVideoProvider = require('../src/providers/NflVideoProvider');

describe('NFLVideo relative stream links', () => {
  test('continues to the next replay when one extractor fails', async () => {
    const provider = new NflVideoProvider();
    provider.fetchPage.fire = jest.fn().mockResolvedValue('<a href="https://byse.example/embed/1">Watch</a><a href="https://cdn.example/game.mp4">Watch</a>');
    provider._extractByse = jest.fn().mockRejectedValue(new Error('fixture extractor failed'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try { expect((await provider.resolveStream('https://nfl-video.com/games/replay')).map(s => s.url)).toEqual(['https://cdn.example/game.mp4']); }
    finally { log.mockRestore(); }
  });
  test('resolves a relative media link against the replay page', async () => {
    const provider = new NflVideoProvider();
    provider.fetchPage.fire = jest.fn().mockResolvedValue('<a href="../video/game.mp4">Watch replay</a>');
    const streams = await provider.resolveStream('https://nfl-video.com/games/replay');
    expect(streams.map(s => s.url)).toEqual(['https://nfl-video.com/video/game.mp4']);
  });
  test('resolves a relative bridge and its iframe against their respective pages', async () => {
    const provider = new NflVideoProvider();
    provider.fetchPage.fire = jest.fn(async url => {
      if (url === 'https://nfl-video.com/games/replay') return '<a href="../bridge/123">Watch</a>';
      if (url === 'https://nfl-video.com/bridge/123') return '<iframe src="../video/game.m3u8"></iframe>';
      throw new Error(`Unexpected URL: ${url}`);
    });
    const streams = await provider.resolveStream('https://nfl-video.com/games/replay');
    expect(streams.map(s => s.url)).toEqual(['https://nfl-video.com/video/game.m3u8']);
  });
  test('keeps absolute media links while rejecting non-HTTP links', async () => {
    const provider = new NflVideoProvider();
    provider.fetchPage.fire = jest.fn().mockResolvedValue('<a href="javascript:game.mp4">Watch</a><a href="https://cdn.example/game.mp4">Watch</a>');
    const streams = await provider.resolveStream('https://nfl-video.com/games/replay');
    expect(streams.map(s => s.url)).toEqual(['https://cdn.example/game.mp4']);
  });
});
