// app.js — V1 (Google Maps only, no Citymapper)

async function loadData() {
  // POZOR: u tebe se soubor jmenuje itinery.json
  const res = await fetch("./data/itinery.json");
  if (!res.ok) throw new Error(`Nelze načíst JSON: ${res.status} ${res.statusText}`);
  return res.json();
}

function googleDirectionsLink(origin, destination, mode) {
  // mode: "transit" | "walking"
  const o = encodeURIComponent(origin);
  const d = encodeURIComponent(destination);
  return `https://www.google.com/maps/dir/?api=1&origin=${o}&destination=${d}&travelmode=${mode}`;
}

function googlePlaceSearchLink(query) {
  // fallback: když chceš jen otevřít místo v mapě
  const q = encodeURIComponent(query);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function el(tag, attrs = {}, html = "") {
  const e = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "className") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else e.setAttribute(k, v);
  });
  if (html) e.innerHTML = html;
  return e;
}

// Map (Leaflet)
let map, markersLayer, polylineLayer;

function initMap() {
  map = L.map("map").setView([51.5074, -0.1278], 12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
  polylineLayer = L.layerGroup().addTo(map);
}

function clearMap() {
  markersLayer.clearLayers();
  polylineLayer.clearLayers();
}

function addMarkersAndLine(stops) {
  const latlngs = [];

  stops.forEach((s, idx) => {
    if (typeof s.lat === "number" && typeof s.lng === "number") {
      const ll = [s.lat, s.lng];
      latlngs.push(ll);

      const marker = L.marker(ll).bindPopup(`<b>${idx + 1}. ${s.name}</b>`);
      marker.addTo(markersLayer);
    }
  });

  if (latlngs.length >= 2) {
    const line = L.polyline(latlngs, { color: "#0b5bd3", weight: 4, opacity: 0.7 });
    line.addTo(polylineLayer);

    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [30, 30] });
  } else if (latlngs.length === 1) {
    map.setView(latlngs[0], 14);
  }
}

function badgeForStop(stop) {
  const badges = [];
  if (stop.type === "fixed") badges.push("FIX");
  if (stop.type === "food") badges.push("JÍDLO");
  if (stop.type === "mustsee_walkby") badges.push("MUST-SEE");
  if (stop.type === "base") badges.push("HOTEL/BASE");
  return badges.map(b => `<span class="badge">${b}</span>`).join("");
}

function recommendedMode(prevStop, stop) {
  // jednoduchá heuristika:
  // - pokud je to stejné místo (hotel->hotel), walking
  // - pub->hotel walking
  // - jinak transit
  const prevName = (prevStop?.name || "").toLowerCase();
  const name = (stop?.name || "").toLowerCase();

  if (!prevStop) return "transit";

  const sameAddress = prevStop.address && stop.address && prevStop.address === stop.address;
  if (sameAddress) return "walking";

  if (prevName.includes("victoria paddington") && name.includes("hotel")) return "walking";
  if (prevName.includes("hotel") && name.includes("victoria paddington")) return "walking";

  return "transit";
}

function renderDay(day, trip) {
  const dayMeta = document.getElementById("dayMeta");
  const dayStops = document.getElementById("dayStops");

  dayMeta.innerHTML = `<b>${day.label}</b> — ${day.theme}<br>${day.notes || ""}`;
  dayStops.innerHTML = "";

  clearMap();

  // Vykreslení karet + linků
  day.stops.forEach((stop, idx) => {
    const card = el("div", { className: "card" });

    const top = el("div", { className: "cardTop" });
    const left = el("div");
    left.appendChild(el("div", { className: "name" }, stop.name));
    left.appendChild(el("div", { className: "meta" }, `
      ${stop.time ? `⏰ <b>${stop.time}</b><br>` : ""}
      ${stop.address ? `${stop.address}` : ""}
    `));

    const right = el("div", { className: "badges", html: badgeForStop(stop) });
    top.appendChild(left);
    top.appendChild(right);
    card.appendChild(top);

    // Links
    const links = el("div", { className: "links" });

    // Official website
    if (stop.website) {
      links.appendChild(el("a", { href: stop.website, target: "_blank", rel: "noopener" }, "🌐 Web"));
    }

    // Open in Google Maps (place)
    if (stop.address) {
      links.appendChild(el("a", { href: googlePlaceSearchLink(stop.address), target: "_blank", rel: "noopener" }, "📍 Otevřít v mapě"));
    }

    // Directions from previous stop → this stop
    if (idx > 0) {
      const prev = day.stops[idx - 1];
      const mode = recommendedMode(prev, stop); // transit/walking
      const modeLabel = mode === "walking" ? "🚶 Pěšky" : "🚇 MHD";

      if (prev.address && stop.address) {
        links.appendChild(
          el(
            "a",
            {
              href: googleDirectionsLink(prev.address, stop.address, mode),
              target: "_blank",
              rel: "noopener"
            },
            `${modeLabel}: ${idx}. → ${idx + 1}.`
          )
        );
      }
    } else {
      // idx === 0 → start point: show directions from hotel only if stop is not hotel (optional)
      // necháváme prázdné, protože první stop je často hotel/letiště
    }

    card.appendChild(links);
    dayStops.appendChild(card);
  });

  // Map markers + polyline (in given order)
  addMarkersAndLine(day.stops);
}

async function main() {
  try {
    const data = await loadData();

    document.getElementById("dates").textContent = data.trip.dates || "";
    document.getElementById("hotelName").textContent = data.trip.hotel.name || "";

    const daySelect = document.getElementById("daySelect");
    daySelect.innerHTML = "";

    data.days.forEach((d, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = `${d.label} — ${d.theme}`;
      daySelect.appendChild(opt);
    });

    initMap();

    // initial render
    renderDay(data.days[0], data.trip);

    daySelect.addEventListener("change", () => {
      const idx = Number(daySelect.value);
      renderDay(data.days[idx], data.trip);
    });

  } catch (err) {
    console.error(err);
    const meta = document.getElementById("dayMeta");
    meta.innerHTML = `<b>Chyba:</b> ${err.message}<br><span style="color:#666">Otevři DevTools (F12) → Console.</span>`;
  }
}

main();
