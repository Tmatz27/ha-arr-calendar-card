/*
 * Arr Calendar Card for Home Assistant
 * Copyright (c) 2026 Tmatz27
 *
 * Calendar UX concepts are adapted from martinargalas/ha-arr-stack-card,
 * Copyright (c) martinargalas, licensed under the MIT License.
 */

const CARD_VERSION = '0.2.0';
const CARD_VERSION = '0.1.0';
const FILTER_KEY = 'arr-calendar-card.filter';
const DEFAULT_CONFIG = {
  week_start: 'monday',
  default_filter: 'all',
  include_radarr2: true,
  include_sonarr2: true,
  show_empty_days: true,
  card_height: '720px',
  card_height: '620px',
  item_density: 'comfortable',
  refresh_interval: 300,
  show_episode_title: true,
  show_series_title: true,
  show_instance_badges: true,
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
    this._timer = undefined;
    this._filter = localStorage.getItem(FILTER_KEY) || DEFAULT_CONFIG.default_filter;
  }

  setConfig(config) {
    this._config = { ...DEFAULT_CONFIG, ...(config || {}) };
    this._filter = localStorage.getItem(FILTER_KEY) || this._config.default_filter || 'all';
    this._render();
    this._scheduleRefresh(true);
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._loadedOnce) this._fetchCalendar();
  }

  disconnectedCallback() { clearInterval(this._timer); }
  getCardSize() { return 6; }

  _scheduleRefresh(immediate = false) {
    clearInterval(this._timer);
    const seconds = Number(this._config.refresh_interval || 0);
    if (seconds > 0) this._timer = setInterval(() => this._fetchCalendar(), seconds * 1000);
    if (immediate && this._hass) this._fetchCalendar();
  }

  _weekStartDate() {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    const desired = this._config.week_start === 'sunday' ? 0 : 1;
    const diff = (base.getDay() - desired + 7) % 7;
    base.setDate(base.getDate() - diff + this._weekOffset * 7);
    return base;
  }

  _weekDates() {
    const start = this._weekStartDate();
    return Array.from({ length: 7 }, (_, idx) => {
      const d = new Date(start);
      d.setDate(start.getDate() + idx);
      return d;
    });
  }

  async _fetchCalendar() {
    if (!this._hass) return;
    this._loading = true;
    this._errors = [];
    this._render();
    const { start, end } = this._range();
    const results = await Promise.all(SERVICES
      .filter((svc) => !svc.flag || this._config[svc.flag])
      .map((svc) => this._fetchService(svc, start, end)));
    this._items = results.flat().sort((a, b) => a.sortTime - b.sortTime || a.title.localeCompare(b.title));
    this._loading = false;
    this._loadedOnce = true;
    this._render();
  }

  _range() {
    const dates = this._weekDates();
    const start = dates[0].toISOString().slice(0, 10);
    const endDate = new Date(dates[6]);
    endDate.setDate(endDate.getDate() + 1);
    return { start, end: endDate.toISOString().slice(0, 10) };
  }

  async _fetchService(svc, start, end) {
    const paths = svc.type === 'movie'
      ? [`arr_stack/${svc.key}/calendar?start=${start}&end=${end}`, `arr_stack/${svc.key}/api/v3/calendar?start=${start}&end=${end}`]
      : [`arr_stack/${svc.key}/calendar?start=${start}&end=${end}&includeSeries=true`, `arr_stack/${svc.key}/api/v3/calendar?start=${start}&end=${end}&includeSeries=true`];
    for (const path of paths) {
      try {
        const data = await this._hass.callApi('GET', path);
        const list = Array.isArray(data) ? data : (data?.items || data?.results || []);
        return list.map((raw) => this._normalize(raw, svc)).filter(Boolean);
      } catch (err) {
        if (path === paths[paths.length - 1]) this._errors.push(`${svc.label}: ${err?.message || err}`);
      }
    }
    return [];
  }

  _normalize(raw, svc) {
    const dateValue = raw.airDateUtc || raw.airDate || raw.inCinemas || raw.digitalRelease || raw.physicalRelease || raw.releaseDate;
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    const series = raw.series || {};
    const images = raw.images || series.images || [];
    const poster = this._poster(images, svc.key) || this._poster(raw.movie?.images || [], svc.key);
    return {
      type: svc.type, instance: svc.label, dateKey: date.toISOString().slice(0, 10), sortTime: date.getTime(),
      title: svc.type === 'movie' ? (raw.title || raw.movie?.title || 'Untitled movie') : (series.title || raw.seriesTitle || 'Untitled series'),
      subtitle: svc.type === 'movie' ? this._movieSubtitle(raw) : this._episodeSubtitle(raw),
      episodeTitle: raw.title || raw.episodeTitle || '', poster, monitored: raw.monitored !== false,
    };
  }

  _poster(images, svcKey) {
    const img = (images || []).find((i) => ['poster', 'cover'].includes(i.coverType)) || (images || [])[0];
    if (!img) return '';
    const url = img.remoteUrl || img.url;
    if (!url) return '';
    return url.startsWith('http') ? `/api/arr_stack/${svcKey}/image?url=${encodeURIComponent(url)}` : url;
  }

  _movieSubtitle(raw) { return raw.inCinemas ? `In cinemas ${this._fmtDate(raw.inCinemas)}` : 'Movie'; }
  _episodeSubtitle(raw) {
    const s = raw.seasonNumber ?? raw.season; const e = raw.episodeNumber ?? raw.episode;
    const se = s != null && e != null ? `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}` : 'Episode';
    return this._config.show_episode_title && raw.title ? `${se} · ${raw.title}` : se;
  }

  _filteredItems(dayKey) {
    return this._items.filter((item) => item.dateKey === dayKey && (this._filter === 'all' || (this._filter === 'movies' ? item.type === 'movie' : item.type === 'episode')));
  }

  _render() {
    if (!this.shadowRoot) return;
    const dates = this._weekDates();
    const todayKey = new Date().toISOString().slice(0, 10);
    this.shadowRoot.innerHTML = `${this._styles()}<ha-card><div class="wrap" style="height:${this._config.card_height}">
      <header><div><h2>Arr Calendar</h2><span>${this._fmtDate(dates[0])} – ${this._fmtDate(dates[6])}</span></div><div class="controls">
        ${this._button('first','⏮','First week')} ${this._button('prev','‹','Previous week')} ${this._button('today','Today','Today')} ${this._button('next','›','Next week')} ${this._button('last','⏭','Last week')}
      </div></header>
      <nav>${['all','shows','movies'].map((f)=>`<button data-filter="${f}" class="${this._filter===f?'active':''}">${f[0].toUpperCase()+f.slice(1)}</button>`).join('')}</nav>
      ${this._loading ? '<div class="state">Loading calendar…</div>' : this._errors.length && !this._items.length ? `<div class="state error">Arr Stack API unavailable<br><small>${this._errors.join('<br>')}</small></div>` : ''}
      ${!this._loading ? `<section class="grid ${this._config.item_density}">${dates.map((d)=>this._day(d,todayKey)).join('')}</section>` : ''}
    </div></ha-card>`;
    this._wireEvents();
  }

  _button(action, label, title) { return `<button data-action="${action}" title="${title}">${label}</button>`; }
  _day(date, todayKey) {
    const key = date.toISOString().slice(0, 10); const items = this._filteredItems(key);
    if (!items.length && !this._config.show_empty_days) return '';
    return `<article class="day ${key===todayKey?'today':''}"><h3><b>${date.toLocaleDateString(undefined,{weekday:'short'})}</b><span>${date.getDate()}</span></h3><div class="items">${items.length ? items.map((i)=>this._item(i)).join('') : '<p class="empty">No releases</p>'}</div></article>`;
  }
  _item(item) { return `<div class="item ${item.type}">${item.poster ? `<img src="${item.poster}" loading="lazy">` : '<div class="noimg">🎬</div>'}<div class="meta"><div class="badges"><span>${item.type==='movie'?'Movie':'Show'}</span>${this._config.show_instance_badges?`<span>${item.instance}</span>`:''}</div>${this._config.show_series_title || item.type==='movie' ? `<strong>${item.title}</strong>`:''}<small>${item.subtitle}</small></div></div>`; }
  _wireEvents() {
    this.shadowRoot.querySelectorAll('[data-filter]').forEach((btn)=>btn.onclick=()=>{ this._filter=btn.dataset.filter; localStorage.setItem(FILTER_KEY,this._filter); this._render(); });
    this.shadowRoot.querySelectorAll('[data-action]').forEach((btn)=>btn.onclick=()=>{ const a=btn.dataset.action; if(a==='prev')this._weekOffset--; if(a==='next')this._weekOffset++; if(a==='today')this._weekOffset=0; if(a==='first')this._weekOffset=-52; if(a==='last')this._weekOffset=52; this._fetchCalendar(); });
  }
  _fmtDate(value) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  _styles() { return `<style>
    :host{display:block;color:var(--primary-text-color)}ha-card{overflow:hidden;background:var(--ha-card-background,var(--card-background-color,#fff))}.wrap{display:flex;flex-direction:column;min-height:360px}header{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:16px 16px 8px}h2{margin:0;font-size:1.25rem}header span{color:var(--secondary-text-color);font-size:.9rem}.controls,nav{display:flex;gap:6px;flex-wrap:wrap}button{border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);border-radius:999px;padding:7px 10px;cursor:pointer}button:hover,button.active{border-color:var(--primary-color);background:color-mix(in srgb,var(--primary-color) 16%,transparent)}nav{padding:0 16px 12px}.grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;padding:0 16px 16px;min-height:0;flex:1}.day{border:1px solid var(--divider-color);border-radius:14px;display:flex;flex-direction:column;min-height:0;background:color-mix(in srgb,var(--card-background-color) 92%,var(--primary-text-color) 8%)}.day.today{border-color:var(--primary-color);box-shadow:0 0 0 1px var(--primary-color) inset}.day h3{margin:0;padding:10px 12px;display:flex;justify-content:space-between;border-bottom:1px solid var(--divider-color)}.today h3{color:var(--primary-color)}.items{overflow:auto;padding:8px;display:flex;flex-direction:column;gap:8px}.item{display:flex;gap:8px;border-radius:12px;padding:6px;background:rgba(0,0,0,.05)}img,.noimg{width:46px;min-width:46px;height:69px;object-fit:cover;border-radius:8px;background:#222;display:grid;place-items:center}.compact img,.compact .noimg{width:36px;min-width:36px;height:54px}.meta{min-width:0}.meta strong{display:block;font-size:.9rem;line-height:1.15;overflow:hidden;text-overflow:ellipsis}.meta small{color:var(--secondary-text-color);font-size:.78rem}.badges{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:3px}.badges span{font-size:.65rem;border-radius:999px;padding:2px 6px;background:color-mix(in srgb,var(--primary-color) 18%,transparent)}.movie .badges span:first-child{background:rgba(255,152,0,.24)}.empty,.state{color:var(--secondary-text-color);text-align:center;margin:auto;padding:24px}.error{color:var(--error-color,#db4437)}@media(max-width:760px){.wrap{height:auto!important;max-height:none}header{align-items:flex-start;flex-direction:column}.grid{display:flex;flex-direction:column}.day{max-height:260px}.items{flex-direction:row;overflow-x:auto}.item{min-width:220px}}
  </style>`; }
}

class ArrCalendarCardEditor extends HTMLElement {
  constructor() { super(); this._config = { ...DEFAULT_CONFIG }; }
  setConfig(config) { this._config = { ...DEFAULT_CONFIG, ...(config || {}) }; this._render(); }
  set hass(hass) { this._hass = hass; }
  _render() {
    this.innerHTML = `<div class="editor">${Object.entries(DEFAULT_CONFIG).map(([k,v])=>`<label>${k}<input data-key="${k}" type="${typeof v==='boolean'?'checkbox':typeof v==='number'?'number':'text'}" ${typeof v==='boolean'&&this._config[k]?'checked':''} value="${this._config[k]}"></label>`).join('')}</div><style>.editor{display:grid;gap:12px}label{display:grid;gap:4px}input{padding:8px}</style>`;
    this.querySelectorAll('input').forEach((input)=>input.onchange=()=>{ const key=input.dataset.key; const old=DEFAULT_CONFIG[key]; const value=typeof old==='boolean'?input.checked:typeof old==='number'?Number(input.value):input.value; this._config={...this._config,[key]:value}; this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:this._config},bubbles:true,composed:true})); });
  }
}

customElements.define('arr-calendar-card', ArrCalendarCard);
customElements.define('arr-calendar-card-editor', ArrCalendarCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'arr-calendar-card', name: 'Arr Calendar Card', description: 'Standalone weekly Radarr/Sonarr calendar using the Arr Stack Integration proxy.' });
console.info(`%c ARR-CALENDAR-CARD %c v${CARD_VERSION} `, 'color:white;background:#03a9f4;font-weight:bold;', 'color:#03a9f4;background:white;font-weight:bold;');
