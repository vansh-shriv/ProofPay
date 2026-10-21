// Applies the saved (or system) theme before first paint, so there is no flash of the wrong theme.
(function () {
  var t = null;
  try { t = localStorage.getItem('proofpay-theme'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();
