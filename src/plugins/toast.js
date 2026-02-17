/**
 * Novoid Plugin: Toast Notifications
 * Requires: core.js loaded first (window.Novoid)
 */
((Novoid) => {
  let container;

  function ensureContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'nv-toast-container';
      document.body.appendChild(container);
    }
  }

  function show(message, type = '', duration = 3000) {
    ensureContainer();
    const el = document.createElement('div');
    el.className = `nv-toast ${type ? `nv-toast-${type}` : ''}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add('nv-toast-exit');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  Novoid.toast = {
    info: (msg, d) => show(msg, '', d),
    success: (msg, d) => show(msg, 'success', d),
    danger: (msg, d) => show(msg, 'danger', d),
    warning: (msg, d) => show(msg, 'warning', d),
  };
})(window.Novoid);
