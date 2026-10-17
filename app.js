'use strict';

// Data: OpenStreetMap via the Overpass API. Geocoding: Nominatim.
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const DEFAULT_VIEW = { lat: 55.6761, lng: 12.5683, zoom: 15 }; // København
const MIN_SEARCH_ZOOM = 13;
const PAGE_SIZE = 100;
const SAVED_KEY = 'sitefinder:saved';

const COLORS = { none: '#e11d48', social: '#9333ea', has: '#16a34a' };
const STATUS_LABEL = {
  none: 'Ingen registreret hjemmeside',
  social: 'Kun social profil',
  has: 'Har hjemmeside',
};

// Branche-grupper. Rækkefølgen betyder noget: første match vinder.
const CATEGORIES = [
  { id: 'food', label: 'Restaurant & café', match: t => /^(restaurant|cafe|fast_food|bar|pub|ice_cream|biergarten|food_court)$/.test(t.amenity) || /^(bakery|pastry|confectionery|deli)$/.test(t.shop) },
  { id: 'beauty', label: 'Frisør & skønhed', match: t => /^(hairdresser|beauty|cosmetics|massage|tattoo|nails|hairdresser_supply)$/.test(t.shop) || t.amenity === 'massage' },
  { id: 'health', label: 'Sundhed', match: t => !!t.healthcare || /^(dentist|doctors|clinic|pharmacy|veterinary|physiotherapist)$/.test(t.amenity) || /^(optician|chemist|hearing_aids|medical_supply)$/.test(t.shop) },
  { id: 'auto', label: 'Auto & cykel', match: t => /^(car|car_repair|car_parts|tyres|motorcycle|bicycle)$/.test(t.shop) || /^(car_wash|fuel|car_rental)$/.test(t.amenity) },
  { id: 'craft', label: 'Håndværk', match: t => !!t.craft },
  { id: 'hotel', label: 'Overnatning', match: t => /^(hotel|guest_house|hostel|motel|apartment|chalet|camp_site)$/.test(t.tourism) },
  { id: 'leisure', label: 'Fritid & sport', match: t => /^(fitness_centre|sports_centre|dance|bowling_alley|escape_game|amusement_arcade)$/.test(t.leisure) || /^(cinema|theatre|nightclub|arts_centre)$/.test(t.amenity) },
  { id: 'office', label: 'Kontor & rådgivning', match: t => !!t.office },
  { id: 'service', label: 'Service', match: t => /^(driving_school|language_school|music_school|childcare|kindergarten|veterinary|bureau_de_change)$/.test(t.amenity) || /^(dry_cleaning|laundry|travel_agency|funeral_directors|copyshop|pet_grooming|tailor)$/.test(t.shop) },
  { id: 'shop', label: 'Butik', match: t => !!t.shop },
];

const TYPE_LABELS = {
  restaurant: 'Restaurant', cafe: 'Café', fast_food: 'Fastfood', bar: 'Bar', pub: 'Pub', ice_cream: 'Is',
  bakery: 'Bager', hairdresser: 'Frisør', beauty: 'Skønhedssalon', massage: 'Massage', tattoo: 'Tatovør',
  nails: 'Negle', dentist: 'Tandlæge', doctors: 'Læge', clinic: 'Klinik', pharmacy: 'Apotek',
  veterinary: 'Dyrlæge', physiotherapist: 'Fysioterapeut', optician: 'Optiker', car_repair: 'Autoværksted',
  car: 'Bilforhandler', tyres: 'Dæk', bicycle: 'Cykelhandler', car_wash: 'Bilvask', fuel: 'Tankstation',
  hotel: 'Hotel', guest_house: 'Gæstehus', hostel: 'Hostel', fitness_centre: 'Fitnesscenter',
  sports_centre: 'Sportscenter', florist: 'Blomsterhandler', supermarket: 'Supermarked',
  convenience: 'Kiosk', clothes: 'Tøjbutik', shoes: 'Skobutik', butcher: 'Slagter', kiosk: 'Kiosk',
  jewelry: 'Smykker', furniture: 'Møbler', hardware: 'Byggemarked', electronics: 'Elektronik',
  mobile_phone: 'Mobiltelefoner', books: 'Boghandel', gift: 'Gavebutik', pet: 'Dyrehandel',
  second_hand: 'Genbrug', alcohol: 'Vinhandel', wine: 'Vinhandel', greengrocer: 'Grønthandler',
  electrician: 'Elektriker', plumber: 'VVS', carpenter: 'Tømrer', painter: 'Maler', locksmith: 'Låsesmed',
  roofer: 'Tagdækker', gardener: 'Anlægsgartner', builder: 'Murer/bygmester', lawyer: 'Advokat',
  accountant: 'Revisor', estate_agent: 'Ejendomsmægler', insurance: 'Forsikring', it: 'IT',
  architect: 'Arkitekt', dry_cleaning: 'Renseri', laundry: 'Vaskeri', tailor: 'Skrædder',
  travel_agency: 'Rejsebureau', driving_school: 'Køreskole', pizza: 'Pizza',
};

// ---------- State ----------
const businesses = new Map(); // id -> business
const markers = new Map();    // id -> L.circleMarker
let filtered = [];
let shown = PAGE_SIZE;
let selectedId = null;
let saved = loadSaved();
let lastFetchedBounds = null;

// ---------- Map ----------
const map = L.map('map', { preferCanvas: true, zoomControl: true })
  .setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], DEFAULT_VIEW.zoom);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragydere',
}).addTo(map);
const markerLayer = L.layerGroup().addTo(map);
const renderer = L.canvas({ padding: 0.5 });

// ---------- DOM ----------
const $ = id => document.getElementById(id);
const el = {
  list: $('list'), status: $('status'), more: $('more-btn'), detail: $('detail'), loader: $('loader'),
  searchArea: $('search-area'), category: $('filter-category'), website: $('filter-website'),
  text: $('filter-text'), phone: $('filter-phone'), email: $('filter-email'), saved: $('filter-saved'),
  panel: $('panel'),
};

for (const c of CATEGORIES) el.category.add(new Option(c.label, c.id));

// ---------- Helpers ----------
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function loadSaved() {
  try { return new Set(JSON.parse(localStorage.getItem(SAVED_KEY)) || []); } catch { return new Set(); }
}
function storeSaved() {
  try { localStorage.setItem(SAVED_KEY, JSON.stringify([...saved])); } catch { /* ignore */ }
}

const SOCIAL_RE = /(facebook\.com|fb\.com|instagram\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com|youtube\.com)/i;

function websiteStatus(t) {
  const site = t.website || t['contact:website'] || t.url || t['brand:website'];
  const socials = [t.facebook, t['contact:facebook'], t.instagram, t['contact:instagram'], t['contact:linkedin'], t['contact:tiktok']].filter(Boolean);
  if (site && !SOCIAL_RE.test(site)) return { status: 'has', site, socials };
  if (site) socials.push(site);
  return { status: socials.length ? 'social' : 'none', site: null, socials };
}

function typeOf(t) {
  const key = t.amenity || t.shop || t.craft || t.office || t.healthcare || t.tourism || t.leisure || '';
  if (t.cuisine === 'pizza') return 'Pizza';
  return TYPE_LABELS[key] || (key ? key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Virksomhed');
}

function addressOf(t) {
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  const city = [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ');
}

function toBusiness(e) {
  const t = e.tags || {};
  const cat = CATEGORIES.find(c => c.match(t));
  if (!cat || !t.name) return null;
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (lat == null || lng == null) return null;
  const ws = websiteStatus(t);
  return {
    id: `${e.type}/${e.id}`,
    name: t.name,
    lat, lng,
    category: cat.id,
    categoryLabel: cat.label,
    type: typeOf(t),
    address: addressOf(t),
    phone: t.phone || t['contact:phone'] || t.mobile || t['contact:mobile'] || '',
    email: t.email || t['contact:email'] || '',
    hours: t.opening_hours || '',
    cvr: t['ref:DK:cvr'] || t['ref:vatin'] || '',
    status: ws.status,
    website: ws.site,
    socials: ws.socials,
    tags: t,
  };
}

function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function fmtDist(km) { return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace('.', ',')} km`; }

// ---------- Fetching ----------
function buildQuery(b) {
  const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
  return `[out:json][timeout:30];
(
  nwr["name"]["shop"](${bbox});
  nwr["name"]["craft"](${bbox});
  nwr["name"]["office"](${bbox});
  nwr["name"]["healthcare"](${bbox});
  nwr["name"]["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream|biergarten|food_court|dentist|doctors|clinic|pharmacy|veterinary|car_wash|car_rental|fuel|cinema|theatre|nightclub|arts_centre|driving_school|language_school|music_school|childcare|massage)$"](${bbox});
  nwr["name"]["tourism"~"^(hotel|guest_house|hostel|motel|apartment|chalet|camp_site)$"](${bbox});
  nwr["name"]["leisure"~"^(fitness_centre|sports_centre|dance|bowling_alley|escape_game|amusement_arcade)$"](${bbox});
);
out center tags;`;
}

async function fetchOverpass(query) {
  let lastErr;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

async function loadArea() {
  if (map.getZoom() < MIN_SEARCH_ZOOM) {
    el.status.textContent = 'Zoom længere ind for at hente virksomheder i området.';
    return;
  }
  const bounds = map.getBounds();
  el.loader.hidden = false;
  el.searchArea.hidden = true;
  try {
    const data = await fetchOverpass(buildQuery(bounds));
    for (const e of data.elements) {
      const b = toBusiness(e);
      if (b && !businesses.has(b.id)) {
        businesses.set(b.id, b);
        addMarker(b);
      }
    }
    lastFetchedBounds = bounds;
    applyFilters();
  } catch (err) {
    el.status.textContent = 'Kunne ikke hente data lige nu. Prøv igen om lidt.';
    el.searchArea.hidden = false;
    console.error(err);
  } finally {
    el.loader.hidden = true;
  }
}

// ---------- Markers ----------
function addMarker(b) {
  const m = L.circleMarker([b.lat, b.lng], {
    renderer,
    radius: 6,
    weight: 1.5,
    color: '#fff',
    fillColor: COLORS[b.status],
    fillOpacity: 0.95,
  });
  m.bindTooltip(escapeHtml(b.name), { direction: 'top', offset: [0, -6] });
  m.on('click', () => select(b.id, false));
  markers.set(b.id, m);
}

// ---------- Filtering & list ----------
function matchesWebsite(b, mode) {
  switch (mode) {
    case 'none': return b.status === 'none';
    case 'social': return b.status === 'social';
    case 'none+social': return b.status !== 'has';
    case 'has': return b.status === 'has';
    default: return true;
  }
}

function applyFilters() {
  const cat = el.category.value;
  const mode = el.website.value;
  const q = el.text.value.trim().toLowerCase();
  const center = map.getCenter();
  const visibleBounds = map.getBounds();

  filtered = [];
  const counts = { none: 0, social: 0, total: 0 };
  markerLayer.clearLayers();

  for (const b of businesses.values()) {
    if (cat && b.category !== cat) continue;
    if (el.phone.checked && !b.phone) continue;
    if (el.email.checked && !b.email) continue;
    if (el.saved.checked && !saved.has(b.id)) continue;
    if (q && !(`${b.name} ${b.type} ${b.address}`.toLowerCase().includes(q))) continue;

    if (visibleBounds.contains([b.lat, b.lng])) {
      counts.total++;
      if (b.status === 'none') counts.none++;
      if (b.status === 'social') counts.social++;
    }
    if (!matchesWebsite(b, mode)) continue;

    b.dist = distanceKm(center, b);
    filtered.push(b);
    markerLayer.addLayer(markers.get(b.id));
  }

  filtered.sort((a, b) => a.dist - b.dist);
  $('stat-none').textContent = counts.none.toLocaleString('da-DK');
  $('stat-social').textContent = counts.social.toLocaleString('da-DK');
  $('stat-total').textContent = counts.total.toLocaleString('da-DK');

  shown = PAGE_SIZE;
  renderList();
}

function renderList() {
  const items = filtered.slice(0, shown);
  el.status.textContent = businesses.size
    ? `${filtered.length.toLocaleString('da-DK')} virksomheder matcher – sorteret efter afstand fra kortets midte.`
    : 'Ingen virksomheder hentet endnu.';
  el.list.innerHTML = items.map(b => `
    <li data-id="${escapeHtml(b.id)}" class="${b.id === selectedId ? 'active' : ''}">
      <i class="dot ${b.status}"></i>
      <div class="info">
        <div class="name">${saved.has(b.id) ? '<span class="star">★</span> ' : ''}${escapeHtml(b.name)}</div>
        <div class="meta">${escapeHtml(b.type)}${b.address ? ' · ' + escapeHtml(b.address) : ''}</div>
      </div>
      <span class="dist">${fmtDist(b.dist)}</span>
    </li>`).join('');
  el.more.hidden = filtered.length <= shown;
}

el.list.addEventListener('click', e => {
  const li = e.target.closest('li[data-id]');
  if (li) select(li.dataset.id, true);
});
el.more.addEventListener('click', () => { shown += PAGE_SIZE; renderList(); });

// ---------- Detail ----------
function select(id, pan) {
  const b = businesses.get(id);
  if (!b) return;
  selectedId = id;
  if (pan) map.setView([b.lat, b.lng], Math.max(map.getZoom(), 17));
  for (const m of markers.values()) m.setRadius(6);
  markers.get(id)?.setRadius(10).bringToFront();
  renderDetail(b);
  renderList();
  if (window.matchMedia('(max-width: 860px)').matches) el.panel.classList.remove('open');
}

function renderDetail(b) {
  const city = b.tags['addr:city'] || '';
  const googleQuery = encodeURIComponent(`${b.name} ${city}`.trim());
  const rows = [
    ['Branche', `${escapeHtml(b.type)} <span style="color:var(--muted)">(${escapeHtml(b.categoryLabel)})</span>`],
    b.address && ['Adresse', escapeHtml(b.address)],
    b.phone && ['Telefon', `<a href="tel:${escapeHtml(b.phone.replace(/\s/g, ''))}">${escapeHtml(b.phone)}</a>`],
    b.email && ['E-mail', `<a href="mailto:${escapeHtml(b.email)}">${escapeHtml(b.email)}</a>`],
    b.website && ['Hjemmeside', `<a href="${escapeHtml(normalizeUrl(b.website))}" target="_blank" rel="noopener">${escapeHtml(b.website)}</a>`],
    b.socials.length && ['Sociale medier', b.socials.map(s => `<a href="${escapeHtml(normalizeUrl(s))}" target="_blank" rel="noopener">${escapeHtml(socialName(s))}</a>`).join('<br>')],
    b.hours && ['Åbningstider', escapeHtml(b.hours).replace(/;\s*/g, '<br>')],
    b.cvr && ['CVR', `<a href="https://datacvr.virk.dk/soegeresultater?fritekst=${encodeURIComponent(b.cvr)}" target="_blank" rel="noopener">${escapeHtml(b.cvr)}</a>`],
    ['Afstand', fmtDist(distanceKm(map.getCenter(), b)) + ' fra kortets midte'],
  ].filter(Boolean);

  el.detail.innerHTML = `
    <button class="close" aria-label="Luk">×</button>
    <h2>${escapeHtml(b.name)}</h2>
    <div class="cat">${escapeHtml(b.type)}</div>
    <span class="badge ${b.status}">${STATUS_LABEL[b.status]}</span>
    <dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div class="actions">
      <a class="btn primary" href="https://www.google.com/search?q=${googleQuery}" target="_blank" rel="noopener">🔎 Kontrollér hjemmeside på Google</a>
      <a class="btn" href="https://www.google.com/maps/search/?api=1&query=${googleQuery}" target="_blank" rel="noopener">🗺 Se på Google Maps</a>
      <a class="btn" href="https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}" target="_blank" rel="noopener">🚗 Rutevejledning</a>
      <a class="btn" href="https://datacvr.virk.dk/soegeresultater?fritekst=${encodeURIComponent(b.name)}" target="_blank" rel="noopener">🏢 Søg i CVR-registret</a>
      <button class="btn" data-action="save">${saved.has(b.id) ? '★ Fjern fra gemte' : '☆ Gem virksomhed'}</button>
      <button class="btn" data-action="copy">📋 Kopiér oplysninger</button>
    </div>
    <p class="source">Kilde: <a href="https://www.openstreetmap.org/${escapeHtml(b.id)}" target="_blank" rel="noopener">OpenStreetMap ${escapeHtml(b.id)}</a>.
      Mangler eller er oplysningerne forkerte, kan de rettes direkte i OpenStreetMap.</p>`;
  el.detail.hidden = false;
  setTimeout(() => map.invalidateSize(), 0);

  el.detail.querySelector('.close').onclick = closeDetail;
  el.detail.querySelector('[data-action=save]').onclick = () => {
    saved.has(b.id) ? saved.delete(b.id) : saved.add(b.id);
    storeSaved();
    renderDetail(b);
    renderList();
  };
  el.detail.querySelector('[data-action=copy]').onclick = async e => {
    const text = [b.name, b.type, b.address, b.phone && `Tlf: ${b.phone}`, b.email && `E-mail: ${b.email}`,
      b.hours && `Åbningstider: ${b.hours}`, `Status: ${STATUS_LABEL[b.status]}`].filter(Boolean).join('\n');
    try { await navigator.clipboard.writeText(text); e.target.textContent = '✓ Kopieret'; }
    catch { e.target.textContent = 'Kunne ikke kopiere'; }
  };
}

function closeDetail() {
  el.detail.hidden = true;
  if (selectedId) markers.get(selectedId)?.setRadius(6);
  selectedId = null;
  renderList();
  setTimeout(() => map.invalidateSize(), 0);
}

function normalizeUrl(u) { return /^https?:\/\//i.test(u) ? u : `https://${u}`; }
function socialName(u) {
  const m = u.match(SOCIAL_RE);
  return m ? m[1].split('.')[0].replace(/^./, c => c.toUpperCase()) : u;
}

// ---------- CSV export ----------
$('export-btn').addEventListener('click', () => {
  const cols = ['Navn', 'Branche', 'Type', 'Adresse', 'Telefon', 'E-mail', 'Åbningstider', 'Status', 'Sociale medier', 'Breddegrad', 'Længdegrad', 'OSM'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = filtered.map(b => [b.name, b.categoryLabel, b.type, b.address, b.phone, b.email, b.hours,
    STATUS_LABEL[b.status], b.socials.join(' '), b.lat, b.lng, `https://www.openstreetmap.org/${b.id}`].map(q).join(';'));
  const blob = new Blob(['﻿' + [cols.map(q).join(';'), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'virksomheder.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- Search & location ----------
$('search-form').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('search-input').value.trim();
  if (!q) return;
  try {
    const res = await fetch(`${NOMINATIM_URL}?format=json&limit=1&countrycodes=dk&q=${encodeURIComponent(q)}`);
    const [hit] = await res.json();
    if (!hit) { el.status.textContent = `Fandt ikke "${q}".`; return; }
    map.setView([+hit.lat, +hit.lon], 15);
    loadArea();
  } catch {
    el.status.textContent = 'Søgningen fejlede. Prøv igen.';
  }
});

$('locate-btn').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => { map.setView([pos.coords.latitude, pos.coords.longitude], 16); loadArea(); },
    () => { el.status.textContent = 'Kunne ikke finde din placering.'; },
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

$('toggle-panel').addEventListener('click', () => el.panel.classList.toggle('open'));
el.searchArea.addEventListener('click', loadArea);

for (const input of [el.category, el.website, el.phone, el.email, el.saved]) input.addEventListener('change', applyFilters);
el.text.addEventListener('input', applyFilters);

map.on('moveend', () => {
  applyFilters();
  const b = map.getBounds();
  const covered = lastFetchedBounds && lastFetchedBounds.contains(b);
  el.searchArea.hidden = covered || map.getZoom() < MIN_SEARCH_ZOOM;
  if (map.getZoom() < MIN_SEARCH_ZOOM) el.status.textContent = 'Zoom længere ind for at hente virksomheder i området.';
});

// ---------- Start ----------
loadArea();
