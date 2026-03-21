// public/js/observabilidad-mapa.js
// Leaflet map with tenants, sessions, and attack heatmap layers

let mainMap = null
let miniMap = null
let markersLayer, heatLayer, clustersLayer
let refreshInterval = null

function initMapa() {
  if (mainMap) return
  const container = document.getElementById('mapa-container')
  if (!container) return

  mainMap = L.map(container).setView([-12.046, -77.042], 6) // Default: Peru
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(mainMap)

  markersLayer = L.markerClusterGroup()
  clustersLayer = L.markerClusterGroup()
  heatLayer = L.heatLayer([], { radius: 25, blur: 15, maxZoom: 10 })

  mainMap.addLayer(markersLayer)
  mainMap.addLayer(heatLayer)
  mainMap.addLayer(clustersLayer)

  // Layer toggles — IDs from EJS: layer-markers, layer-heat, layer-clusters
  const lmToggle = document.getElementById('layer-markers')
  const lhToggle = document.getElementById('layer-heat')
  const lcToggle = document.getElementById('layer-clusters')

  if (lmToggle) lmToggle.addEventListener('change', function (e) {
    e.target.checked ? mainMap.addLayer(markersLayer) : mainMap.removeLayer(markersLayer)
  })
  if (lhToggle) lhToggle.addEventListener('change', function (e) {
    e.target.checked ? mainMap.addLayer(heatLayer) : mainMap.removeLayer(heatLayer)
  })
  if (lcToggle) lcToggle.addEventListener('change', function (e) {
    e.target.checked ? mainMap.addLayer(clustersLayer) : mainMap.removeLayer(clustersLayer)
  })

  loadMapaTenants()
  loadMapaSesiones()
  loadMapaAtaques()
  // Fix map rendering in hidden tab
  setTimeout(function () { mainMap.invalidateSize() }, 200)
  refreshInterval = setInterval(loadMapaSesiones, 60000)
}

function tenantColor(estado) {
  if (estado === 'activa') return '#28a745'
  if (estado === 'vencida' || estado === 'cancelada') return '#dc3545'
  return '#6c757d'
}

async function loadMapaTenants() {
  try {
    var res = await fetch('/superadmin/observabilidad/api/mapa/tenants')
    var tenants = await res.json()
    markersLayer.clearLayers()
    tenants.forEach(function (t) {
      if (!t.geo_lat || !t.geo_lon) return
      var color = tenantColor(t.suscripcion_estado)
      var marker = L.circleMarker([t.geo_lat, t.geo_lon], {
        radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.8
      })
      marker.bindPopup(
        '<b>' + (t.nombre || '') + '</b><br>' +
        'Plan: ' + (t.plan || 'free') + '<br>' +
        'Usuarios: ' + (t.num_usuarios || 0) + '<br>' +
        'Estado: ' + (t.suscripcion_estado || 'sin suscripcion')
      )
      markersLayer.addLayer(marker)
    })
    if (tenants.length > 0) {
      var bounds = markersLayer.getBounds()
      if (bounds.isValid()) mainMap.fitBounds(bounds, { padding: [50, 50] })
    }
  } catch (err) {
    console.error('Error loading tenants map:', err)
  }
}

var lastModified = null
async function loadMapaSesiones() {
  try {
    var headers = {}
    if (lastModified) headers['If-Modified-Since'] = lastModified
    var res = await fetch('/superadmin/observabilidad/api/mapa/sesiones-activas', { headers: headers })
    if (res.status === 304) return
    lastModified = res.headers.get('Last-Modified')
    var sesiones = await res.json()
    clustersLayer.clearLayers()
    sesiones.forEach(function (s) {
      if (!s.lat || !s.lon) return
      var marker = L.circleMarker([s.lat, s.lon], {
        radius: 5, fillColor: '#007bff', color: '#fff', weight: 1, fillOpacity: 0.5
      })
      marker.bindPopup(
        '<b>' + (s.tenant_nombre || 'Unknown') + '</b><br>' +
        'IP: ' + (s.ip || '') + '<br>' +
        (s.ciudad || '') + ', ' + (s.pais || '')
      )
      clustersLayer.addLayer(marker)
    })
  } catch (err) {
    console.error('Error loading sessions:', err)
  }
}

async function loadMapaAtaques() {
  try {
    var res = await fetch('/superadmin/observabilidad/api/mapa/ataques?horas=24')
    var ataques = await res.json()
    var heatData = ataques
      .filter(function (a) { return a.geo_lat && a.geo_lon })
      .map(function (a) { return [parseFloat(a.geo_lat), parseFloat(a.geo_lon), a.intensidad || 1] })
    heatLayer.setLatLngs(heatData)
  } catch (err) {
    console.error('Error loading attacks:', err)
  }
}

// Called from observabilidad.js loadAtaques() with geo data array
function initMiniMapaAtaques(geoData) {
  var container = document.getElementById('mapa-ataques-mini')
  if (!container) {
    // No mini map container in current EJS — render heat data on main map if available
    if (mainMap && heatLayer && Array.isArray(geoData) && geoData.length > 0) {
      var heatData = geoData
        .filter(function (a) { return a.geo_lat && a.geo_lon })
        .map(function (a) { return [parseFloat(a.geo_lat), parseFloat(a.geo_lon), parseInt(a.intensidad) || 1] })
      heatLayer.setLatLngs(heatData)
    }
    return
  }

  if (miniMap) { miniMap.remove(); miniMap = null }
  miniMap = L.map(container).setView([-12.046, -77.042], 3)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OSM'
  }).addTo(miniMap)
  setTimeout(function () { miniMap.invalidateSize() }, 200)

  if (Array.isArray(geoData) && geoData.length > 0) {
    var heatData = geoData
      .filter(function (a) { return a.geo_lat && a.geo_lon })
      .map(function (a) { return [parseFloat(a.geo_lat), parseFloat(a.geo_lon), parseInt(a.intensidad) || 1] })
    if (heatData.length > 0) {
      L.heatLayer(heatData, { radius: 25, blur: 15 }).addTo(miniMap)
    }
  }
}
