import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const definitions = new Map();
class HTMLElement {
  attachShadow() { this.shadowRoot = {}; }
}
const context = {
  console: { info() {} },
  customElements: {
    define(name, constructor) { definitions.set(name, constructor); },
    get(name) { return definitions.get(name); },
  },
  document: { createElement() { return {}; } },
  HTMLElement,
  localStorage: { getItem() { return null; }, setItem() {} },
  window: { customCards: [] },
  setInterval,
  clearInterval,
};
vm.runInNewContext(fs.readFileSync('arr-calendar-card.js', 'utf8'), context);
const Card = definitions.get('arr-calendar-card');

test('collapses episodes from the same series, instance, and day', () => {
  const card = new Card();
  const common = {
    type: 'episode', instance: 'Sonarr', instanceKey: 'sonarr', dateKey: '2026-07-13',
    title: 'Example Show', sortTime: 1, poster: '/poster.jpg', season: 2,
  };
  const result = card._collapseEpisodes([
    { ...common, episode: 1, episodeTitle: 'One' },
    { ...common, episode: 2, episodeTitle: 'Two' },
  ]);
  assert.equal(result.length, 1);
  assert.deepEqual(Array.from(result[0].episodes, (episode) => episode.episode), [1, 2]);
});

test('does not collapse movies or episodes from different instances', () => {
  const card = new Card();
  const result = card._collapseEpisodes([
    { type: 'movie', instanceKey: 'radarr', dateKey: '2026-07-13', title: 'Movie', sortTime: 1 },
    { type: 'movie', instanceKey: 'radarr', dateKey: '2026-07-13', title: 'Movie', sortTime: 2 },
    { type: 'episode', instanceKey: 'sonarr', dateKey: '2026-07-13', title: 'Show', sortTime: 3 },
    { type: 'episode', instanceKey: 'sonarr2', dateKey: '2026-07-13', title: 'Show', sortTime: 4 },
  ]);
  assert.equal(result.length, 4);
});

test('provides current and legacy authenticated proxy routes for MediaCover posters', () => {
  const card = new Card();
  assert.deepEqual(Array.from(card._posters(
    [{ coverType: 'poster', url: '/MediaCover/42/poster.jpg?lastWrite=1', remoteUrl: 'https://image.tmdb.org/poster.jpg' }], 'radarr',
  )), [
    '/api/arr_stack/radarr/MediaCover/42/poster.jpg?lastWrite=1',
    '/api/arr_stack/radarr/api/v3/MediaCover/42/poster.jpg?lastWrite=1',
    'https://image.tmdb.org/poster.jpg',
  ]);
  assert.deepEqual(Array.from(card._posters(
    [{ remoteUrl: 'https://sonarr.internal/api/v3/MediaCover/7/poster.jpg' }], 'sonarr',
  )), [
    '/api/arr_stack/sonarr/MediaCover/7/poster.jpg',
    '/api/arr_stack/sonarr/api/v3/MediaCover/7/poster.jpg',
  ]);
});

test('rejects artwork that cannot be served by the Arr Stack proxy', () => {
  const card = new Card();
  assert.deepEqual(Array.from(card._posters([{ url: '/not-media-cover/poster.jpg' }], 'radarr')), []);
});

test('shows a configurable number of days while keeping seven as the default', () => {
  const card = new Card();
  card._config = { ...card._config, days_to_show: 2 };
  assert.equal(card._visibleDates().length, 2);
  card._config.days_to_show = 7;
  assert.equal(card._visibleDates().length, 7);
});
