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
  pickRouteDirection,
  routeToLatLngs,
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
  autoFollow: true,   // follow GPS to nearest stop until the user picks a stop manually
  watchId: null,
  userPos: null,
  lastServices: [],   // most recent /api/arrival result (for the tracked bus position)
  routes: null,       // lazy-loaded routes.json (service:dir -> ordered stop codes)
  stopIndex: {},      // code -> {lat,lng,name,road}
  trackedService: null,
  routeLayer: null,
  busMarker: null,
  busAnim: null,
};

const REDUCE_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const TRACK_INTERVAL_MS = 12000; // faster poll while tracking a bus
const REFRESH_INTERVAL_MS = 25000;

// Blue water-drop pin for the live bus; red dot for the selected stop (so they differ).
const BUS_ICON = {
  className: 'bus-pin',
  html: '<svg viewBox="0 0 24 34" width="30" height="42" aria-label="bus"><path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 22 12 22s12-13 12-22C24 5.4 18.6 0 12 0z" fill="#2563eb" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="4.6" fill="#fff"/></svg>',
  iconSize: [30, 42], iconAnchor: [15, 42], popupAnchor: [0, -38],
};
const STOP_ICON = {
  className: 'stop-dot', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9],
};

// Full Singapore bus-stop list, loaded at startup from stops.json (~5,200 stops).
let STOPS = [];

const TRANSLATIONS = {
  en: {
    skip_to_content: 'Skip to Main Content', quick_favorites: 'Quick Access Favorites',
    search_label: 'Search by Stop Code or Name', search_placeholder: 'Enter 5-digit stop code or name…',
    search_btn: 'Search', near_me: 'Near Me', arrivals: 'Arrivals', updated_ago: 'Updated',
    select_stop_prompt: 'Tap a favourite, search a stop code, or use “Near Me”.',
    locating: 'Finding your nearest bus stop…',
    loading: 'Fetching live arrivals…', no_data: 'No buses running for this stop right now.',
    not_found: 'Stop not found — try a 5-digit code.', arriving: 'Arriving',
    track_hint: 'Tap to see route on map', tracking_on: 'Tracking on map ✓',
    live: 'LIVE', no_gps: 'No live GPS for this bus yet — showing its route only',
    crowding: { low: 'Seats', med: 'Standing', high: 'Packed' },
  },
  zh: {
    skip_to_content: '跳转到主要内容', quick_favorites: '快速访问收藏',
    search_label: '通过站点代码或名称搜索', search_placeholder: '输入5位站点代码或名称…',
    search_btn: '搜索', near_me: '在我附近', arrivals: '巴士到达', updated_ago: '更新于',
    select_stop_prompt: '点按收藏、搜索站点代码，或使用“在我附近”。',
    locating: '正在查找最近的巴士站…',
    loading: '正在获取实时数据…', no_data: '该站点目前没有巴士。',
    not_found: '找不到站点 — 请输入5位代码。', arriving: '即将到达',
    track_hint: '点按在地图上查看路线', tracking_on: '正在地图上追踪 ✓',
    live: '实时', no_gps: '该班车暂无实时定位 — 仅显示路线',
    crowding: { low: '有座位', med: '站立', high: '拥挤' },
  },
  ms: {
    skip_to_content: 'Langkau ke Kandungan Utama', quick_favorites: 'Kegemaran Akses Pantas',
    search_label: 'Cari mengikut Kod atau Nama Hentian', search_placeholder: 'Masukkan kod 5-digit atau nama…',
    search_btn: 'Cari', near_me: 'Berdekatan Saya', arrivals: 'Ketibaan', updated_ago: 'Dikemaskini',
    select_stop_prompt: 'Tekan kegemaran, cari kod hentian, atau guna “Berdekatan Saya”.',
    locating: 'Mencari hentian bas terdekat…',
    loading: 'Mengambil data masa nyata…', no_data: 'Tiada bas untuk hentian ini sekarang.',
    not_found: 'Hentian tidak dijumpai — cuba kod 5-digit.', arriving: 'Tiba',
    track_hint: 'Tekan untuk lihat laluan di peta', tracking_on: 'Menjejak di peta ✓',
    live: 'LANGSUNG', no_gps: 'Tiada GPS langsung untuk bas ini — laluan sahaja',
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

/** LIVE: call the same-origin Pages Function proxy (injects the LTA key, normalises).
 *  `fresh` adds a cache-buster so the faster tracking poll skips the browser/edge cache. */
const fetchArrivals = async (stopCode, fresh = false) => {
  const bust = fresh ? `&_t=${Date.now()}` : '';
  const res = await fetch(`/api/arrival?stop=${encodeURIComponent(stopCode)}${bust}`);
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
    this.startTracking(); // continuously follow GPS to the nearest stop
  },

  async loadStops() {
    try {
      STOPS = await (await fetch('./stops.json')).json();
      AppState.stopIndex = Object.fromEntries(STOPS.map((s) => [s.code, s]));
    } catch (e) {
      console.error('Failed to load stops.json', e);
      STOPS = [];
    }
  },

  /** Lazy-load routes.json (only when the user first tracks a bus). */
  async ensureRoutes() {
    if (AppState.routes) return AppState.routes;
    try { AppState.routes = await (await fetch('./routes.json')).json(); }
    catch (e) { console.error('Failed to load routes.json', e); AppState.routes = {}; }
    return AppState.routes;
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
    // Theme on <body>; text-size on <html> so it scales the rem root (the whole UI).
    document.body.className = `theme-${AppState.isDarkMode ? 'dark' : 'light'}`;
    document.documentElement.className = `text-size-${AppState.textSize}`;
    const tsBtn = document.getElementById('toggle-text-size');
    if (tsBtn) tsBtn.textContent = { default: 'A', large: 'A+', xlarge: 'A++' }[AppState.textSize];
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
      AppState.stopMarker = L.marker([1.3521, 103.8198], { icon: L.divIcon(STOP_ICON) });
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

  /** Tap a bus → draw its full route, zoom out to fit it, drop a blue pin on the live bus. */
  async trackBus(service) {
    if (AppState.trackedService === service) { // tap again to stop tracking
      this.clearTracking();
      const stop = findByCode(AppState.selectedStopCode, STOPS);
      if (stop) this.focusMap(stop);
      this.renderArrivals(AppState.lastServices);
      return;
    }
    if (!AppState.map) this.initMap();
    await this.ensureRoutes();
    const svc = (AppState.lastServices || []).find((s) => s.service === service);
    if (!svc || !AppState.map) return;

    const stopCodes = pickRouteDirection(AppState.routes, service, AppState.selectedStopCode, svc.destCode);
    const latlngs = routeToLatLngs(stopCodes || [], AppState.stopIndex);
    if (latlngs.length < 2) return; // no usable route geometry

    this.clearTracking();
    AppState.trackedService = service;
    this.startRefreshTimer(); // poll faster while tracking
    AppState.routeLayer = L.layerGroup().addTo(AppState.map);
    const line = L.polyline(latlngs, { color: '#2563eb', weight: 5, opacity: 0.85 }).addTo(AppState.routeLayer);
    // keep the selected stop visible on the route
    const stop = findByCode(AppState.selectedStopCode, STOPS);
    if (stop) L.marker([stop.lat, stop.lng], { icon: L.divIcon(STOP_ICON) }).addTo(AppState.routeLayer);
    AppState.map.fitBounds(line.getBounds(), { padding: [24, 24] });
    // Only show a moving pin if LTA actually reports this bus's live GPS.
    const bus = svc.arrivals[0];
    if (bus && bus.lat) {
      this.placeBusMarker(bus, service, svc.dest);
      this.setMapNotice(null);
    } else {
      this.setMapNotice(TRANSLATIONS[AppState.currentLang].no_gps);
    }
    this.renderArrivals(AppState.lastServices); // mark the card as tracking
  },

  placeBusMarker(bus, service, dest) {
    const target = [bus.lat, bus.lng];
    if (!AppState.busMarker) { // first placement — no glide
      AppState.busMarker = L.marker(target, { icon: L.divIcon(BUS_ICON), zIndexOffset: 1000 })
        .addTo(AppState.routeLayer)
        .bindPopup(`<b>Bus ${esc(service)}</b><br>${esc(dest)}`);
      return;
    }
    const from = AppState.busMarker.getLatLng();
    this.glideMarker(AppState.busMarker, [from.lat, from.lng], target);
  },

  /** Smoothly glide the pin from `from` to `to` across (just under) one poll interval. */
  glideMarker(marker, from, to, duration = TRACK_INTERVAL_MS - 1000) {
    if (AppState.busAnim) cancelAnimationFrame(AppState.busAnim);
    if (REDUCE_MOTION || (from[0] === to[0] && from[1] === to[1])) { marker.setLatLng(to); return; }
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 2); // ease-out
      marker.setLatLng([from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e]);
      AppState.busAnim = t < 1 ? requestAnimationFrame(step) : null;
    };
    AppState.busAnim = requestAnimationFrame(step);
  },

  /** Move the tracked bus's pin to its latest GPS (called on each refresh). */
  updateTrackedBus() {
    if (!AppState.trackedService || !AppState.routeLayer) return;
    const svc = (AppState.lastServices || []).find((s) => s.service === AppState.trackedService);
    const bus = svc && svc.arrivals[0];
    if (bus && bus.lat) {
      this.placeBusMarker(bus, AppState.trackedService, svc.dest); // appears/moves when GPS arrives
      this.setMapNotice(null);
    } else if (!AppState.busMarker) {
      this.setMapNotice(TRANSLATIONS[AppState.currentLang].no_gps); // still no GPS
    }
  },

  setMapNotice(msg) {
    const el = document.getElementById('map-notice');
    if (!el) return;
    if (msg) { el.textContent = msg; el.hidden = false; } else { el.hidden = true; }
  },

  clearTracking() {
    if (AppState.busAnim) { cancelAnimationFrame(AppState.busAnim); AppState.busAnim = null; }
    if (AppState.routeLayer && AppState.map) AppState.map.removeLayer(AppState.routeLayer);
    AppState.routeLayer = null;
    AppState.busMarker = null;
    AppState.trackedService = null;
    this.setMapNotice(null);
    this.startRefreshTimer(); // back to the normal (slower) cadence
  },

  setupEventListeners() {
    const doSearch = () => {
      const val = document.getElementById('stop-search').value.trim();
      if (!val) return;
      const hit = searchStops(val, STOPS, 1)[0];
      AppState.autoFollow = false; // manual pick — stop GPS from yanking the view away
      if (hit) this.updateArrivalResults(hit.code);
      else if (isValidStopCode(val)) this.updateArrivalResults(val);
      else alert(TRANSLATIONS[AppState.currentLang].not_found);
    };
    document.getElementById('search-button').addEventListener('click', doSearch);
    document.getElementById('stop-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

    document.getElementById('geo-button').addEventListener('click', () => this.goNearest());
    document.getElementById('refresh-button').addEventListener('click', () => this.updateArrivalResults(AppState.selectedStopCode));

    document.getElementById('toggle-dark-light').addEventListener('click', () => {
      AppState.isDarkMode = !AppState.isDarkMode;
      localStorage.setItem('theme', AppState.isDarkMode ? 'dark' : 'light');
      this.applyTheme();
    });

    document.getElementById('toggle-text-size').addEventListener('click', () => {
      const sizes = ['default', 'large', 'xlarge'];
      AppState.textSize = sizes[(sizes.indexOf(AppState.textSize) + 1) % sizes.length];
      localStorage.setItem('textSize', AppState.textSize);
      this.applyTheme(); // applyTheme syncs the A/A+/A++ label too
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
      if (card) { AppState.autoFollow = false; this.updateArrivalResults(card.dataset.code); }
    });
    fav.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('.favorite-card');
      if (card) { e.preventDefault(); this.handleFavoriteMenu(card.dataset.code); }
    });

    // Tap a bus card → show its route on the map and track the bus.
    document.getElementById('arrival-list').addEventListener('click', (e) => {
      const card = e.target.closest('.arrival-card');
      if (card && card.dataset.service) this.trackBus(card.dataset.service);
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
    let list = Frecency.top(5);
    // The currently selected stop (from Search / Near Me / a tap) always shows first.
    const sel = AppState.selectedStopCode;
    if (sel) {
      list = list.filter((s) => s.code !== sel);
      const selData = Frecency.getAll()[sel] || { code: sel };
      list = [selData, ...list].slice(0, 5);
    }
    container.innerHTML = list.map((fav) => {
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

  /** Continuously follow GPS. While autoFollow is on, the nearest stop auto-loads as you move. */
  startTracking() {
    if (!navigator.geolocation) return;
    const list = document.getElementById('arrival-list');
    if (!AppState.selectedStopCode) {
      list.innerHTML = `<div class="initial-placeholder">${TRANSLATIONS[AppState.currentLang].locating}</div>`;
    }
    AppState.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        AppState.userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const nearest = findNearest(AppState.userPos.lat, AppState.userPos.lng, STOPS);
        // Auto-switch only while following and only when the nearest stop actually changes
        // (so walking past stops updates you, but standing still doesn't re-fetch).
        if (nearest && AppState.autoFollow && nearest.code !== AppState.selectedStopCode) {
          this.updateArrivalResults(nearest.code);
        }
      },
      () => {
        if (!AppState.selectedStopCode) {
          list.innerHTML = `<div class="initial-placeholder">${TRANSLATIONS[AppState.currentLang].select_stop_prompt}</div>`;
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 }
    );
  },

  /** "Near Me" — resume following and jump to the current nearest stop now. */
  goNearest() {
    AppState.autoFollow = true;
    if (AppState.userPos) {
      const nearest = findNearest(AppState.userPos.lat, AppState.userPos.lng, STOPS);
      if (nearest) return this.updateArrivalResults(nearest.code);
    }
    if (!AppState.watchId) this.startTracking();
    else {
      const list = document.getElementById('arrival-list');
      list.innerHTML = `<div class="initial-placeholder">${TRANSLATIONS[AppState.currentLang].locating}</div>`;
    }
  },

  async updateArrivalResults(stopCode) {
    if (!stopCode) return;
    const sameStop = stopCode === AppState.selectedStopCode; // a refresh vs a new stop
    AppState.selectedStopCode = stopCode;
    const stop = findByCode(stopCode, STOPS);

    if (!sameStop) this.clearTracking(); // switching stops drops any tracked bus
    document.getElementById('selected-stop').textContent = stop
      ? `${stop.name} · ${stop.road} · ${stop.code}`
      : `Stop ${stopCode}`;
    document.getElementById('stop-search').value = stopCode; // auto-fill the stop ID in the search bar
    Frecency.saveVisit(stopCode);
    this.renderFavorites();
    if (stop && !AppState.trackedService) this.focusMap(stop); // don't override the route view

    const list = document.getElementById('arrival-list');
    if (!sameStop) list.innerHTML = `<div class="initial-placeholder">${TRANSLATIONS[AppState.currentLang].loading}</div>`;
    try {
      const services = await fetchArrivals(stopCode, !!AppState.trackedService);
      AppState.lastServices = services;
      this.renderArrivals(services);
      if (AppState.trackedService) this.updateTrackedBus(); // move the pin on each refresh
      AppState.lastUpdated = Date.now();
      document.getElementById('last-updated').textContent = '0';
    } catch (e) {
      if (!AppState.trackedService) list.innerHTML = `<div class="initial-placeholder">${TRANSLATIONS[AppState.currentLang].no_data}</div>`;
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
    list.innerHTML = services.map((svc) => {
      const tracked = AppState.trackedService === svc.service;
      const live = !!(svc.arrivals[0] && svc.arrivals[0].lat); // has live GPS → trackable on map
      return `
      <button type="button" class="arrival-card primary${tracked ? ' tracking' : ''}" data-service="${esc(svc.service)}"
              aria-pressed="${tracked}" aria-label="Show route and track bus ${esc(svc.service)} on the map">
        <div class="service-info">
          <span class="service-no">${esc(svc.service)}</span>
          <span class="service-dest">${esc(svc.dest)}</span>
          ${live ? `<span class="live-badge">● ${t.live}</span>` : ''}
          <span class="track-hint">${tracked ? t.tracking_on : t.track_hint}</span>
        </div>
        <div class="arrival-times">
          ${this.renderArrivalLine(svc.service, svc.arrivals[0], true)}
          <div class="arrival-secondary-group">
            ${this.renderArrivalLine(svc.service, svc.arrivals[1], false)}
            ${this.renderArrivalLine(svc.service, svc.arrivals[2], false)}
          </div>
        </div>
      </button>`;
    }).join('');
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
    if (AppState.refreshInterval) clearInterval(AppState.refreshInterval);
    const ms = AppState.trackedService ? TRACK_INTERVAL_MS : REFRESH_INTERVAL_MS;
    AppState.refreshInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && AppState.selectedStopCode) this.updateArrivalResults(AppState.selectedStopCode);
    }, ms);
  },
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.init());
else App.init();
