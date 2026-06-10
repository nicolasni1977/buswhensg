/**
 * BusWhenSG — frontend app.
 * Pure logic lives in ./lib.js (unit-tested); this module wires it to the DOM,
 * the live /api/arrival proxy, and the real LTA bus-stop dataset (stops.json).
 */
import {
  haversineKm,
  findByCode,
  findNearest,
  searchStops,
  frecencyTop,
  arrivalText,
  isValidStopCode,
} from './lib.js';

const AppState = {
  currentLang: 'en',
  isDarkMode: false,
  textSize: 'default',
  selectedStopCode: null,
  lastUpdated: Date.now(),
  refreshInterval: null,
  tickInterval: null,
  map: null,
  stopMarker: null,
  lastRenderedMins: {},
};

// Full Singapore bus-stop list, loaded at startup from stops.json (~5,200 stops).
let STOPS = [];

const TRANSLATIONS = {
  en: {
    skip_to_content: 'Skip to Main Content', quick_favorites: 'Quick Access Favorites',
    search_label: 'Search by Stop Code or Name', search_placeholder: 'Enter 5-digit stop code or name…',
    search_btn: 'Search', near_me: 'Near Me', arrivals: 'Arrivals', updated_ago: 'Updated',
    select_stop_prompt: 'Tap a favourite, search a stop code, or use “Near Me”.',
    loading: 'Fetching live arrivals…', no_data: 'No buses running for this stop right now.',
    not_found: 'Stop not found — try a 5-digit code.', arriving: 'Arriving',
    crowding: { low: 'Seats', med: 'Standing', high: 'Packed' },
  },
  zh: {
    skip_to_content: '跳转到主要内容', quick_favorites: '快速访问收藏',
    search_label: '通过站点代码或名称搜索', search_placeholder: '输入5位站点代码或名称…',
    search_btn: '搜索', near_me: '在我附近', arrivals: '巴士到达', updated_ago: '更新于',
    select_stop_prompt: '点按收藏、搜索站点代码，或使用“在我附近”。',
    loading: '正在获取实时数据…', no_data: '该站点目前没有巴士。',
    not_found: '找不到站点 — 请输入5位代码。', arriving: '即将到达',
    crowding: { low: '有座位', med: '站立', high: '拥挤' },
  },
  ms: {
    skip_to_content: 'Langkau ke Kandungan Utama', quick_favorites: 'Kegemaran Akses Pantas',
    search_label: 'Cari mengikut Kod atau Nama Hentian', search_placeholder: 'Masukkan kod 5-digit atau nama…',
    search_btn: 'Cari', near_me: 'Berdekatan Saya', arrivals: 'Ketibaan', updated_ago: 'Dikemaskini',
    select_stop_prompt: 'Tekan kegemaran, cari kod hentian, atau guna “Berdekatan Saya”.',
    loading: 'Mengambil data masa nyata…', no_data: 'Tiada bas untuk hentian ini sekarang.',
    not_found: 'Hentian tidak dijumpai — cuba kod 5-digit.', arriving: 'Tiba',
    crowding: { low: 'Tempat duduk', med: 'Berdiri', high: 'Penuh' },
  },
};

const CROWDING_ICONS = {
  low: '<svg class="crowding-icon" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
  med: '<svg class="crowding-icon" viewBox="0 0 24 24"><path d="M7 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zM17 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"/></svg>',
  high: '<svg class="crowding-icon" viewBox="0 0 24 24"><path d="M16 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-8 0c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
};
const WC_ICON = '<svg class="wc-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>';

const esc = (str) =>
  !str ? '' : String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** localStorage-backed visit tracking; ranking delegated to the tested frecencyTop(). */
const Frecency = {
  KEY: 'busWhenSG_frecency',
  getAll() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch { return {}; }
  },
  save(data) { localStorage.setItem(this.KEY, JSON.stringify(data)); },
  saveVisit(code) {
    const d = this.getAll();
    if (!d[code]) d[code] = { code, visits: 0, lastVisited: 0, pinned: false, customName: null };
    d[code].visits++; d[code].lastVisited = Date.now();
    this.save(d);
  },
  setPin(code, pinned) { const d = this.getAll(); if (d[code]) { d[code].pinned = pinned; this.save(d); } },
  setCustomName(code, name) { const d = this.getAll(); if (d[code]) { d[code].customName = name; this.save(d); } },
  top(limit = 5) { return frecencyTop(this.getAll(), Date.now(), limit); },
};

/** LIVE: call the same-origin Pages Function proxy (injects the LTA key, normalises). */
const fetchArrivals = async (stopCode) => {
  const res = await fetch(`/api/arrival?stop=${encodeURIComponent(stopCode)}`);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error || ''; } catch {}
    throw new Error(`arrival_fetch_failed ${res.status} ${detail}`);
  }
  return res.json(); // [{ service, dest, arrivals: [{min, crowding, wc}, ...] }, ...]
};

const App = {
  async init() {
    this.loadState();
    this.setupEventListeners();
    await this.loadStops();
    this.initMapLazy();
    this.renderFavorites();
    this.updateLanguageUI();
    this.startTimers();
  },

  async loadStops() {
    try {
      STOPS = await (await fetch('./stops.json')).json();
    } catch (e) {
      console.error('Failed to load stops.json', e);
      STOPS = [];
    }
  },

  loadState() {
    AppState.isDarkMode = localStorage.getItem('theme') === 'dark';
    AppState.textSize = localStorage.getItem('textSize') || 'default';
    AppState.currentLang =
      localStorage.getItem('lang') ||
      (navigator.language.startsWith('zh') ? 'zh' : navigator.language.startsWith('ms') ? 'ms' : 'en');
    document.documentElement.lang = AppState.currentLang;
    this.applyTheme();
  },

  applyTheme() {
    document.body.className = `theme-${AppState.isDarkMode ? 'dark' : 'light'} text-size-${AppState.textSize}`;
  },

  initMapLazy() {
    const wrapper = document.getElementById('map-wrapper');
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { this.initMap(); obs.disconnect(); }
    }, { threshold: 0.05 });
    obs.observe(wrapper);
  },

  initMap() {
    try {
      AppState.map = L.map('map', { zoomControl: false, attributionControl: false }).setView([1.3521, 103.8198], 11);
      const tiles = L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', { maxZoom: 18 });
      tiles.on('tileerror', () => { document.getElementById('map-wrapper').style.display = 'none'; });
      tiles.addTo(AppState.map);
      // A single marker for the selected stop (NOT all ~5,200 — that would kill perf).
      AppState.stopMarker = L.marker([1.3521, 103.8198]);
      const sel = AppState.selectedStopCode && findByCode(AppState.selectedStopCode, STOPS);
      if (sel) this.focusMap(sel);
    } catch (e) {
      console.error('Map init error', e);
    }
  },

  focusMap(stop) {
    if (!AppState.map || !stop) return;
    AppState.stopMarker.setLatLng([stop.lat, stop.lng]).addTo(AppState.map)
      .bindPopup(`<b>${esc(stop.name)}</b><br>${esc(stop.road)} · ${stop.code}`);
    AppState.map.setView([stop.lat, stop.lng], 16);
  },

  setupEventListeners() {
    const doSearch = () => {
      const val = document.getElementById('stop-search').value.trim();
      if (!val) return;
      const hit = searchStops(val, STOPS, 1)[0];
      if (hit) this.updateArrivalResults(hit.code);
      else if (isValidStopCode(val)) this.updateArrivalResults(val);
      else alert(TRANSLATIONS[AppState.currentLang].not_found);
    };
    document.getElementById('search-button').addEventListener('click', doSearch);
    document.getElementById('stop-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

    document.getElementById('geo-button').addEventListener('click', () => this.handleGeolocation());
    document.getElementById('refresh-button').addEventListener('click', () => this.updateArrivalResults(AppState.selectedStopCode));

    document.getElementById('toggle-dark-light').addEventListener('click', () => {
      AppState.isDarkMode = !AppState.isDarkMode;
      localStorage.setItem('theme', AppState.isDarkMode ? 'dark' : 'light');
      this.applyTheme();
    });

    document.getElementById('toggle-text-size').addEventListener('click', (e) => {
      const sizes = ['default', 'large', 'xlarge'];
      const labels = ['A', 'A+', 'A++'];
      const next = (sizes.indexOf(AppState.textSize) + 1) % sizes.length;
      AppState.textSize = sizes[next];
      e.target.textContent = labels[next];
      localStorage.setItem('textSize', AppState.textSize);
      this.applyTheme();
    });

    document.querySelectorAll('.language-toggle button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        AppState.currentLang = e.target.dataset.lang;
        document.documentElement.lang = AppState.currentLang;
        localStorage.setItem('lang', AppState.currentLang);
        this.updateLanguageUI();
        this.renderFavorites();
        if (AppState.selectedStopCode) this.updateArrivalResults(AppState.selectedStopCode);
      });
    });

    const fav = document.getElementById('favorites-container');
    fav.addEventListener('click', (e) => {
      const card = e.target.closest('.favorite-card');
      if (card) this.updateArrivalResults(card.dataset.code);
    });
    fav.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('.favorite-card');
      if (card) { e.preventDefault(); this.handleFavoriteMenu(card.dataset.code); }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        clearInterval(AppState.refreshInterval);
        AppState.refreshInterval = null;
      } else if (!AppState.refreshInterval && AppState.selectedStopCode) {
        this.startRefreshTimer();
      }
    });
  },

  updateLanguageUI() {
    const t = TRANSLATIONS[AppState.currentLang];
    document.getElementById('stop-search').placeholder = t.search_placeholder;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (t[key]) el.textContent = t[key];
    });
    document.querySelectorAll('.language-toggle button').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.lang === AppState.currentLang);
    });
  },

  renderFavorites() {
    const container = document.getElementById('favorites-container');
    container.innerHTML = Frecency.top().map((fav) => {
      const detail = findByCode(fav.code, STOPS);
      const name = fav.customName || detail?.name || `Stop ${fav.code}`;
      const road = detail?.road || '';
      return `<button class="favorite-card ${AppState.selectedStopCode === fav.code ? 'active' : ''}" data-code="${fav.code}">
        <span class="stop-name">${esc(name)}</span>
        <span class="stop-meta">${fav.code}${road ? ' · ' + esc(road) : ''}</span>
      </button>`;
    }).join('');
  },

  handleFavoriteMenu(code) {
    const data = Frecency.getAll();
    if (!data[code]) return;
    const detail = findByCode(code, STOPS);
    const label = data[code].customName || detail?.name || `Stop ${code}`;
    if (confirm(`${label}\n\nOK = Pin/Unpin · Cancel = Rename`)) {
      Frecency.setPin(code, !data[code].pinned);
    } else {
      const name = prompt('Rename this stop:', data[code].customName || detail?.name || '');
      if (name) Frecency.setCustomName(code, name);
    }
    this.renderFavorites();
  },

  handleGeolocation() {
    if (!navigator.geolocation) return alert('Geolocation not supported');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nearest = findNearest(pos.coords.latitude, pos.coords.longitude, STOPS);
        if (nearest) this.updateArrivalResults(nearest.code);
      },
      () => alert('Unable to retrieve location.')
    );
  },

  async updateArrivalResults(stopCode) {
    if (!stopCode) return;
    AppState.selectedStopCode = stopCode;
    const stop = findByCode(stopCode, STOPS);

    document.getElementById('selected-stop').textContent = stop
      ? `${stop.name} · ${stop.road} · ${stop.code}`
      : `Stop ${stopCode}`;
    document.getElementById('stop-search').value = '';
    Frecency.saveVisit(stopCode);
    this.renderFavorites();
    if (stop) this.focusMap(stop);

    const list = document.getElementById('arrival-list');
    list.innerHTML = `<div class="initial-placeholder">${TRANSLATIONS[AppState.currentLang].loading}</div>`;
    try {
      this.renderArrivals(await fetchArrivals(stopCode));
      AppState.lastUpdated = Date.now();
      document.getElementById('last-updated').textContent = '0';
    } catch (e) {
      list.innerHTML = `<div class="initial-placeholder">${TRANSLATIONS[AppState.currentLang].no_data}</div>`;
    }
    if (!AppState.refreshInterval) this.startRefreshTimer();
  },

  renderArrivals(services) {
    const list = document.getElementById('arrival-list');
    const t = TRANSLATIONS[AppState.currentLang];
    if (!services || services.length === 0) {
      list.innerHTML = `<div class="initial-placeholder">${t.no_data}</div>`;
      return;
    }
    list.innerHTML = services.map((svc) => `
      <div class="arrival-card primary">
        <div class="service-info">
          <span class="service-no">${esc(svc.service)}</span>
          <span class="service-dest">${esc(svc.dest)}</span>
        </div>
        <div class="arrival-times">
          ${this.renderArrivalLine(svc.service, svc.arrivals[0], true)}
          <div class="arrival-secondary-group">
            ${this.renderArrivalLine(svc.service, svc.arrivals[1], false)}
            ${this.renderArrivalLine(svc.service, svc.arrivals[2], false)}
          </div>
        </div>
      </div>`).join('');
  },

  renderArrivalLine(serviceCode, arrival, isPrimary) {
    const t = TRANSLATIONS[AppState.currentLang];
    if (!arrival) {
      return `<div class="arrival-line ${isPrimary ? 'arrival-main' : ''}">
        <span class="${isPrimary ? 'time-huge' : 'secondary-time'}" aria-label="No bus">—</span></div>`;
    }
    const timeText = arrivalText(arrival.min, t.arriving);
    const clock = new Date(Date.now() + arrival.min * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let pulse = '';
    if (isPrimary) {
      if (AppState.lastRenderedMins[serviceCode] !== undefined && AppState.lastRenderedMins[serviceCode] !== arrival.min) pulse = 'pulse-flash';
      AppState.lastRenderedMins[serviceCode] = arrival.min;
    }
    return `<div class="arrival-line ${isPrimary ? 'arrival-main' : ''}">
      <span class="${isPrimary ? `time-huge ${pulse}` : 'secondary-time'}">${esc(timeText)}</span>
      <span class="time-clock">${clock} ${arrival.wc ? WC_ICON : ''}</span>
      <div class="crowding-badge crowding-${arrival.crowding}">${CROWDING_ICONS[arrival.crowding]}<span>${t.crowding[arrival.crowding]}</span></div>
    </div>`;
  },

  startTimers() {
    AppState.tickInterval = setInterval(() => {
      document.getElementById('last-updated').textContent = Math.floor((Date.now() - AppState.lastUpdated) / 1000);
    }, 1000);
  },

  startRefreshTimer() {
    AppState.refreshInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && AppState.selectedStopCode) this.updateArrivalResults(AppState.selectedStopCode);
    }, 25000);
  },
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init());
else App.init();
