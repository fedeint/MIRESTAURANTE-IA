document.addEventListener('DOMContentLoaded', function() {
  if (document.body.dataset.page !== 'menu') return;

  const selection = [];
  const counter = document.getElementById('menu-selection-count');

  function updateCounter() {
    if (counter) {
      counter.textContent = selection.length;
    }
  }

  // Event delegation for selection buttons
  document.body.addEventListener('click', function(e) {
    const btn = e.target.closest('.menu-select-btn');
    if (!btn) return;

    const id = btn.dataset.id;
    const nombre = btn.dataset.nombre;
    const precio = parseFloat(btn.dataset.precio || 0);

    // Toggle selection
    const existingIndex = selection.findIndex(item => item.id === id);
    if (existingIndex >= 0) {
      selection.splice(existingIndex, 1);
      btn.style.background = 'transparent';
      btn.style.color = '#EF520F';
      btn.textContent = 'Seleccionar';
    } else {
      selection.push({ id, nombre, precio });
      btn.style.background = '#EF520F';
      btn.style.color = 'white';
      btn.textContent = 'Seleccionado ✓';
    }

    // Save to sessionStorage
    try {
      sessionStorage.setItem('menuSelection', JSON.stringify(selection));
      updateCounter();
    } catch (err) {
      console.warn('Could not save selection to sessionStorage', err);
    }
  });

  // Check for existing selection on page load
  try {
    const raw = sessionStorage.getItem('menuSelection');
    if (raw) {
      const items = JSON.parse(raw);
      if (Array.isArray(items)) {
        items.forEach(item => {
          selection.push(item);
          const btn = document.querySelector(`.menu-select-btn[data-id="${item.id}"]`);
          if (btn) {
            btn.style.background = '#EF520F';
            btn.style.color = 'white';
            btn.textContent = 'Seleccionado ✓';
          }
        });
        updateCounter();
      }
    }
  } catch(e) {}
});
