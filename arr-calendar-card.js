/*
 * Arr Calendar Card for Home Assistant
 * Copyright (c) 2026 Tmatz27
 *
 * Calendar UX concepts are adapted from martinargalas/ha-arr-stack-card,
 * Copyright (c) martinargalas, licensed under the MIT License.
 */

const CARD_VERSION = '0.4.1';
const FILTER_KEY = 'arr-calendar-card.filter';
const DEFAULT_CONFIG = {
  week_start: 'monday',
  default_filter: 'all',
  include_radarr2: true,
  include_sonarr2: true,
  show_empty_days: true,
  card_height: '720px',
  item_density: 'comfortable',
  refresh_interval: 300,
  show_episode_title: true,
  show_series_title: true,
  show_instance_badges: true,
  days_to_show: 7,
};
const SERVICES = [
  { key: 'radarr', type: 'movie', label: 'Radarr' },
  { key: 'sonarr', type: 'episode', label: 'Sonarr' },
  { key: 'radarr2', type: 'movie', label: 'Radarr 2', flag: 'include_radarr2' },
  { key: 'sonarr2', type: 'episode', label: 'Sonarr 2', flag: 'include_sonarr2' },
];

const html = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

class ArrCalendarCard extends HTMLElement {
  static getConfigElement() { return document.createElement('arr-calendar-card-editor'); }
  static getStubConfig() { return { ...DEFAULT_CONFIG }; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = { ...DEFAULT_CONFIG };
    this._items = [];
    this._errors = [];
    this._loading = true;
    this._weekOffset = 0;
    this._dayOffset = 0;
    this._request = 0;
    this._filter = localStorage.getItem(FILTER_KEY) || DEFAULT_CONFIG.default_filter;
  }

  setConfig(config) {
    if (!config) throw new Error('Arr Calendar Card requires a configuration.');
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._dayOffset = 0;
    this._filter = localStorage.getItem(FILTER_KEY) || this._config.default_filter;
    this._render();
    this._scheduleRefresh(true);
  }

  set hass(hass) {
    const firstUpdate = !this._hass;
    this._hass = hass;
    if (firstUpdate) this._fetchCalendar();
  }

  disconnectedCallback() { clearInterval(this._timer); }
  getCardSize() { return 8; }

  _scheduleRefresh(immediate = false) {
    clearInterval(this._timer);
    const seconds = Number(this._config.refresh_interval);
    if (seconds > 0) this._timer = setInterval(() => this._fetchCalendar(), seconds * 1000);
    if (immediate && this._hass) this._fetchCalendar();
  }

  _weekStartDate(offset = this._weekOffset) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    const firstDay = this._config.week_start === 'sunday' ? 0 : 1;
    date.setDate(date.getDate() - ((date.getDay() - firstDay + 7) % 7) + offset * 7);
    return date;
  }

  _weekDates() {
    const start = this._weekStartDate();
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }

  _visibleDates() {
    const count = Math.max(1, Math.min(7, Number(this._config.days_to_show) || 7));
    return this._weekDates().slice(this._dayOffset, this._dayOffset + count);
  }

  _dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async _fetchCalendar() {
    if (!this._hass) return;
    const request = ++this._request;
    this._loading = true;
    this._errors = [];
    this._render();
    const dates = this._weekDates();
    const end = new Date(dates[6]);
    end.setDate(end.getDate() + 1);
    const services = SERVICES.filter((service) => !service.flag || this._config[service.flag]);
    const results = await Promise.all(services.map((service) => (
      this._fetchService(service, this._dateKey(dates[0]), this._dateKey(end))
    )));
    if (request !== this._request) return;
    this._items = this._collapseEpisodes(results.flat());
    this._loading = false;
    this._render();
  }

  async _fetchService(service, start, end) {
    const query = `start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${service.type === 'episode' ? '&includeSeries=true' : ''}`;
    const paths = [
      `arr_stack/${service.key}/calendar?${query}`,
      `arr_stack/${service.key}/api/v3/calendar?${query}`,
    ];
    for (const [index, path] of paths.entries()) {
      try {
        const response = await this._hass.callApi('GET', path);
        const entries = Array.isArray(response) ? response : (response?.items || response?.results || []);
        return entries.map((entry) => this._normalize(entry, service)).filter(Boolean);
      } catch (error) {
        if (index === paths.length - 1) {
          this._errors.push(`${service.label}: ${error?.message || 'unavailable'}`);
        }
      }
    }
    return [];
  }

  _normalize(raw, service) {
    const dateValue = raw.airDateUtc || raw.airDate || raw.inCinemas || raw.digitalRelease
      || raw.physicalRelease || raw.releaseDate;
    const date = new Date(dateValue);
    if (!dateValue || Number.isNaN(date.getTime())) return null;
    const series = raw.series || {};
    const title = service.type === 'movie'
      ? (raw.title || raw.movie?.title || 'Untitled movie')
      : (series.title || raw.seriesTitle || 'Untitled series');
    const images = service.type === 'movie'
      ? (raw.images || raw.movie?.images || [])
      : (series.images || raw.images || []);
    return {
      type: service.type,
      instance: service.label,
      instanceKey: service.key,
      dateKey: this._dateKey(date),
      sortTime: date.getTime(),
      title,
      episodeTitle: raw.title || raw.episodeTitle || '',
      season: raw.seasonNumber ?? raw.season,
      episode: raw.episodeNumber ?? raw.episode,
      posters: this._posters(images, service.key),
    };
  }

  _posters(images, serviceKey) {
    const image = images.find((entry) => entry.coverType === 'poster') || images[0];
    // Arr returns both a local MediaCover URL and, sometimes, an upstream URL.
    // Always prefer the local URL so artwork travels through HA's authenticated
    // Arr Stack proxy instead of exposing the Arr host to the browser.
    const url = image?.url || image?.remoteUrl;
    if (!url) return [];
    let mediaPath = String(url);
    if (/^https?:\/\//i.test(mediaPath)) mediaPath = mediaPath.replace(/^https?:\/\/[^/]+/i, '');
    const mediaCover = mediaPath.match(/(?:\/api\/v3)?(\/MediaCover\/.*)$/i);
    if (!mediaCover) return /^https?:\/\//i.test(url) ? [String(url)] : [];
    const sources = [
      `/api/arr_stack/${serviceKey}${mediaCover[1]}`,
      `/api/arr_stack/${serviceKey}/api/v3${mediaCover[1]}`,
    ];
    // Radarr/Sonarr commonly include a public TMDB/TVDB remoteUrl beside the
    // protected local MediaCover path. It is a final artwork-only fallback and
    // never exposes the user's Arr server or API key.
    if (/^https?:\/\//i.test(image?.remoteUrl) && image.remoteUrl !== url) sources.push(image.remoteUrl);
    return sources;
  }

  _collapseEpisodes(items) {
    const groups = new Map();
    items.forEach((item) => {
      // Keep movies independent. Episodes for the same series, instance and day share one tile.
      const key = item.type === 'movie'
        ? `movie:${item.instanceKey}:${item.dateKey}:${item.title}:${item.sortTime}`
        : `show:${item.instanceKey}:${item.dateKey}:${item.title}`;
      if (!groups.has(key)) groups.set(key, { ...item, episodes: [] });
      if (item.type === 'episode') {
        groups.get(key).episodes.push({
          season: item.season,
          episode: item.episode,
          title: item.episodeTitle,
        });
      }
    });
    return [...groups.values()].sort((a, b) => a.sortTime - b.sortTime || a.title.localeCompare(b.title));
  }

  _filteredItems(dayKey) {
    return this._items.filter((item) => item.dateKey === dayKey
      && (this._filter === 'all' || (this._filter === 'movies' ? item.type === 'movie' : item.type === 'episode')));
  }

  _render() {
    if (!this.shadowRoot) return;
    const dates = this._visibleDates();
    const todayKey = this._dateKey(new Date());
    const lastDate = dates[dates.length - 1];
    const range = `${this._formatDate(dates[0])} – ${this._formatDate(lastDate)} ${lastDate.getFullYear()}`;
    const visibleItems = this._items.filter((item) => this._filter === 'all'
      || (this._filter === 'movies' ? item.type === 'movie' : item.type === 'episode'));
    let content;
    if (this._loading) {
      content = this._state('progress', 'Loading calendar…', 'Fetching releases from Arr Stack Integration');
    } else if (!this._items.length && this._errors.length) {
      content = this._state('error', 'Calendar unavailable', this._errors.join(' · '));
    } else {
      content = `<section class="week ${html(this._config.item_density)}" style="--visible-days:${dates.length};--week-min:${dates.length * 112}px">${dates.map((date) => this._day(date, todayKey)).join('')}</section>`;
      if (!visibleItems.length) content += this._state('empty-state', 'No releases this week', `Nothing matches the ${this._filter} filter`);
    }

    this.shadowRoot.innerHTML = `${this._styles()}<ha-card>
      <div class="calendar" style="--calendar-height:${html(this._config.card_height)}">
        <header>
          <div class="heading"><h1>Arr Calendar</h1><span>${html(range)}</span></div>
          <nav aria-label="Calendar filters">${['all', 'shows', 'movies'].map((filter) => (
            `<button data-filter="${filter}" class="pill ${this._filter === filter ? 'active' : ''}">${filter[0].toUpperCase() + filter.slice(1)}</button>`
          )).join('')}</nav>
          <div class="header-controls" aria-label="Week navigation">
            ${this._button('first', '«', 'Go back 52 weeks')}${this._button('prev', '‹', 'Previous week')}
            ${this._button('today', 'Today', 'Current week', 'today-button')}
            ${this._button('next', '›', 'Next week')}${this._button('last', '»', 'Go forward 52 weeks')}
          </div>
        </header>
        <div class="content">${content}</div>
        <footer aria-label="Week navigation">
          ${this._button('first', '«', 'Go back 52 weeks')}${this._button('prev', '‹', 'Previous week')}
          ${this._button('today', this._weekOffset === 0 ? 'This week' : 'Today', 'Current week', 'today-button')}
          ${this._button('next', '›', 'Next week')}${this._button('last', '»', 'Go forward 52 weeks')}
        </footer>
        ${this._errors.length && this._items.length ? `<div class="warning" title="${html(this._errors.join('\n'))}">Some instances unavailable</div>` : ''}
      </div>
    </ha-card>`;
    this._wireEvents();
  }

  _state(icon, title, detail) {
    return `<div class="state ${icon}"><strong>${html(title)}</strong><span>${html(detail)}</span></div>`;
  }

  _button(action, label, title, className = '') {
    return `<button class="round ${className}" data-action="${action}" title="${title}" aria-label="${title}">${label}</button>`;
  }

  _day(date, todayKey) {
    const key = this._dateKey(date);
    const items = this._filteredItems(key);
    if (!items.length && !this._config.show_empty_days) return '';
    return `<article class="day ${key === todayKey ? 'today' : ''}">
      <h3><span>${html(date.toLocaleDateString(undefined, { weekday: 'short' }))}</span><b>${date.getDate()}</b></h3>
      <div class="items">${items.length ? items.map((item) => this._item(item)).join('') : '<span class="empty">No releases</span>'}</div>
    </article>`;
  }

  _episodeCode(episode) {
    if (episode.season == null || episode.episode == null) return 'Episode';
    return `S${String(episode.season).padStart(2, '0')}E${String(episode.episode).padStart(2, '0')}`;
  }

  _item(item) {
    const episodes = item.episodes || [];
    const codes = episodes.map((episode) => this._episodeCode(episode));
    const episodeSummary = codes.length > 3 ? `${codes.slice(0, 2).join(' · ')} · +${codes.length - 2}` : codes.join(' · ');
    const titles = episodes.map((episode) => episode.title).filter(Boolean);
    const subtitle = item.type === 'movie' ? '' : (this._config.show_episode_title ? titles.join(' · ') : '');
    return `<div class="release ${item.type}" title="${html(subtitle || item.title)}">
      <div class="no-art" aria-hidden="true">${item.type === 'movie' ? 'MOVIE' : 'SHOW'}</div>
      ${item.posters?.length ? `<img src="${html(item.posters[0])}" data-fallback="${html(item.posters.slice(1).join('|'))}" alt="${html(item.title)} poster" loading="lazy">` : ''}
      <div class="shade"></div>
      <div class="release-content">
        <div class="badges"><span class="kind">${item.type === 'movie' ? 'Movie' : 'Show'}</span>
          ${episodes.length > 1 ? `<span class="count">${episodes.length} episodes</span>` : ''}
          ${this._config.show_instance_badges ? `<span class="instance">${html(item.instance)}</span>` : ''}
        </div>
        ${episodeSummary ? `<span class="episode-code">${html(episodeSummary)}</span>` : ''}
        ${this._config.show_series_title || item.type === 'movie' ? `<strong>${html(item.title)}</strong>` : ''}
        ${subtitle ? `<small>${html(subtitle)}</small>` : ''}
      </div>
    </div>`;
  }

  _wireEvents() {
    this.shadowRoot.querySelectorAll('.release img').forEach((image) => {
      image.addEventListener('error', () => {
        const [next, ...rest] = (image.dataset.fallback || '').split('|').filter(Boolean);
        if (!next) image.remove();
        else {
          image.dataset.fallback = rest.join('|');
          image.src = next;
        }
      });
    });
    this.shadowRoot.querySelectorAll('[data-filter]').forEach((button) => {
      button.onclick = () => {
        this._filter = button.dataset.filter;
        localStorage.setItem(FILTER_KEY, this._filter);
        this._render();
      };
    });
    this.shadowRoot.querySelectorAll('[data-action]').forEach((button) => {
      button.onclick = () => {
        const action = button.dataset.action;
        const count = Math.max(1, Math.min(7, Number(this._config.days_to_show) || 7));
        if (action === 'prev') {
          this._dayOffset -= count;
          if (this._dayOffset < 0) {
            this._weekOffset -= 1;
            this._dayOffset = Math.floor(6 / count) * count;
          }
        }
        if (action === 'next') {
          this._dayOffset += count;
          if (this._dayOffset >= 7) { this._weekOffset += 1; this._dayOffset = 0; }
        }
        if (action === 'today') {
          this._weekOffset = 0;
          const firstDay = this._config.week_start === 'sunday' ? 0 : 1;
          const todayIndex = (new Date().getDay() - firstDay + 7) % 7;
          this._dayOffset = Math.floor(todayIndex / count) * count;
        }
        if (action === 'first') { this._weekOffset -= 52; this._dayOffset = 0; }
        if (action === 'last') { this._weekOffset += 52; this._dayOffset = 0; }
        this._fetchCalendar();
      };
    });
  }

  _formatDate(date) {
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  _styles() { return `<style>
    :host{display:block;color:var(--primary-text-color,#202124);--show-color:var(--info-color,#4285f4);--movie-color:var(--error-color,#e64b40)}
    *{box-sizing:border-box}ha-card{overflow:hidden;background:var(--ha-card-background,var(--card-background-color,#fff));border-radius:var(--ha-card-border-radius,24px)}
    .calendar{height:var(--calendar-height);min-height:420px;display:flex;position:relative;flex-direction:column;background:linear-gradient(145deg,color-mix(in srgb,var(--card-background-color,#fff) 96%,var(--primary-color) 4%),var(--card-background-color,#fff))}
    header{min-height:112px;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;gap:12px;padding:18px 20px;border-bottom:1px solid var(--divider-color,rgba(0,0,0,.12))}.heading{grid-column:1;grid-row:1}.heading h1{font-size:1.35rem;line-height:1.2;margin:0 0 5px;font-weight:700}.heading span{color:var(--secondary-text-color,#777);font-size:.9rem}nav{grid-column:1;grid-row:2;display:flex;gap:6px}.header-controls{grid-column:2;grid-row:1 / span 2;align-self:center;display:flex;gap:7px}
    button{font:inherit;color:inherit;cursor:pointer}.pill,.round{border:1px solid var(--divider-color,rgba(0,0,0,.15));background:color-mix(in srgb,var(--card-background-color,#fff) 88%,var(--primary-text-color) 12%);box-shadow:0 1px 2px rgba(0,0,0,.04)}.pill{padding:7px 14px;border-radius:999px;font-size:.84rem;font-weight:650}.pill:hover,.pill.active{border-color:color-mix(in srgb,var(--primary-color,#4285f4) 60%,transparent);background:color-mix(in srgb,var(--primary-color,#4285f4) 24%,var(--card-background-color,#fff));color:var(--primary-text-color,#202124)}
    .content{flex:1;min-height:0;padding:10px 12px;overflow-x:auto}.week{height:100%;display:grid;grid-template-columns:repeat(var(--visible-days),minmax(112px,1fr));gap:9px;min-width:var(--week-min)}.day{min-width:0;min-height:0;display:flex;flex-direction:column;border:1px solid var(--divider-color,rgba(0,0,0,.12));border-radius:13px;background:color-mix(in srgb,var(--card-background-color,#fff) 88%,var(--primary-text-color) 12%);overflow:hidden}.day.today{border-color:var(--primary-color,#4285f4);box-shadow:inset 0 0 0 1px var(--primary-color,#4285f4)}.day h3{height:62px;flex:none;margin:0;display:flex;align-items:center;justify-content:center;gap:3px;border-bottom:1px solid var(--divider-color,rgba(0,0,0,.12));line-height:1.05}.day h3 span,.day h3 b{font-size:1rem;font-weight:700}.today h3{color:var(--primary-color,#4285f4);background:color-mix(in srgb,var(--primary-color,#4285f4) 12%,transparent)}
    .items{padding:8px;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;display:flex;flex-direction:column;gap:9px;min-height:0}.empty{margin:auto;color:var(--secondary-text-color,#777);font-size:.75rem}.release{position:relative;flex:none;min-height:190px;overflow:hidden;border-radius:10px;background:#263238;border:3px solid var(--show-color);box-shadow:0 1px 3px rgba(0,0,0,.2)}.release.movie{border-color:var(--movie-color)}.release img,.no-art{position:absolute;width:100%;height:100%;inset:0;object-fit:cover}.no-art{display:grid;place-items:center;font-size:.65rem;font-weight:800;letter-spacing:.12em;color:#90a4ae;background:linear-gradient(145deg,#263238,#11181c)}.shade{position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.08) 25%,rgba(0,0,0,.88) 100%)}.release-content{position:relative;z-index:1;height:100%;min-height:144px;padding:7px;display:flex;flex-direction:column;align-items:flex-start;color:#fff;text-shadow:0 1px 2px #000}.badges{width:100%;display:flex;gap:4px;align-items:center;flex-wrap:wrap}.badges span,.episode-code{background:rgba(12,18,24,.78);border-radius:5px;padding:3px 6px;font-size:.64rem;font-weight:700}.kind{border-left:3px solid var(--show-color)}.movie .kind{border-color:var(--movie-color)}.instance{margin-left:auto;color:#ddd}.count{background:color-mix(in srgb,var(--show-color) 75%,#111)!important}.episode-code{margin-top:5px;background:color-mix(in srgb,var(--show-color) 70%,#182030)}.release strong{width:100%;margin-top:auto;font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.release small{width:100%;font-size:.65rem;color:#e5e5e5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
    .compact .release{min-height:92px}.compact .release-content{min-height:86px}.compact .release small{display:none}.spacious .release{min-height:205px}.spacious .release-content{min-height:199px}
    footer{height:70px;flex:none;display:flex;align-items:center;justify-content:center;gap:7px}.round{width:40px;height:40px;border-radius:50%;padding:0;font-size:1.35rem}.today-button{width:auto;border-radius:999px;padding:0 22px;font-size:.78rem;color:var(--secondary-text-color,#777)}.round:hover{border-color:var(--primary-color,#4285f4);background:color-mix(in srgb,var(--primary-color,#4285f4) 18%,var(--card-background-color,#fff))}.state{position:absolute;inset:76px 0 70px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;color:var(--secondary-text-color,#777);text-align:center;padding:20px}.state strong{font-size:1rem;color:var(--primary-text-color,#222)}.state span{font-size:.8rem}.error strong{color:var(--error-color,#e64b40)}.empty-state{pointer-events:none}.empty-state+.state{display:none}.warning{position:absolute;left:15px;bottom:10px;color:var(--warning-color,#f9a825);font-size:.7rem}
    @media(max-width:800px){.calendar{height:auto;min-height:0}header{grid-template-columns:1fr;grid-template-rows:auto auto auto;gap:11px;padding:16px}.heading{grid-column:1;grid-row:1}.header-controls{grid-column:1;grid-row:2;justify-self:start}.header-controls .round{width:36px;height:36px}.header-controls .today-button{width:auto}nav{grid-column:1;grid-row:3}.content{padding:8px;overflow:visible}.week{min-width:var(--week-min);height:auto}.day{min-height:118px;max-height:360px}.day h3{height:48px;flex-direction:row;gap:7px}.day h3 b{margin:0;font-size:1rem}.items{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(150px,45vw);overflow-x:auto;overflow-y:hidden}.release,.compact .release{height:190px;min-height:190px}.release-content,.compact .release-content{min-height:184px}footer{height:62px;position:sticky;bottom:0;background:var(--card-background-color,#fff);z-index:3}.state{position:relative;inset:auto;min-height:250px}.warning{display:none}}
  </style>`; }
}

class ArrCalendarCardEditor extends HTMLElement {
  constructor() { super(); this._config = { ...DEFAULT_CONFIG }; }
  setConfig(config) { this._config = { ...DEFAULT_CONFIG, ...(config || {}) }; this._render(); }
  set hass(hass) { this._hass = hass; }

  _render() {
    const select = (key, options) => `<label><span>${key.replaceAll('_', ' ')}</span><select data-key="${key}">${options.map((option) => `<option ${this._config[key] === option ? 'selected' : ''}>${option}</option>`).join('')}</select></label>`;
    const toggle = (key) => `<label class="toggle"><span>${key.replaceAll('_', ' ')}</span><input data-key="${key}" type="checkbox" ${this._config[key] ? 'checked' : ''}></label>`;
    this.innerHTML = `<div class="editor">
      ${select('week_start', ['monday', 'sunday'])}${select('default_filter', ['all', 'shows', 'movies'])}${select('item_density', ['compact', 'comfortable', 'spacious'])}
      <label><span>card height</span><input data-key="card_height" value="${html(this._config.card_height)}"></label>
      <label><span>refresh interval (seconds)</span><input data-key="refresh_interval" type="number" min="0" value="${Number(this._config.refresh_interval)}"></label>
      <label><span>days to show</span><input data-key="days_to_show" type="number" min="1" max="7" value="${Number(this._config.days_to_show)}"></label>
      ${['include_radarr2', 'include_sonarr2', 'show_empty_days', 'show_episode_title', 'show_series_title', 'show_instance_badges'].map(toggle).join('')}
    </div><style>.editor{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:8px 0}label{display:flex;flex-direction:column;gap:5px;text-transform:capitalize}label span{font-size:12px;color:var(--secondary-text-color)}input,select{border:1px solid var(--divider-color);border-radius:6px;padding:9px;color:var(--primary-text-color);background:var(--card-background-color)}.toggle{flex-direction:row;justify-content:space-between;align-items:center}@media(max-width:600px){.editor{grid-template-columns:1fr}}</style>`;
    this.querySelectorAll('[data-key]').forEach((input) => {
      input.onchange = () => {
        const key = input.dataset.key;
        const fallback = DEFAULT_CONFIG[key];
        const value = typeof fallback === 'boolean' ? input.checked : (typeof fallback === 'number' ? Number(input.value) : input.value);
        this._config = { ...this._config, [key]: value };
        this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
      };
    });
  }
}

if (!customElements.get('arr-calendar-card')) customElements.define('arr-calendar-card', ArrCalendarCard);
if (!customElements.get('arr-calendar-card-editor')) customElements.define('arr-calendar-card-editor', ArrCalendarCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === 'arr-calendar-card')) {
  window.customCards.push({
    type: 'arr-calendar-card',
    name: 'Arr Calendar Card',
    description: 'A dashboard-native weekly calendar for Radarr and Sonarr.',
    preview: true,
  });
}
console.info(`%c ARR-CALENDAR-CARD %c v${CARD_VERSION} `, 'color:white;background:#4285f4;font-weight:bold;', 'color:#4285f4;background:white;font-weight:bold;');
