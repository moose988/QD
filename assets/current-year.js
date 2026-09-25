(function () {
  'use strict';
  var year = String(new Date().getFullYear());
  document.querySelectorAll('[data-current-year]').forEach(function (node) {
    node.textContent = year;
  });
})();
