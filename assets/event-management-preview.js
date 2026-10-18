(function () {
  'use strict';

  var samplePath = '/?wedding=luxury-wedding-demo&sample=1';
  var productionOrigin = 'https://events.qdsystems.ae';
  var isLocalPreview = window.location.port === '3000';
  var demoOrigin = isLocalPreview ? new URL(window.location.origin) : new URL(productionOrigin);
  if (isLocalPreview) demoOrigin.port = '3001';
  var demoUrl = new URL(samplePath, demoOrigin);
  var frame = document.getElementById('invitationDemoFrame');
  var loadButton = document.getElementById('loadInvitationDemo');
  var restartButton = document.getElementById('restartInvitationDemo');
  var fullDemoLink = document.getElementById('openInvitationDemo');
  var urlNote = document.getElementById('invitationDemoUrl');
  var localUrl = document.querySelector('#localDemoUrl code');
  var plannedUrl = document.querySelector('#plannedDemoUrl code');
  var localUrlLine = document.getElementById('localDemoUrl');
  var plannedUrlLine = document.getElementById('plannedDemoUrl');
  var screen = document.getElementById('dashboardShotImage');
  var panel = document.getElementById('dashboardShotPanel');

  if (!frame || !loadButton || !restartButton || !fullDemoLink) return;

  fullDemoLink.href = demoUrl.href;
  if (isLocalPreview && urlNote && localUrl && plannedUrl) {
    var plannedUrlObj = new URL(samplePath, productionOrigin);
    localUrl.textContent = demoUrl.href;
    plannedUrl.textContent = plannedUrlObj.href;
    localUrlLine.hidden = false;
    plannedUrlLine.hidden = false;
    urlNote.hidden = false;
  }

  function loadDemo() {
    if (frame.getAttribute('src') === demoUrl.href) return;
    frame.setAttribute('loading', 'eager');
    frame.src = demoUrl.href;
    loadButton.disabled = true;
    restartButton.disabled = false;
  }

  function restartDemo() {
    if (!frame.src || frame.src === 'about:blank') {
      loadDemo();
      return;
    }
    restartButton.disabled = true;
    frame.src = 'about:blank';
    window.setTimeout(function () {
      frame.src = demoUrl.href;
      restartButton.disabled = false;
    }, 40);
  }

  loadButton.addEventListener('click', loadDemo);
  restartButton.addEventListener('click', restartDemo);

  var screenshots = {
    overview: { src: '/assets/events/dashboard-overview.jpg', alt: 'overviewAlt', tab: 'dashboardTabOverview' },
    guests: { src: '/assets/events/dashboard-guests.jpg', alt: 'guestsAlt', tab: 'dashboardTabGuests' },
    seating: { src: '/assets/events/dashboard-seating.jpg', alt: 'seatingAlt', tab: 'dashboardTabSeating' },
    mobile: { src: '/assets/events/dashboard-mobile-overview.jpg', alt: 'mobileAlt', tab: 'dashboardTabMobile' },
  };

  function localized(key) {
    var lang = document.documentElement.lang || 'en';
    var pageCopy = window.QD_SERVICE_PAGE_CONTENT && window.QD_SERVICE_PAGE_CONTENT.events;
    return (pageCopy && pageCopy[lang] && pageCopy[lang][key]) || (pageCopy && pageCopy.en && pageCopy.en[key]) || key;
  }

  function selectScreenshot(name, moveFocus) {
    var shot = screenshots[name];
    if (!shot || !screen || !panel) return;
    var tab = document.getElementById(shot.tab);
    screen.src = shot.src;
    screen.alt = localized(shot.alt);
    screen.width = name === 'mobile' ? 390 : 1600;
    screen.height = name === 'mobile' ? 844 : 1000;
    panel.dataset.shot = name;
    panel.setAttribute('aria-labelledby', shot.tab);
    document.querySelectorAll('[data-dashboard-shot]').forEach(function (button) {
      var selected = button.dataset.dashboardShot === name;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    if (moveFocus && tab) tab.focus();
  }

  document.querySelectorAll('[data-dashboard-shot]').forEach(function (tab) {
    tab.addEventListener('click', function () { selectScreenshot(tab.dataset.dashboardShot, false); });
    tab.addEventListener('keydown', function (event) {
      var order = Object.keys(screenshots);
      var index = order.indexOf(tab.dataset.dashboardShot);
      var next = index;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % order.length;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + order.length - 1) % order.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = order.length - 1;
      else return;
      event.preventDefault();
      selectScreenshot(order[next], true);
    });
  });

  function updateLocalizedLabels() {
    var iframeTitle = localized('invitationFrameTitle');
    frame.title = iframeTitle;
    if (screen) {
      var current = Object.keys(screenshots).find(function (name) {
        return screen.getAttribute('src') === screenshots[name].src;
      }) || 'overview';
      screen.alt = localized(screenshots[current].alt);
    }
  }

  var languageObserver = new MutationObserver(updateLocalizedLabels);
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  updateLocalizedLabels();
})();
