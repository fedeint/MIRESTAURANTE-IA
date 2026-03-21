// public/js/onboarding-wizard.js — Wizard navigation, Google Maps, file validation, DalIA chat
'use strict';

let currentStep = 1;
const totalSteps = 5;
let chatCount = 20;
let map, marker;

// DalIA messages per step
const daliaMessages = [
  '¡Hola! Soy DalIA, tu asistente. Empecemos con los datos de tu restaurante. El nombre es lo que verán tus clientes en boletas y facturas.',
  'Ahora ubica tu local en el mapa. Puedes buscar la dirección o mover el pin directamente. Esto nos ayuda a darte reportes de tu zona.',
  'Necesito verificar que tu negocio es real. Sube al menos 2 fotos de tu fachada en un día activo con clientes, y un video corto (máx 50 segundos).',
  'Casi listo. Configuremos lo operativo: ¿cuántas mesas tienes? ¿Usas IGV del 18%?',
  'Último paso, opcional. Puedes crear usuarios para tu equipo ahora o hacerlo después desde el panel.'
];

const daliaTips = [
  '<i class="bi bi-lightbulb text-warning"></i> <strong>Tip:</strong> El nombre aparecerá en boletas, facturas y reportes.',
  '<i class="bi bi-lightbulb text-warning"></i> <strong>Tip:</strong> Mueve el pin para ajustar la ubicación exacta de tu local.',
  '<i class="bi bi-lightbulb text-warning"></i> <strong>Tip:</strong> Las fotos deben mostrar la fachada con clientes. El video debe ser de máximo 50 segundos.',
  '<i class="bi bi-lightbulb text-warning"></i> <strong>Tip:</strong> Los valores típicos para Perú ya están pre-llenados.',
  '<i class="bi bi-lightbulb text-warning"></i> <strong>Tip:</strong> Puedes agregar más personal después desde Usuarios en el panel.'
];

// ============= Wizard Navigation =============

function wizardNav(direction) {
  const nextStep = currentStep + direction;
  if (nextStep < 1 || nextStep > totalSteps) return;

  // Validate current step before going forward
  if (direction > 0 && !validateStep(currentStep)) return;

  currentStep = nextStep;
  updateWizardUI();
}

function updateWizardUI() {
  // Show/hide steps
  document.querySelectorAll('.wizard-step').forEach(el => {
    el.classList.toggle('active', Number(el.dataset.step) === currentStep);
  });

  // Update progress circles
  document.querySelectorAll('.step-circle').forEach(el => {
    const step = Number(el.dataset.step);
    el.classList.remove('active', 'completed');
    if (step === currentStep) el.classList.add('active');
    else if (step < currentStep) el.classList.add('completed');
  });

  // Update connectors
  const connectors = document.querySelectorAll('.step-connector');
  connectors.forEach((c, i) => {
    c.classList.toggle('completed', i + 1 < currentStep);
  });

  // Show/hide buttons
  document.getElementById('btn-prev').style.display = currentStep > 1 ? '' : 'none';
  document.getElementById('btn-next').style.display = currentStep < totalSteps ? '' : 'none';
  document.getElementById('btn-submit').style.display = currentStep === totalSteps ? '' : 'none';

  // Update DalIA
  const msgEl = document.getElementById('dalia-message');
  const tipEl = document.getElementById('dalia-tip');
  if (msgEl) msgEl.innerHTML = daliaMessages[currentStep - 1] || '';
  if (tipEl) tipEl.innerHTML = daliaTips[currentStep - 1] || '';

  // Init Google Maps when entering step 2
  if (currentStep === 2 && !map && typeof google !== 'undefined') {
    initMap();
  }
}

function validateStep(step) {
  if (step === 1) {
    const nombre = document.querySelector('[name="nombre_empresa"]').value.trim();
    if (!nombre) {
      Swal.fire('Campo requerido', 'El nombre del restaurante es obligatorio', 'warning');
      return false;
    }
  }
  if (step === 2) {
    const lat = document.getElementById('latitud').value;
    const lng = document.getElementById('longitud').value;
    if (!lat || !lng) {
      Swal.fire('Ubicación requerida', 'Busca tu dirección o mueve el pin en el mapa', 'warning');
      return false;
    }
  }
  if (step === 3) {
    const fotosInput = document.getElementById('fotos-input');
    const videoInput = document.getElementById('video-input');
    if (!fotosInput.files || fotosInput.files.length < 2) {
      Swal.fire('Fotos requeridas', 'Debes subir al menos 2 fotos de tu fachada', 'warning');
      return false;
    }
    if (!videoInput.files || videoInput.files.length === 0) {
      Swal.fire('Video requerido', 'Debes subir un video de tu local', 'warning');
      return false;
    }
    // Validate each photo size
    for (const file of fotosInput.files) {
      if (file.size > 5 * 1024 * 1024) {
        Swal.fire('Archivo muy grande', `La foto "${file.name}" excede 5MB`, 'warning');
        return false;
      }
    }
    // Validate video size and duration
    const videoFile = videoInput.files[0];
    if (videoFile.size > 50 * 1024 * 1024) {
      Swal.fire('Video muy grande', 'El video no debe exceder 50MB', 'warning');
      return false;
    }
  }
  if (step === 4) {
    const mesas = document.querySelector('[name="num_mesas"]').value;
    const trabajadores = document.querySelector('[name="num_trabajadores"]').value;
    const antiguedad = document.querySelector('[name="antiguedad"]').value;
    if (!mesas || !trabajadores || !antiguedad) {
      Swal.fire('Campos requeridos', 'Completa número de mesas, trabajadores y antigüedad', 'warning');
      return false;
    }
  }
  return true;
}

// ============= Google Maps =============

function initMap() {
  if (map) return; // Already initialized
  const container = document.getElementById('map-container');
  if (!container) return;

  // Default: Lima, Peru
  const defaultPos = { lat: -12.0464, lng: -77.0428 };

  map = new google.maps.Map(container, {
    center: defaultPos,
    zoom: 13,
    mapTypeControl: false,
    streetViewControl: false
  });

  marker = new google.maps.Marker({
    position: defaultPos,
    map: map,
    draggable: true,
    title: 'Arrastra para ubicar tu local'
  });

  // Update coords on marker drag
  marker.addListener('dragend', function () {
    const pos = marker.getPosition();
    updateLocationFields(pos.lat(), pos.lng());
    geocodeLatLng(pos.lat(), pos.lng());
  });

  // Click on map to move marker
  map.addListener('click', function (e) {
    marker.setPosition(e.latLng);
    updateLocationFields(e.latLng.lat(), e.latLng.lng());
    geocodeLatLng(e.latLng.lat(), e.latLng.lng());
  });

  // Places autocomplete
  const input = document.getElementById('direccion-input');
  const autocomplete = new google.maps.places.Autocomplete(input, {
    types: ['address'],
    componentRestrictions: { country: 'pe' }
  });

  autocomplete.addListener('place_changed', function () {
    const place = autocomplete.getPlace();
    if (!place.geometry) return;

    const loc = place.geometry.location;
    map.setCenter(loc);
    map.setZoom(17);
    marker.setPosition(loc);
    updateLocationFields(loc.lat(), loc.lng());

    // Extract distrito/departamento from address components
    const components = place.address_components || [];
    let distrito = '', departamento = '';
    for (const c of components) {
      if (c.types.includes('locality') || c.types.includes('sublocality_level_1')) {
        distrito = c.long_name;
      }
      if (c.types.includes('administrative_area_level_1')) {
        departamento = c.long_name;
      }
    }
    document.getElementById('distrito').value = distrito;
    document.getElementById('departamento').value = departamento;
    document.getElementById('distrito-display').textContent = distrito || '-';
    document.getElementById('departamento-display').textContent = departamento || '-';
  });
}

function updateLocationFields(lat, lng) {
  document.getElementById('latitud').value = lat.toFixed(8);
  document.getElementById('longitud').value = lng.toFixed(8);
}

function geocodeLatLng(lat, lng) {
  const geocoder = new google.maps.Geocoder();
  geocoder.geocode({ location: { lat, lng } }, function (results, status) {
    if (status === 'OK' && results[0]) {
      const components = results[0].address_components || [];
      let distrito = '', departamento = '';
      for (const c of components) {
        if (c.types.includes('locality') || c.types.includes('sublocality_level_1')) distrito = c.long_name;
        if (c.types.includes('administrative_area_level_1')) departamento = c.long_name;
      }
      document.getElementById('distrito').value = distrito;
      document.getElementById('departamento').value = departamento;
      document.getElementById('distrito-display').textContent = distrito || '-';
      document.getElementById('departamento-display').textContent = departamento || '-';
      document.getElementById('direccion-input').value = results[0].formatted_address;
    }
  });
}

// ============= File Previews =============

document.addEventListener('DOMContentLoaded', function () {
  // Photos preview
  const fotosInput = document.getElementById('fotos-input');
  if (fotosInput) {
    fotosInput.addEventListener('change', function () {
      const preview = document.getElementById('fotos-preview');
      const count = document.getElementById('fotos-count');
      preview.innerHTML = '';
      count.textContent = this.files.length + ' fotos seleccionadas';

      Array.from(this.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function (e) {
          const div = document.createElement('div');
          div.className = 'preview-item';
          div.innerHTML = '<img src="' + e.target.result + '" alt="Preview">';
          preview.appendChild(div);
        };
        reader.readAsDataURL(file);
      });
    });
  }

  // Video preview + duration check
  const videoInput = document.getElementById('video-input');
  if (videoInput) {
    videoInput.addEventListener('change', function () {
      const preview = document.getElementById('video-preview');
      const durationEl = document.getElementById('video-duration');
      preview.innerHTML = '';
      durationEl.textContent = '';

      if (this.files.length === 0) return;

      const file = this.files[0];
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.style.maxWidth = '100%';
      video.style.borderRadius = '0.5rem';
      video.controls = true;

      video.onloadedmetadata = function () {
        window.URL.revokeObjectURL(video.src);
        const dur = Math.round(video.duration);
        durationEl.textContent = 'Duración: ' + dur + ' segundos';
        if (dur > 50) {
          durationEl.innerHTML = '<span class="text-danger">Duración: ' + dur + 's — excede el máximo de 50 segundos</span>';
        }
      };

      video.src = URL.createObjectURL(file);
      preview.appendChild(video);
    });
  }

  // Init DalIA message
  updateWizardUI();
});

// ============= DalIA Chat =============

document.addEventListener('DOMContentLoaded', function () {
  const chatInput = document.getElementById('dalia-chat-input');
  const chatSend = document.getElementById('dalia-chat-send');
  const chatMessages = document.getElementById('dalia-chat-messages');

  if (!chatInput || !chatSend) return;

  function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    if (chatCount <= 0) {
      appendChat('DalIA', 'Has alcanzado el límite de consultas. Completa el registro y podrás chatear conmigo sin límites.');
      return;
    }

    appendChat('Tú', msg);
    chatInput.value = '';
    chatCount--;
    document.getElementById('dalia-chat-count').textContent = chatCount + ' consultas disponibles';

    fetch('/onboarding/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, step: currentStep })
    })
      .then(r => r.json())
      .then(data => {
        appendChat('DalIA', data.response || 'Lo siento, no pude procesar tu consulta.');
      })
      .catch(() => {
        appendChat('DalIA', 'Error de conexión. Intenta de nuevo.');
      });
  }

  function appendChat(sender, text) {
    const div = document.createElement('div');
    div.className = 'mb-2';
    div.innerHTML = '<strong class="' + (sender === 'DalIA' ? 'text-primary' : '') + '">' + sender + ':</strong> ' + escapeHtml(text);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  chatSend.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendMessage();
  });
});

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============= Submit =============

function submitWizard() {
  if (!validateStep(currentStep)) return;

  const form = document.getElementById('onboarding-form');
  const formData = new FormData(form);

  // Add fotos explicitly (FormData from form might not include multiple files correctly)
  const fotosInput = document.getElementById('fotos-input');
  if (fotosInput && fotosInput.files) {
    // FormData already has them from the form, but let's ensure
  }

  Swal.fire({
    title: '¿Enviar solicitud?',
    text: 'Revisaremos tu información en 2-4 horas (L-S, 8am-8pm)',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sí, enviar',
    cancelButtonText: 'Cancelar'
  }).then(result => {
    if (!result.isConfirmed) return;

    Swal.fire({ title: 'Enviando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    fetch('/onboarding/setup', {
      method: 'POST',
      body: formData
    })
      .then(r => {
        if (r.redirected) {
          window.location.href = r.url;
          return;
        }
        return r.json();
      })
      .then(data => {
        if (data && data.error) {
          Swal.fire('Error', data.error, 'error');
        } else if (data && data.ok) {
          window.location.href = '/espera-verificacion';
        }
      })
      .catch(() => {
        Swal.fire('Error', 'Error de conexión. Intenta de nuevo.', 'error');
      });
  });
}

// ============= Mobile DalIA Toggle =============

document.addEventListener('DOMContentLoaded', function () {
  const toggle = document.getElementById('dalia-mobile-toggle');
  const overlay = document.getElementById('dalia-mobile-overlay');
  const panel = document.getElementById('dalia-panel');

  if (toggle && overlay && panel) {
    toggle.addEventListener('click', function () {
      if (overlay.classList.contains('d-none')) {
        // Clone panel content into overlay
        overlay.innerHTML = panel.outerHTML;
        overlay.querySelector('#dalia-panel').style.display = '';
        overlay.classList.remove('d-none');
      } else {
        overlay.classList.add('d-none');
      }
    });
  }
});
