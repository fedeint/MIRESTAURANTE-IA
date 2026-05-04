(function(window, document) {
  function initDividirCuenta() {
    if (!window.jQuery) return;
    var $ = window.jQuery;
    $('#btnDividirCuenta').on('click', async function() {
      var rows = $('#tbodyItems tr');
      if (!rows.length) { Swal.fire('', 'No hay items en el pedido', 'info'); return; }

      var itemsHtml = '';
      rows.each(function(i) {
        var nombre = $(this).find('td').eq(0).text().trim();
        var cant = $(this).find('td').eq(1).text().trim();
        var subt = $(this).find('td').eq(3).text().trim();
        itemsHtml += '<div class="form-check py-1 border-bottom"><input class="form-check-input dividir-check" type="checkbox" value="'+i+'" id="div'+i+'" data-subt="'+subt.replace(/[^0-9.]/g,'')+'"><label class="form-check-label d-flex justify-content-between w-100 ms-2" for="div'+i+'"><span>'+nombre+' x'+cant+'</span><strong>'+subt+'</strong></label></div>';
      });

      var result = await Swal.fire({
        title: 'Dividir cuenta',
        html: '<p class=small text-muted>Selecciona los ítems para esta factura:</p>' +
              '<div style="max-height:300px;overflow-y:auto;">'+itemsHtml+'</div>' +
              '<hr><div class="d-flex justify-content-between fw-bold"><span>Subtotal seleccionado:</span><span id="divSubtotal">S/ 0.00</span></div>',
        showCancelButton: true,
        confirmButtonText: 'Facturar selección',
        cancelButtonText: 'Cancelar',
        didOpen: function() {
          $(document).on('change.dividir', '.dividir-check', function() {
            var total = 0;
            $('.dividir-check:checked').each(function() { total += parseFloat($(this).data('subt')) || 0; });
            $('#divSubtotal').text('S/ ' + total.toFixed(2));
          });
        },
        preConfirm: function() {
          var checked = $('.dividir-check:checked');
          if (!checked.length) { Swal.showValidationMessage('Selecciona al menos 1 ítem'); return false; }
          var indices = []; checked.each(function() { indices.push(parseInt($(this).val(), 10)); });
          return indices;
        }
      });
      $(document).off('change.dividir');

      if (!result.value) return;
      Swal.fire({ icon:'info', title:'Función en desarrollo', text:'La división de cuenta selecciona ítems índices: ['+result.value.join(',')+']. Esta funcionalidad requiere un endpoint backend para facturar ítems parciales del pedido. Se implementará en la siguiente iteración.', confirmButtonText:'Entendido' });
    });
  }

  function initMesasDesktop() {
    initDividirCuenta();
  }

  window.App = window.App || {};
  window.App.mesasDesktop = { initMesasDesktop: initMesasDesktop, initDividirCuenta: initDividirCuenta };

  document.addEventListener('DOMContentLoaded', function() {
    if (document.body.dataset.page === 'mesas-desktop') initMesasDesktop();
  });
})(window, document);
