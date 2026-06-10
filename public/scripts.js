/**
 * BusWhenSG - Iteration 4
 * Focus: XSS Prevention, Text-Size Cycling, Road Names, and Tab-Visibility Management.
 */

const AppState = {
    currentLang: 'en',
    isDarkMode: false,
    textSize: 'default',
    selectedStopCode: null,
    selectedStopName: null,
    selectedStopRoad: null,
    favorites: [],
    lastUpdated: Date.now(),
    refreshInterval: null,
    tickInterval: null,
    map: null,
    stopMarker: null,
    lastRenderedMins: {} // Track { serviceCode: lastMinuteValue } for pulse-flash
};

// Expanded Dataset with Road names and trimmed strings
const BUS_STOPS = [
    { code: '83139', name: 'Bukit Timah Plaza', road: 'Upper Bukit Timah Rd', lat: 1.3338, lng: 103.7875 },
    { code: '28009', name: 'Orchard Station', road: 'Orchard Rd', lat: 1.3028, lng: 103.8335 },
    { code: '10012', name: 'Jurong East Int', road: 'Jurong East Central', lat: 1.3331, lng: 103.7430 },
    { code: '45001', name: 'Tampines Hub', road: 'Tampines Ave 4', lat: 1.3525, lng: 103.9448 },
    { code: '30120', name: 'VivoCity', road: 'Bishan St 13', lat: 1.2736, lng: 103.8263 },
    { code: '12345', name: 'Marina Bay Sands', road: 'Bayshore Rd', lat: 1.2847, lng: 103.8610 },
    { code: '67890', name: 'Changi Airport T3', road: 'Airport Blvd', lat: 1.3644, lng: 103.9915 },
    { code: '11223', name: 'National Library', road: 'Victoria St', lat: 1.2920, lng: 103.8520 },
    { code: '44556', name: 'Suntec City', road: 'Nicoll Hwy', lat: 1.2930, lng: 103.8580 },
    { code: '77889', name: 'HDB Hub', road: 'Jurong East Central', lat: 1.3335, lng: 103.7420 },
    { code: '99001', name: 'Novena Square', road: 'Novena Ave 1', lat: 1.3350, lng: 103.8450 },
    { code: '22334', name: 'Prinsep Street', road: 'Prinsep St', lat: 1.2950, lng: 103.8480 },
    { code: '55667', name: 'Clementi Mall', road: 'Clementi Ave 3', lat: 1.3280, lng: 103.7760 },
    { code: '88990', name: 'Ang Mo Kio Hub', road: 'Ang Mo Kio Ave 3', lat: 1.3750, lng: 103.8580 },
    { code: '12121', name: 'Bishan Junction', road: 'Bishan St 13', lat: 1.3550, lng: 103.8450 },
    { code: '34343', name: 'Bedok Interchange', road: 'Bedok North St 3', lat: 1.3250, lng: 103.9250 },
    { code: '56565', name: 'Hougang Ave 8', road: 'Hougang Ave 8', lat: 1.3700, lng: 103.8800 },
    { code: '78787', name: 'Punggol Waterway', road: 'Punggol Central', lat: 1.4200, lng: 103.8700 },
    { code: '90909', name: 'Woodlands North', road: 'Woodlands North Ave 1', lat: 1.4350, lng: 103.7850 },
    { code: '10101', name: 'Yishun South', road: 'Yishun Ave 2', lat: 1.4250, lng: 103.8350 },
].map(s => ({ ...s, name: s.name.trim() }));

const TRANSLATIONS = {
    en: {
        skip_to_content: "Skip to Main Content",
        quick_favorites: "Quick Access Favorites",
        find_your_bus: "Find Your Bus Stop",
        search_label: "Search by Stop Code or Name",
        search_placeholder: "Search by Stop Code or Name...",
        search_btn: "Search",
        near_me: "Near Me",
        arrivals: "Arrivals",
        updated_ago: "Updated",
        select_stop_prompt: "Please select a stop or use \"Near Me\" to view real-time arrivals.",
        loading: "Fetching live arrivals...",
        no_data: "No arrival data available for this stop.",
        arriving: "Arriving",
        crowding: { low: 'Low', med: 'Medium', high: 'High' }
    },
    zh: {
        skip_to_content: "跳转到主要内容",
        quick_favorites: "快速访问收藏",
        find_your_bus: "查找您的巴士站",
        search_label: "通过站点代码或名称搜索",
        search_placeholder: "搜索站点代码或名称...",
        search_btn: "搜索",
        near_me: "在我附近",
        arrivals: "巴士到达",
        updated_ago: "更新于",
        select_stop_prompt: "请选择一个站点或使用“在我附近”来查看实时到达信息。",
        loading: "正在获取实时数据...",
        no_data: "该站点暂无到达数据。",
        arriving: "即将到达",
        crowding: { low: '低', med: '中', high: '高' }
    },
    ms: {
        skip_to_content: "Langkau ke Kandungan Utama",
        quick_favorites: "Kegemaran Akses Pantas",
        find_your_bus: "Cari Hentian Bas Anda",
        search_label: "Cari mengikut Kod atau Nama Hentian",
        search_placeholder: "Cari Kod atau Nama Hentian...",
        search_btn: "Cari",
        near_me: "Berdekatan Saya",
        arrivals: "Ketibaan",
        updated_ago: "Dikemaskini",
        select_stop_prompt: "Sila pilih hentian atau gunakan \"Berdekatan Saya\" untuk melihat ketibaan masa nyata.",
        loading: "Mengambil data masa nyata...",
        no_data: "Tiada data ketibaan untuk hentian ini.",
        arriving: "Tiba",
        crowding: { low: 'Rendah', med: 'Sederhana', high: 'Tinggi' }
    }
};

const CROWDING_ICONS = {
    low: '<svg class="crowding-icon" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>', 
    med: '<svg class="crowding-icon" viewBox="0 0 24 24"><path d="M7 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zM17 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"/></svg>', 
    high: '<svg class="crowding-icon" viewBox="0 0 24 24"><path d="M16 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-8 0c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
};

const WC_ICON = '<svg class="wc-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>';

/**
 * HTML escaping helper for XSS prevention
 */
const esc = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
};

/**
 * FrecencyManager handles persistence and scoring for favorite stops
 */
class FrecencyManager {
    static STORAGE_KEY = 'busWhenSG_frecency';
    
    static saveVisit(stopCode) {
        const data = this.getAll();
        const now = Date.now();
        if (!data[stopCode]) {
            data[stopCode] = { code: stopCode, visits: 0, lastVisited: 0, pinned: false, customName: null };
        }
        data[stopCode].visits++;
        data[stopCode].lastVisited = now;
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    }

    static getAll() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        return stored ? JSON.parse(stored) : {};
    }

    static setPin(stopCode, isPinned) {
        const data = this.getAll();
        if (data[stopCode]) {
            data[stopCode].pinned = isPinned;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        }
    }

    static setCustomName(stopCode, name) {
        const data = this.getAll();
        if (data[stopCode]) {
            data[stopCode].customName = name;
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        }
    }

    static getTopStops(limit = 5) {
        const data = this.getAll();
        const now = Date.now();
        const dayMs = 86400000;

        const scored = Object.values(data).map(stop => {
            const recencyScore = Math.exp(-(now - stop.lastVisited) / (dayMs * 7)); 
            return { ...stop, score: stop.visits + recencyScore };
        });

        const pinned = scored.filter(s => s.pinned);
        const unpinned = scored.filter(s => !s.pinned).sort((a, b) => b.score - a.score);
        
        return [...pinned, ...unpinned].slice(0, limit);
    }
}

/**
 * Math Helpers
 */
const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * API Simulation
 */
// LIVE: call the local Cloudflare Pages Function proxy (/api/arrival), which
// injects the LTA AccountKey and normalises the response. Same-origin, so a
// relative path works when served by `wrangler pages dev`.
const fetchArrivals = async (stopCode) => {
    const res = await fetch(`/api/arrival?stop=${encodeURIComponent(stopCode)}`);
    if (!res.ok) {
        let detail = '';
        try { detail = (await res.json()).error || ''; } catch (e) { /* ignore */ }
        throw new Error(`arrival_fetch_failed ${res.status} ${detail}`);
    }
    return res.json(); // [{ service, dest, arrivals: [{min, crowding, wc}, ...] }, ...]
};

/**
 * Core Application
 */
const App = {
    init() {
        this.loadState();
        this.setupEventListeners();
        this.initMapLazy();
        this.renderFavorites();
        this.startTimers();
        this.updateLanguageUI();
    },

    loadState() {
        AppState.isDarkMode = localStorage.getItem('theme') === 'dark';
        AppState.textSize = localStorage.getItem('textSize') || 'default';
        AppState.currentLang = localStorage.getItem('lang') || (navigator.language.startsWith('zh') ? 'zh' : 'en');
        
        document.documentElement.lang = AppState.currentLang;
        this.applyTheme();
    },

    applyTheme() {
        document.body.className = `theme-${AppState.isDarkMode ? 'dark' : 'light'} text-size-${AppState.textSize}`;
    },

    initMapLazy() {
        const wrapper = document.getElementById('map-wrapper');
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                this.initMap();
                observer.disconnect();
            }
        }, { threshold: 0.1 });
        observer.observe(wrapper);
    },

    initMap() {
        try {
            AppState.map = L.map('map', { zoomControl: false, attributionControl: false }).setView([1.3521, 103.8198], 12);
            
            const tiles = L.tileLayer('https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png', { maxZoom: 18 });
            
            // FIX MIN-003: Handle tile error BEFORE marker loop to prevent pins on grey grid
            tiles.on('tileerror', () => {
                document.getElementById('map-wrapper').style.display = 'none';
                console.error("Map tiles failed to load.");
            });
            tiles.addTo(AppState.map);

            BUS_STOPS.forEach(stop => {
                const marker = L.marker([stop.lat, stop.lng]).addTo(AppState.map);
                marker.bindPopup(`<b>${esc(stop.name)}</b><br>Stop: ${stop.code}`);
                marker.on('click', () => this.updateArrivalResults(stop.code));
            });

            AppState.stopMarker = L.marker([1.3521, 103.8198]).addTo(AppState.map);
        } catch (e) {
            console.error("Map Init Error:", e);
        }
    },

    setupEventListeners() {
        document.getElementById('search-button').addEventListener('click', () => {
            const val = document.getElementById('stop-search').value.trim();
            if (!val) return;
            const stop = BUS_STOPS.find(s => s.code === val || s.name.toLowerCase().includes(val.toLowerCase()));
            if (stop) this.updateArrivalResults(stop.code);
            else if (/^\d{5}$/.test(val)) this.updateArrivalResults(val); // valid 5-digit code not in the sample dataset
            else alert("Stop not found");
        });

        document.getElementById('geo-button').addEventListener('click', () => this.handleGeolocation());
        document.getElementById('refresh-button').addEventListener('click', () => this.updateArrivalResults(AppState.selectedStopCode));

        document.getElementById('toggle-dark-light').addEventListener('click', () => {
            AppState.isDarkMode = !AppState.isDarkMode;
            localStorage.setItem('theme', AppState.isDarkMode ? 'dark' : 'light');
            this.applyTheme();
        });

        // FIX MAJ-004: Updated text-size cycle [default, large, xlarge]
        document.getElementById('toggle-text-size').addEventListener('click', (e) => {
            const sizes = ['default', 'large', 'xlarge'];
            const labels = ['A', 'A+', 'A++'];
            const currentIndex = sizes.indexOf(AppState.textSize);
            const nextIndex = (currentIndex + 1) % sizes.length;
            
            AppState.textSize = sizes[nextIndex];
            e.target.textContent = labels[nextIndex];
            
            localStorage.setItem('textSize', AppState.textSize);
            this.applyTheme();
        });

        document.querySelectorAll('.language-toggle button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                AppState.currentLang = e.target.dataset.lang;
                document.documentElement.lang = AppState.currentLang;
                localStorage.setItem('lang', AppState.currentLang);
                this.updateLanguageUI();
                if (AppState.selectedStopCode) this.updateArrivalResults(AppState.selectedStopCode);
            });
        });

        // FIX MAJ-002: Delegated event listeners for favorites to prevent XSS and inline handlers
        const favContainer = document.getElementById('favorites-container');
        favContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.favorite-card');
            if (card) {
                const code = card.dataset.code;
                this.updateArrivalResults(code);
            }
        });

        favContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const card = e.target.closest('.favorite-card');
            if (card) {
                this.handleFavoriteMenu(e, card.dataset.code);
            }
        });

        // FIX MAJ-005: True pause/resume on visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                if (AppState.refreshInterval) {
                    clearInterval(AppState.refreshInterval);
                    AppState.refreshInterval = null;
                }
            } else {
                if (!AppState.refreshInterval && AppState.selectedStopCode) {
                    this.startRefreshTimer();
                }
            }
        });
    },

    updateLanguageUI() {
        const t = TRANSLATIONS[AppState.currentLang];
        document.getElementById('stop-search').placeholder = t.search_placeholder;
        
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) el.textContent = t[key];
        });

        document.querySelectorAll('.language-toggle button').forEach(btn => {
            btn.setAttribute('aria-pressed', btn.dataset.lang === AppState.currentLang);
        });
    },

    renderFavorites() {
        const container = document.getElementById('favorites-container');
        const topStops = FrecencyManager.getTopStops();
        
        // FIX MAJ-002 & MAJ-003: Use esc() and include road name
        container.innerHTML = topStops.map(stop => {
            const stopDetail = BUS_STOPS.find(s => s.code === stop.code);
            const displayName = stop.customName || stopDetail?.name || 'Unknown';
            const roadName = stopDetail?.road || 'Unknown Road';
            
            return `
                <div class="favorite-card ${AppState.selectedStopCode === stop.code ? 'active' : ''}" 
                     data-code="${stop.code}">
                    <span class="stop-name">${esc(displayName)}</span>
                    <span class="stop-meta">${stop.code} • ${esc(roadName)}</span>
                </div>
            `;
        }).join('');
    },

    handleFavoriteMenu(e, code) {
        // FIX MAJ-001: ReferenceError fix - move data fetch to top
        const data = FrecencyManager.getAll();
        const stop = BUS_STOPS.find(s => s.code === code);
        if (!stop) return;

        const action = confirm(`Stop: ${esc(stop.name)}\n\nOK to Pin/Unpin? Cancel to Rename?`);
        if (action) {
            FrecencyManager.setPin(code, !data[code].pinned);
        } else {
            const currentName = data[code]?.customName || stop.name;
            const newName = prompt("Enter new name for this stop:", currentName);
            if (newName) FrecencyManager.setCustomName(code, newName);
        }
        this.renderFavorites();
    },

    handleGeolocation() {
        if (!navigator.geolocation) return alert("Geolocation not supported");
        
        navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude, longitude } = pos.coords;
            let nearest = null;
            let minDist = Infinity;

            BUS_STOPS.forEach(stop => {
                const d = haversineDistance(latitude, longitude, stop.lat, stop.lng);
                if (d < minDist) {
                    minDist = d;
                    nearest = stop;
                }
            });

            if (nearest) {
                this.updateArrivalResults(nearest.code);
                if (AppState.map) {
                    AppState.map.setView([latitude, longitude], 15);
                    AppState.stopMarker.setLatLng([latitude, longitude]);
                }
            }
        }, (err) => alert("Unable to retrieve location."));
    },

    async updateArrivalResults(stopCode) {
        if (!stopCode) return;
        AppState.selectedStopCode = stopCode;
        const stop = BUS_STOPS.find(s => s.code === stopCode);
        AppState.selectedStopName = stop ? stop.name : `Stop ${stopCode}`;
        AppState.selectedStopRoad = stop ? stop.road : "";

        FrecencyManager.saveVisit(stopCode);
        this.renderFavorites();

        const list = document.getElementById('arrival-list');
        list.innerHTML = `<div class="initial-placeholder">${TRANSLATIONS[AppState.currentLang].loading}</div>`;

        try {
            const data = await fetchArrivals(stopCode);
            this.renderArrivals(data);
            AppState.lastUpdated = Date.now();
        } catch (e) {
            list.innerHTML = `<div class="initial-placeholder">Error loading data.</div>`;
        }
    },

    renderArrivals(services) {
        const list = document.getElementById('arrival-list');
        const t = TRANSLATIONS[AppState.currentLang];
        
        if (!services || services.length === 0) {
            list.innerHTML = `<div class="initial-placeholder">${t.no_data}</div>`;
            return;
        }

        // FIX MIN-005: Remove duplicated crowding badge from service-info block
        list.innerHTML = services.map(svc => {
            return `
                <div class="arrival-card primary">
                    <div class="service-info">
                        <span class="service-no">${svc.service}</span>
                        <span class="service-dest">${esc(svc.dest)}</span>
                    </div>
                    <div class="arrival-times">
                        ${this.renderArrivalLine(svc.service, svc.arrivals[0], true)}
                        <div class="arrival-secondary-group">
                            ${this.renderArrivalLine(svc.service, svc.arrivals[1], false)}
                            ${this.renderArrivalLine(svc.service, svc.arrivals[2], false)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderArrivalLine(serviceCode, arrival, isPrimary) {
        const t = TRANSLATIONS[AppState.currentLang];
        // LIVE: a service may have fewer than 3 upcoming buses — render a dash, don't crash.
        if (!arrival) {
            return `<div class="arrival-line ${isPrimary ? 'arrival-main' : ''}">
                <span class="${isPrimary ? 'time-huge' : 'secondary-time'}" aria-label="No bus">&mdash;</span>
            </div>`;
        }
        const timeText = arrival.min <= 1 ? t.arriving : `${arrival.min} min`;
        const clockTime = new Date(Date.now() + arrival.min * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // FIX MIN-002: Pulse-flash only if value actually changed
        let pulseClass = '';
        if (isPrimary) {
            if (AppState.lastRenderedMins[serviceCode] !== undefined && 
                AppState.lastRenderedMins[serviceCode] !== arrival.min) {
                pulseClass = 'pulse-flash';
            }
            AppState.lastRenderedMins[serviceCode] = arrival.min;
        }

        return `
            <div class="arrival-line ${isPrimary ? 'arrival-main' : ''}">
                <span class="${isPrimary ? `time-huge ${pulseClass}` : 'secondary-time'}">${timeText}</span>
                <span class="time-clock">${clockTime} ${arrival.wc ? WC_ICON : ''}</span>
                <div class="crowding-badge crowding-${arrival.crowding}" style="font-size: 10px; padding: 2px 6px;">
                    ${CROWDING_ICONS[arrival.crowding]}
                    <span>${t.crowding[arrival.crowding]}</span>
                </div>
            </div>
        `;
    },

    startTimers() {
        AppState.tickInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - AppState.lastUpdated) / 1000);
            document.getElementById('last-updated').textContent = elapsed;
        }, 1000);

        this.startRefreshTimer();
    },

    startRefreshTimer() {
        AppState.refreshInterval = setInterval(() => {
            if (document.visibilityState === 'visible' && AppState.selectedStopCode) {
                this.updateArrivalResults(AppState.selectedStopCode);
            }
        }, 25000);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());