/**
 * Taskifydco · Conector de formularios
 *
 * Uso: agrega data-taskifydco a tu <form> y carga este script (también acepta data-leadflow).
 *   <form data-taskifydco data-endpoint="https://TU-PROYECTO.supabase.co/functions/v1/lead-ingest"
 *         data-form-key="TU_FORM_KEY"> ... </form>
 *
 * Campos reconocidos: name, email, phone, service, type, message, opt_in.
 * Cualquier otro campo con atributo name se guarda como dato extra del contacto.
 * Incluye un campo oculto "website" vacío como trampa para bots.
 * Opcional: data-turnstile-sitekey="0x4AAAA..." activa la verificación de Cloudflare Turnstile.
 */
(function () {
  function setStatus(form, text, isError) {
    var el = form.querySelector('[data-form-status]');
    if (!el) {
      el = document.createElement('p');
      el.setAttribute('data-form-status', '');
      el.setAttribute('role', 'status');
      form.appendChild(el);
    }
    el.textContent = text;
    el.style.color = isError ? '#b3261e' : '';
  }

  // Verificación anti-bots opcional (Cloudflare Turnstile): se activa con data-turnstile-sitekey
  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (loadTurnstile.p) return loadTurnstile.p;
    loadTurnstile.p = new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      sc.async = true; sc.defer = true;
      sc.onload = function () { resolve(window.turnstile); };
      sc.onerror = reject;
      document.head.appendChild(sc);
    });
    return loadTurnstile.p;
  }

  function attach(form) {
    var widgetId = null;
    if (form.dataset.turnstileSitekey) {
      var box = document.createElement('div');
      box.className = 'form-turnstile';
      var btn = form.querySelector('[type="submit"]');
      form.insertBefore(box, btn || null);
      loadTurnstile().then(function (ts) {
        widgetId = ts.render(box, { sitekey: form.dataset.turnstileSitekey, language: 'es' });
      }).catch(function () { setStatus(form, 'No se pudo cargar la verificación. Recarga la página.', true); });
    }
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var button = form.querySelector('[type="submit"]');
      var data = {};
      new FormData(form).forEach(function (value, key) { data[key] = value; });
      var optIn = form.querySelector('[name="opt_in"]');
      data.opt_in = optIn ? optIn.checked : false;
      data.form_key = form.dataset.formKey;
      if (form.dataset.turnstileSitekey) {
        data.turnstile_token = window.turnstile && widgetId !== null ? window.turnstile.getResponse(widgetId) : '';
        if (!data.turnstile_token) { ev.preventDefault(); setStatus(form, 'Completa la verificación antes de enviar.', true); return; }
      }

      if (button) button.disabled = true;
      setStatus(form, 'Enviando…');
      try {
        var res = await fetch(form.dataset.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        var out = await res.json().catch(function () { return {}; });
        if (!res.ok) throw new Error(out.error || 'No pudimos enviar tu solicitud');
        form.reset();
        var ok = form.dataset.success || '¡Listo! Te escribiremos por WhatsApp y correo.';
        setStatus(form, out.radicado ? ok + ' Tu radicado es ' + out.radicado + '.' : ok);
        form.dispatchEvent(new CustomEvent('taskifydco:success', { detail: out }));
      } catch (err) {
        setStatus(form, err.message, true);
      } finally {
        if (button) button.disabled = false;
        if (window.turnstile && widgetId !== null) window.turnstile.reset(widgetId);
      }
    });
  }

  function init() {
    document.querySelectorAll('form[data-taskifydco], form[data-leadflow]').forEach(attach);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
