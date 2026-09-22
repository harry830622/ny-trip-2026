const VERSION = "v14";
const CACHE = `ny-trip-${VERSION}`;
const DATA_PATH = "data/itinerary.json";
const SHELL = [
  "./",
  "index.html",
  "credits.html",
  "styles.css",
  "src/main.js",
  "src/time.js",
  "src/schedule.js",
  "src/labels.js",
  "src/render.js",
  "data/itinerary.json",
  "manifest.webmanifest",
  "fonts/league-gothic-latin.woff2",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

// Bypass the HTTP cache so a new VERSION never precaches a stale copy of a file.
const fresh = (path) => new Request(path, { cache: "reload" });

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL.map(fresh));
  const itinerary = await (await cache.match(DATA_PATH)).json();
  const photos = new Set(itinerary.days.flatMap((day) => day.stops.map((stop) => stop.photo)));
  await cache.addAll([...photos].map(fresh));
  await self.skipWaiting();
}

async function dropOldCaches() {
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
  await self.clients.claim();
}

// The itinerary changes on re-sync, so prefer the network and fall back to the cached copy.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

// Everything else is versioned by VERSION. ignoreSearch lets ?at= previews load offline.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  // Preview URLs (?at=...) already match the cached page above; storing each one would only grow the cache.
  const hasQuery = new URL(request.url).search !== "";
  if (response.ok && !hasQuery) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("install", (event) => event.waitUntil(precache()));
self.addEventListener("activate", (event) => event.waitUntil(dropOldCaches()));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  event.respondWith(url.pathname.endsWith(DATA_PATH) ? networkFirst(event.request) : cacheFirst(event.request));
});
