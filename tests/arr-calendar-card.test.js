import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

process.env.TZ = 'America/Denver';

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
  document: {
    visibilityState: 'visible',
    createElement() { return {}; },
    addEventListener() {},
    removeEventListener() {},
  },
  HTMLElement,
  localStorage: { getItem() { return null; }, setItem() {} },
  window: { customCards: [] },
  setInterval,
  clearInterval,
};
vm.runInNewContext(fs.readFileSync('arr-calendar-card.js', 'utf8'), context);
const Card = definitions.get('arr-calendar-card');

test('provides a customizable title that can be hidden', () => {
  const config = Card.getStubConfig();
  assert.equal(config.title, 'Arr Calendar');
  assert.equal(config.show_title, true);
  assert.equal(config.compact_header, false);
});

test('uses conservative service and refresh defaults', () => {
  const config = Card.getStubConfig();
  assert.equal(config.refresh_interval, 21600);
  assert.equal(config.include_radarr2, false);
  assert.equal(config.include_sonarr2, false);
  assert.equal(config.show_empty_days, true);
  assert.equal(config.show_bluf, false);
});

test('supports today-first and calendar-week start modes', () => {
  const card = new Card();
  card._now = () => new Date(2026, 6, 23, 12);
  card._config = { ...card._config, start_mode: 'today' };
  assert.equal(card._dateKey(card._startDate(0)), '2026-07-23');
  card._config = { ...card._config, start_mode: 'week', week_start: 'monday' };
  assert.equal(card._dateKey(card._startDate(0)), '2026-07-20');
  card._config.week_start = 'sunday';
  assert.equal(card._dateKey(card._startDate(0)), '2026-07-19');
});

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

test('starts with today and always returns the configured consecutive day count', () => {
  const card = new Card();
  card._daysToShow = 3;
  const dates = card._visibleDates();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  assert.equal(dates.length, 3);
  assert.equal(dates[0].getTime(), today.getTime());
  assert.equal((dates[2].getTime() - dates[0].getTime()) / 86400000, 2);
});

test('uses only Radarr digital release dates for movies', () => {
  const card = new Card();
  const radarr = { type: 'movie', label: 'Radarr', key: 'radarr' };
  assert.equal(card._normalize({
    title: 'Digital movie',
    inCinemas: '2026-07-01T00:00:00Z',
    digitalRelease: '2026-08-15T00:00:00Z',
  }, radarr).dateKey, '2026-08-15');
  assert.equal(card._normalize({
    title: 'Theatrical only',
    inCinemas: '2026-07-01T00:00:00Z',
    physicalRelease: '2026-10-01T00:00:00Z',
  }, radarr), null);
});

test('keeps Radarr calendar dates stable while converting Sonarr air times locally', () => {
  const card = new Card();
  const movie = card._normalize({
    title: 'Midnight release',
    digitalRelease: '2026-08-15T00:00:00Z',
  }, { type: 'movie', label: 'Radarr', key: 'radarr' });
  assert.equal(movie.dateKey, '2026-08-15');
  assert.equal(movie.hasReleaseTime, false);

  const episode = card._normalize({
    title: 'Episode',
    airDateUtc: '2026-08-15T01:00:00Z',
    series: { title: 'Local show', images: [] },
  }, { type: 'episode', label: 'Sonarr', key: 'sonarr' });
  assert.equal(episode.dateKey, '2026-08-14');
  assert.equal(episode.releaseTime.getHours(), 19);
  assert.equal(episode.hasReleaseTime, true);
});

test('formats consecutive episode releases as compact ranges', () => {
  const card = new Card();
  assert.equal(card._episodeSummary([
    { season: 5, episode: 3 },
    { season: 5, episode: 1 },
    { season: 5, episode: 2 },
    { season: 5, episode: 4 },
  ]), 'S05E01-E04');
  assert.equal(card._episodeSummary([
    { season: 1, episode: 15 },
    { season: 1, episode: 16 },
    { season: 2, episode: 1 },
  ]), 'S01E15-E16, S02E01');
});

test('derives optional release statuses without requiring a badge', () => {
  const card = new Card();
  assert.equal(card._status({ hasFile: true, monitored: true }), 'Downloaded');
  assert.equal(card._status({ status: 'queued' }), 'Queued');
  assert.equal(card._status({ monitored: false }), 'Unmonitored');
  assert.equal(card._status({ monitored: true }), 'Monitored');
  assert.equal(card._status({}), '');
});

test('aggregates mixed episode statuses for collapsed releases', () => {
  const card = new Card();
  const common = {
    type: 'episode',
    instance: 'Sonarr',
    instanceKey: 'sonarr',
    dateKey: '2026-07-23',
    title: 'Example Show',
    sortTime: 1,
    releaseTime: new Date(2026, 6, 23, 20),
    hasReleaseTime: true,
    season: 1,
  };
  const [group] = card._collapseEpisodes([
    { ...common, episode: 1, episodeTitle: 'One', status: 'Downloaded' },
    { ...common, episode: 2, episodeTitle: 'Two', status: 'Downloaded' },
    { ...common, episode: 3, episodeTitle: 'Three', status: 'Monitored' },
  ]);
  assert.equal(group.status, '2/3 downloaded');
  assert.deepEqual(Array.from(group.episodes, (episode) => episode.status), [
    'Downloaded', 'Downloaded', 'Monitored',
  ]);
});

test('keeps the release timestamp for optional tile times and details', () => {
  const card = new Card();
  const result = card._normalize({
    title: 'Episode title',
    airDateUtc: '2026-07-19T20:30:00Z',
    series: { title: 'Example show', images: [] },
  }, { type: 'episode', label: 'Sonarr', key: 'sonarr' });
  assert.equal(result.releaseTime.getTime(), new Date('2026-07-19T20:30:00Z').getTime());
});

test('reports Home Assistant masonry and sections sizes from card height', () => {
  const card = new Card();
  card._config.card_height = '720px';
  assert.equal(card.getCardSize(), 15);
  assert.deepEqual({ ...card.getGridOptions() }, {
    columns: 12,
    min_columns: 6,
    rows: 12,
    min_rows: 6,
  });
});

test('builds an optional BLUF from the active filter and visible dates', () => {
  const card = new Card();
  card._now = () => new Date(2026, 6, 23, 12);
  card._daysToShow = 3;
  const dates = card._visibleDates();
  const summary = card._bluf(dates, [{
    type: 'movie',
    title: 'Tomorrow Movie',
    dateKey: '2026-07-24',
    sortTime: new Date(2026, 6, 24).getTime(),
    releaseTime: new Date(2026, 6, 24),
    hasReleaseTime: false,
  }], '2026-07-23');
  assert.match(summary, /Today:<\/b> No releases/);
  assert.match(summary, /Next:<\/b> Tomorrow Movie/);
  assert.match(summary, /Fri, Jul 24/);
});

test('restarts refresh scheduling when Home Assistant reconnects the card', () => {
  const card = new Card();
  let schedules = 0;
  card._scheduleRefresh = () => { schedules += 1; };
  card._hass = {};
  card._hasLoaded = true;
  card._lastFetch = Date.now();
  card.connectedCallback();
  assert.equal(schedules, 1);
  card.disconnectedCallback();
});

test('keeps existing calendar content visible during background refreshes', async () => {
  const card = new Card();
  card._render = () => {};
  card._hasLoaded = true;
  card._loading = false;
  card._items = [{ type: 'movie', title: 'Existing release' }];
  card._config = { ...card._config, include_radarr2: false, include_sonarr2: false };
  card._hass = { callApi: async () => [] };
  const refresh = card._fetchCalendar();
  assert.equal(card._loading, false);
  assert.equal(card._refreshing, true);
  assert.equal(card._items[0].title, 'Existing release');
  await refresh;
  assert.equal(card._refreshing, false);
  assert.equal(card._items.length, 0);
});
