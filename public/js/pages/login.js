(function(window, document) {
  async function startBiometricLogin() {
    if (!window.PublicKeyCredential) { alert('Tu navegador no soporta inicio biométrico'); return; }
    var usuarioInput = document.querySelector('input[name="usuario"]');
    var usuario = usuarioInput && usuarioInput.value ? usuarioInput.value.trim() : '';
    if (!usuario) { alert('Ingresa tu usuario primero'); if (usuarioInput) usuarioInput.focus(); return; }
    try {
      var optRes = await fetch('/auth/webauthn/login/options?usuario=' + encodeURIComponent(usuario));
      if (!optRes.ok) { var err = await optRes.json(); alert(err.error || 'Error'); return; }
      var options = await optRes.json();
      var authResp = await window.SimpleWebAuthnBrowser.startAuthentication({ optionsJSON: options });
      authResp.usuario = usuario;
      var verifyRes = await fetch('/auth/webauthn/login/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(authResp) });
      var result = await verifyRes.json();
      if (result.ok) { window.location.href = result.redirect || '/'; } else { alert(result.error || 'Error'); }
    } catch (err) {
      if (err.name !== 'NotAllowedError') { console.error(err); alert('Error al iniciar con biometría'); }
    }
  }

  function initLogin() {}

  window.App = window.App || {};
  window.App.login = { initLogin: initLogin, startBiometricLogin: startBiometricLogin };
  window.startBiometricLogin = startBiometricLogin;

  document.addEventListener('DOMContentLoaded', function() {
    if (document.body.dataset.page === 'login') initLogin();
  });
})(window, document);
