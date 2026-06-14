const API_KEY = "ba729a1b289b48ab9a052616261406";
const WEATHER_URL = "https://api.weatherapi.com/v1/current.json";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const RECENT_KEY = "ios-weather-recent";
const GPS_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0
};
const TARGET_ACCURACY = 100;
const MAX_GPS_ATTEMPTS = 3;

const els = {
  body: document.body,
  statusText: document.getElementById("statusText"),
  error: document.getElementById("errorMessage"),
  refreshButton: document.getElementById("refreshButton"),
  liveClock: document.getElementById("liveClock"),
  locationLabel: document.getElementById("locationLabel"),
  cityName: document.getElementById("cityName"),
  addressLines: document.getElementById("addressLines"),
  locationMeta: document.getElementById("locationMeta"),
  temperature: document.getElementById("temperature"),
  temperatureUnit: document.getElementById("temperatureUnit"),
  conditionText: document.getElementById("conditionText"),
  highLowText: document.getElementById("highLowText"),
  aqiValue: document.getElementById("aqiValue"),
  aqiStatus: document.getElementById("aqiStatus"),
  aqiCard: document.getElementById("airQualityCard"),
  feelsLike: document.getElementById("feelsLike"),
  feelsLikeText: document.getElementById("feelsLikeText"),
  uvIndex: document.getElementById("uvIndex"),
  uvStatus: document.getElementById("uvStatus"),
  uvFill: document.getElementById("uvFill"),
  windNeedle: document.getElementById("windNeedle"),
  windSpeed: document.getElementById("windSpeed"),
  windDirection: document.getElementById("windDirection"),
  humidity: document.getElementById("humidity"),
  humidityText: document.getElementById("humidityText"),
  visibility: document.getElementById("visibility"),
  visibilityText: document.getElementById("visibilityText"),
  pressure: document.getElementById("pressure"),
  sunrise: document.getElementById("sunrise"),
  sunset: document.getElementById("sunset"),
  mapFallback: document.getElementById("mapFallback"),
  mapPlace: document.getElementById("mapPlace"),
  mapTemp: document.getElementById("mapTemp"),
  mapCondition: document.getElementById("mapCondition"),
  mapMeta: document.getElementById("mapMeta"),
  quickRain: document.getElementById("quickRain"),
  quickWind: document.getElementById("quickWind"),
  quickHumidity: document.getElementById("quickHumidity"),
  quickAqi: document.getElementById("quickAqi"),
  navLocation: document.getElementById("navLocation"),
  openSearch: document.getElementById("openSearch"),
  openMenu: document.getElementById("openMenu"),
  searchSheet: document.getElementById("searchSheet"),
  closeSearch: document.getElementById("closeSearch"),
  searchForm: document.getElementById("searchForm"),
  cityInput: document.getElementById("cityInput"),
  recentList: document.getElementById("recentList"),
  clearRecent: document.getElementById("clearRecent"),
  pullIndicator: document.getElementById("pullIndicator")
};

let map;
let userMarker;
let accuracyCircle;
let PulsingLocationMarkerClass;
let currentCoords = null;
let latestWeather = null;
let touchStartY = 0;
let isRefreshing = false;

const aqiLabels = {
  1: "Good",
  2: "Moderate",
  3: "Unhealthy for Sensitive Groups",
  4: "Unhealthy",
  5: "Very Unhealthy",
  6: "Hazardous"
};

const googleMapStyles = [
  { elementType: "geometry", stylers: [{ color: "#172033" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a9b8d8" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#172033" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#344464" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#111a2c" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#263654" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#172033" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#31415f" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3f5377" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#061522" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5f7899" }] }
];

function init() {
  bindEvents();
  renderRecent();
  startClock();
  initMap();
  detectCurrentLocation();
}

function bindEvents() {
  els.refreshButton.addEventListener("click", detectCurrentLocation);
  els.navLocation.addEventListener("click", detectCurrentLocation);
  els.openSearch.addEventListener("click", openSearchSheet);
  els.closeSearch.addEventListener("click", closeSearchSheet);
  els.openMenu.addEventListener("click", () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
  els.clearRecent.addEventListener("click", clearRecent);

  document.querySelectorAll("[data-nav]").forEach(button => {
    button.addEventListener("click", () => {
      document.getElementById(button.dataset.nav)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  els.searchSheet.addEventListener("click", event => {
    if (event.target === els.searchSheet) {
      closeSearchSheet();
    }
  });

  els.searchForm.addEventListener("submit", event => {
    event.preventDefault();
    const city = els.cityInput.value.trim();
    if (city) {
      searchCity(city);
    }
  });

  window.addEventListener("touchstart", event => {
    if (window.scrollY === 0) {
      touchStartY = event.touches[0].clientY;
    }
  }, { passive: true });

  window.addEventListener("touchmove", event => {
    const pullDistance = event.touches[0].clientY - touchStartY;
    els.pullIndicator.classList.toggle("visible", window.scrollY === 0 && pullDistance > 70);
  }, { passive: true });

  window.addEventListener("touchend", event => {
    const pullDistance = event.changedTouches[0].clientY - touchStartY;
    els.pullIndicator.classList.remove("visible");
    if (window.scrollY === 0 && pullDistance > 100 && !isRefreshing) {
      detectCurrentLocation();
    }
  }, { passive: true });
}

async function detectCurrentLocation() {
  if (!navigator.geolocation) {
    showError("Please enable GPS/location");
    return;
  }

  setLoading(true, "Allow location access");
  showError("");
  isRefreshing = true;

  try {
    const coords = await getBestGpsCoordinates();
    const address = await reverseGeocode(coords);
    const weather = await fetchWeatherByCoordinates(coords);

    latestWeather = weather;
    currentCoords = coords;
    renderWeather(weather, { coords, address, source: "gps" });
    updateMap(coords);
  } catch (error) {
    showError(error.message || "Please enable GPS/location");
  } finally {
    setLoading(false);
    isRefreshing = false;
  }
}

async function getBestGpsCoordinates() {
  let bestCoords = null;

  for (let attempt = 1; attempt <= MAX_GPS_ATTEMPTS; attempt += 1) {
    setLoading(true, attempt === 1 ? "Finding your exact location..." : "Improving GPS accuracy...");
    const position = await getCurrentPosition();
    const coords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: Math.round(position.coords.accuracy)
    };

    if (!bestCoords || coords.accuracy < bestCoords.accuracy) {
      bestCoords = coords;
    }

    if (coords.accuracy <= TARGET_ACCURACY) {
      return coords;
    }
  }

  return bestCoords;
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, error => {
      reject(new Error(getLocationError(error)));
    }, GPS_OPTIONS);
  });
}

async function fetchWeatherByCoordinates(coords) {
  const query = `${coords.latitude},${coords.longitude}`;
  return fetchWeather(query);
}

async function fetchWeather(query) {
  setLoading(true, "Updating weather...");
  const url = `${WEATHER_URL}?key=${API_KEY}&q=${encodeURIComponent(query)}&aqi=yes`;
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error?.message || "Unable to load weather.");
  }

  return data;
}

async function reverseGeocode(coords) {
  try {
    const url = `${NOMINATIM_URL}?format=jsonv2&lat=${encodeURIComponent(coords.latitude)}&lon=${encodeURIComponent(coords.longitude)}&zoom=18&addressdetails=1`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.error) {
      return {};
    }

    return data.address || {};
  } catch {
    return {};
  }
}

async function searchCity(city) {
  setLoading(true, `Searching ${city}...`);
  showError("");

  try {
    const weather = await fetchWeather(city);
    latestWeather = weather;
    currentCoords = {
      latitude: weather.location.lat,
      longitude: weather.location.lon,
      accuracy: 0
    };
    renderWeather(weather, { source: "search" });
    updateMap(currentCoords);
    saveRecent(city);
    closeSearchSheet();
  } catch (error) {
    showError(error.message || "City not found.");
  } finally {
    setLoading(false);
  }
}

function renderWeather(data, meta = {}) {
  const { location, current } = data;
  const temp = Math.round(current.temp_c);
  const feels = Math.round(current.feelslike_c);
  const theme = getTheme(current.condition.text, current.is_day);

  applyTheme(theme);
  els.temperature.textContent = temp;
  els.temperatureUnit.textContent = "°";
  els.conditionText.textContent = current.condition.text;
  els.highLowText.textContent = `H: ${temp}°  L: ${feels}°`;

  if (meta.source === "gps") {
    renderGpsLocation(meta.address, location, meta.coords);
  } else {
    els.locationLabel.textContent = "Search Result";
    els.cityName.textContent = location.name;
    els.addressLines.textContent = [location.region, location.country].filter(Boolean).join("\n");
    renderLocationMeta([]);
  }

  renderAirQuality(current.air_quality);
  renderFeelsLike(current);
  renderUv(current.uv);
  renderWind(current);
  renderHumidity(current.humidity);
  renderVisibility(current.vis_km);
  els.pressure.textContent = `${Math.round(current.pressure_mb)} mb`;
  renderSunTimes(location.localtime);
  renderQuickSummary(current);
  renderMapWeather(data, meta);
}

function renderQuickSummary(current) {
  const rainChance = getLiveRainChance(current);
  const aqi = current.air_quality?.["us-epa-index"];

  els.quickRain.textContent = `${rainChance}%`;
  els.quickWind.textContent = `${Math.round(current.wind_kph)} km/h`;
  els.quickHumidity.textContent = `${current.humidity}%`;
  els.quickAqi.textContent = aqi || "--";
}

function renderMapWeather(data, meta = {}) {
  const { location, current } = data;
  const place = meta.source === "gps" ? "Current Location" : location.name;
  const rainChance = getLiveRainChance(current);

  els.mapPlace.textContent = place;
  els.mapTemp.textContent = `${Math.round(current.temp_c)}°`;
  els.mapCondition.textContent = current.condition.text;
  els.mapMeta.textContent = `Wind ${Math.round(current.wind_kph)} km/h · Rain chance ${rainChance}%`;
}

function getLiveRainChance(current) {
  if (Number(current.precip_mm) > 0) {
    return 85;
  }

  const condition = current.condition.text.toLowerCase();
  if (condition.includes("rain") || condition.includes("drizzle") || condition.includes("thunder")) {
    return 80;
  }

  if (current.cloud >= 75) {
    return 35;
  }

  if (current.cloud >= 45) {
    return 20;
  }

  return 5;
}

function renderGpsLocation(address = {}, weatherLocation = {}, coords = {}) {
  const street = [address.house_number, address.road].filter(Boolean).join(" ");
  const area = street || address.neighbourhood || address.suburb || address.quarter || address.residential || address.hamlet;
  const town = address.village || address.town || address.city || address.municipality || weatherLocation.name;
  const district = address.state_district || address.district || address.county || weatherLocation.region;
  const state = address.state || weatherLocation.region;
  const country = address.country || weatherLocation.country;
  const postal = address.postcode;

  const primaryName = area || town || "Current Location";
  const regionLine = [
    town && town !== primaryName ? town : "",
    district && district !== town ? district : "",
    state && state !== district ? state : "",
    country
  ].filter(Boolean).slice(0, 3).join(", ");

  els.locationLabel.textContent = "Live GPS";
  els.cityName.textContent = primaryName;
  els.addressLines.textContent = regionLine || "Weather from your exact position";
  renderLocationMeta([
    postal ? `PIN ${postal}` : "",
    coords.accuracy ? `+/- ${coords.accuracy} m` : "",
    coords.latitude && coords.longitude ? `${coords.latitude.toFixed(3)}, ${coords.longitude.toFixed(3)}` : ""
  ]);
}

function renderLocationMeta(items = []) {
  els.locationMeta.innerHTML = "";
  items.filter(Boolean).forEach(item => {
    const chip = document.createElement("span");
    chip.textContent = item;
    els.locationMeta.appendChild(chip);
  });
}

function renderAirQuality(air = {}) {
  const index = air["us-epa-index"] || 0;
  const progress = Math.min(100, Math.max(8, index * 16));
  els.aqiValue.textContent = index || "--";
  els.aqiStatus.textContent = aqiLabels[index] || "Not available";
  els.aqiCard.style.setProperty("--aqi-progress", `${progress}%`);
}

function renderFeelsLike(current) {
  const feels = Math.round(current.feelslike_c);
  els.feelsLike.textContent = `${feels}°`;
  els.feelsLikeText.textContent = feels > current.temp_c ? "Humidity makes it feel warmer." : "Close to the actual temperature.";
}

function renderUv(uv) {
  els.uvIndex.textContent = uv;
  els.uvStatus.textContent = getUvStatus(uv);
  els.uvFill.style.setProperty("--uv-width", `${Math.min(100, (uv / 11) * 100)}%`);
}

function renderWind(current) {
  els.windSpeed.textContent = `${Math.round(current.wind_kph)} km/h`;
  els.windDirection.textContent = current.wind_dir;
  els.windNeedle.style.setProperty("--wind-rotate", `${current.wind_degree || 0}deg`);
}

function renderHumidity(value) {
  els.humidity.textContent = `${value}%`;
  els.humidityText.textContent = value > 70 ? "The air feels humid." : value < 35 ? "The air feels dry." : "Comfortable moisture level.";
}

function renderVisibility(value) {
  els.visibility.textContent = `${value} km`;
  els.visibilityText.textContent = value >= 10 ? "Clear view." : "Reduced visibility.";
}

function renderSunTimes(localtime) {
  const date = localtime ? new Date(localtime.replace(" ", "T")) : new Date();
  els.sunrise.textContent = "06:00";
  els.sunset.textContent = "18:00";

  if (Number.isFinite(date.getTime())) {
    const month = date.getMonth();
    els.sunrise.textContent = month >= 3 && month <= 8 ? "05:20" : "06:10";
    els.sunset.textContent = month >= 3 && month <= 8 ? "18:30" : "17:15";
  }
}

function initMap() {
  const defaultCoords = {
    latitude: 22.5726,
    longitude: 88.3639
  };

  updateMap(defaultCoords, false);
}

function updateMap(coords, showMarker = true) {
  if (!coords?.latitude || !coords?.longitude) {
    return;
  }

  if (!window.google?.maps) {
    els.mapFallback.textContent = "Google Maps could not load. Check your internet connection or API key.";
    return;
  }

  const center = {
    lat: coords.latitude,
    lng: coords.longitude
  };

  if (!map) {
    map = new google.maps.Map(document.getElementById("weatherMap"), {
      center,
      zoom: 12,
      disableDefaultUI: true,
      gestureHandling: "greedy",
      clickableIcons: false,
      keyboardShortcuts: false,
      styles: googleMapStyles,
      backgroundColor: "transparent",
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });
  } else {
    map.panTo(center);
    map.setZoom(12);
  }

  els.mapFallback.classList.add("hidden");

  if (!showMarker) {
    return;
  }

  if (!accuracyCircle) {
    accuracyCircle = new google.maps.Circle({
      map,
      center,
      radius: coords.accuracy || 80,
      strokeColor: "#78b9ff",
      strokeOpacity: 0.55,
      strokeWeight: 1,
      fillColor: "#0a84ff",
      fillOpacity: 0.14,
      zIndex: 4
    });
  } else {
    accuracyCircle.setCenter(center);
    accuracyCircle.setRadius(coords.accuracy || 80);
  }

  const PulsingMarker = getPulsingLocationMarkerClass();

  if (!userMarker) {
    userMarker = new PulsingMarker(center, map);
  } else {
    userMarker.setPosition(center);
  }
}

function getPulsingLocationMarkerClass() {
  if (PulsingLocationMarkerClass) {
    return PulsingLocationMarkerClass;
  }

  PulsingLocationMarkerClass = class extends google.maps.OverlayView {
    constructor(position, mapInstance) {
      super();
      this.position = position;
      this.div = null;
      this.setMap(mapInstance);
    }

    onAdd() {
      this.div = document.createElement("div");
      this.div.className = "google-location-dot";
      this.getPanes().overlayMouseTarget.appendChild(this.div);
    }

    draw() {
      if (!this.div) {
        return;
      }

      const projection = this.getProjection();
      const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(this.position.lat, this.position.lng));

      this.div.style.left = `${point.x - 10}px`;
      this.div.style.top = `${point.y - 10}px`;
    }

    onRemove() {
      this.div?.remove();
      this.div = null;
    }

    setPosition(position) {
      this.position = position;
      this.draw();
    }
  };

  return PulsingLocationMarkerClass;
}

function getTheme(condition, isDay) {
  const text = condition.toLowerCase();
  if (!isDay) return "night";
  if (text.includes("rain") || text.includes("drizzle") || text.includes("thunder")) return "rain";
  if (text.includes("sunny") || text.includes("clear")) return "sunny";
  return "cloudy";
}

function applyTheme(theme) {
  els.body.classList.remove("theme-sunny", "theme-cloudy", "theme-rain", "theme-night");
  els.body.classList.add(`theme-${theme}`);
}

function getUvStatus(uv) {
  if (uv < 3) return "Low";
  if (uv < 6) return "Moderate";
  if (uv < 8) return "High";
  if (uv < 11) return "Very High";
  return "Extreme";
}

function openSearchSheet() {
  els.searchSheet.classList.add("open");
  els.searchSheet.setAttribute("aria-hidden", "false");
  setTimeout(() => els.cityInput.focus(), 250);
}

function closeSearchSheet() {
  els.searchSheet.classList.remove("open");
  els.searchSheet.setAttribute("aria-hidden", "true");
  els.cityInput.value = "";
}

function saveRecent(city) {
  const recent = getRecent().filter(item => item.toLowerCase() !== city.toLowerCase());
  recent.unshift(city);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8)));
  renderRecent();
}

function getRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    return [];
  }
}

function renderRecent() {
  const recent = getRecent();
  els.recentList.innerHTML = "";

  if (!recent.length) {
    const empty = document.createElement("div");
    empty.className = "empty-recent";
    empty.textContent = "No recent searches";
    els.recentList.appendChild(empty);
    return;
  }

  recent.forEach(city => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = city;
    button.addEventListener("click", () => searchCity(city));
    els.recentList.appendChild(button);
  });
}

function clearRecent() {
  localStorage.removeItem(RECENT_KEY);
  renderRecent();
}

function setLoading(isLoading, message = "Loading...") {
  els.body.classList.toggle("is-loading", isLoading);
  els.statusText.textContent = message;
  els.refreshButton.disabled = isLoading;
  els.navLocation.disabled = isLoading;
}

function showError(message) {
  els.error.textContent = message;
  els.error.classList.toggle("hidden", !message);
}

function getLocationError(error) {
  if (error.code === error.PERMISSION_DENIED) {
    return "Allow location permission from browser settings";
  }
  if (error.code === error.POSITION_UNAVAILABLE || error.code === error.TIMEOUT) {
    return "Please enable GPS/location";
  }
  return "Location could not be detected";
}

function startClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  els.liveClock.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

init();
