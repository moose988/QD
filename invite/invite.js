import { auth, db } from '../firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  INVITATIONS_COLLECTION,
  INVITATION_RSVPS_COLLECTION,
  buildEventDateTime,
  buildGoogleCalendarUrl,
  buildInvitationWhatsappMessage,
  buildWhatsappShareUrl,
  buildWazeUrl,
  deriveCoupleDisplayName,
  downloadIcsFile,
  formatInviteEventDate,
  isInvitationPubliclyAvailable,
  isRsvpDeadlinePassed
} from './invite-shared.js';

const loadingEl = document.getElementById('invite-loading');
const emptyEl = document.getElementById('invite-empty');
const openingEl = document.getElementById('invite-opening');
const pageEl = document.getElementById('invite-page');
const topbarEl = document.getElementById('invite-topbar');
const langToggleEl = document.getElementById('invite-lang-toggle');
const audioToggleEl = document.getElementById('invite-audio-toggle');
const audioPlayerEl = document.getElementById('invite-audio-player');
const rsvpFormEl = document.getElementById('invite-rsvp-form');
const rsvpSectionEl = document.getElementById('invite-rsvp-section');
const rsvpFeedbackEl = document.getElementById('invite-rsvp-feedback');
const rsvpDeadlineEl = document.getElementById('invite-rsvp-deadline');
const rsvpClosedEl = document.getElementById('invite-rsvp-closed');
const guestsFieldEl = document.getElementById('invite-guests-field');
const openingBtnEl = document.getElementById('invite-opening-btn');
const particlesEl = document.getElementById('invite-particles');

const labels = {
  en: {
    invite: 'We invite you to celebrate',
    welcome: 'Welcome',
    pressToOpen: 'Press to Open',
    openingSub: 'A private celebration awaits',
    countdownLabel: 'Countdown',
    countdownHeading: 'Counting down to the big day',
    days: 'Days',
    hours: 'Hours',
    minutes: 'Minutes',
    seconds: 'Seconds',
    location: 'Location',
    openLocation: 'Open Location',
    openWaze: 'Open in Waze',
    addToCalendar: 'Add to Calendar',
    rsvp: 'RSVP',
    rsvpHeading: 'Confirm your attendance',
    rsvpDeadline: 'Please respond by',
    rsvpClosed: 'RSVP is now closed.',
    name: 'Guest name',
    phone: 'Phone number',
    attending: 'Attending',
    attendingPlaceholder: 'Select…',
    attendingYes: 'Yes, I will attend',
    attendingNo: 'No, I cannot attend',
    guests: 'Number of guests',
    message: 'Message (optional)',
    send: 'Send RSVP',
    share: 'Share on WhatsApp',
    muteMusic: 'Mute music',
    unmuteMusic: 'Unmute music',
    loadingBadge: 'Preparing invitation',
    loadingTitle: 'Loading celebration details...',
    unavailableBadge: 'Private Invitation',
    unavailableTitle: 'Invitation not available',
    unavailableMessage: 'This invitation link is missing, inactive, or no longer available.',
    inactive: 'This invitation is not currently active.',
    invalid: 'This invitation link is missing or invalid.',
    rsvpSuccess: 'Thank you. Your RSVP has been received.',
    rsvpError: 'Could not submit RSVP right now. Please try again.',
    rsvpNameRequired: 'Please enter your name.',
    rsvpPhoneRequired: 'Please enter your phone number.',
    rsvpAttendingRequired: 'Please confirm whether you are attending.',
    rsvpGuestsRequired: 'Please enter the number of guests.',
    rsvpGuestsInvalid: 'Guest count must be a positive number.',
    rsvpSaving: 'Sending…',
    countdownPassed: 'This celebration date has already passed.',
    previewDenied: 'This preview requires an authenticated admin session.',
    connectionTimeout: 'The invitation took too long to load. Please refresh and try again.',
    loadError: 'A loading error occurred while fetching this invitation.'
  },
  ar: {
    invite: 'ندعوكم للاحتفال',
    welcome: 'أهلاً وسهلاً',
    pressToOpen: 'اضغط للفتح',
    openingSub: 'احتفال خاص بانتظاركم',
    countdownLabel: 'العد التنازلي',
    countdownHeading: 'نعد اللحظات حتى الموعد',
    days: 'أيام',
    hours: 'ساعات',
    minutes: 'دقائق',
    seconds: 'ثواني',
    location: 'الموقع',
    openLocation: 'افتح الموقع',
    openWaze: 'افتح في ويز',
    addToCalendar: 'أضف إلى التقويم',
    rsvp: 'تأكيد الحضور',
    rsvpHeading: 'أكدوا حضوركم',
    rsvpDeadline: 'يرجى التأكيد قبل',
    rsvpClosed: 'تم إغلاق تأكيد الحضور.',
    name: 'اسم الضيف',
    phone: 'رقم الهاتف',
    attending: 'الحضور',
    attendingPlaceholder: 'اختر…',
    attendingYes: 'نعم، سأحضر',
    attendingNo: 'لا، لن أحضر',
    guests: 'عدد الضيوف',
    message: 'رسالة (اختياري)',
    send: 'إرسال تأكيد الحضور',
    share: 'مشاركة عبر واتساب',
    muteMusic: 'كتم الموسيقى',
    unmuteMusic: 'تشغيل الموسيقى',
    loadingBadge: 'جاري تحضير الدعوة',
    loadingTitle: 'جاري تحميل تفاصيل الاحتفال...',
    unavailableBadge: 'دعوة خاصة',
    unavailableTitle: 'الدعوة غير متاحة',
    unavailableMessage: 'رابط الدعوة غير موجود أو غير مفعّل أو لم يعد متاحاً.',
    inactive: 'هذه الدعوة غير مفعلة حالياً.',
    invalid: 'رابط الدعوة غير صالح أو مفقود.',
    rsvpSuccess: 'شكراً لكم، تم استلام تأكيد الحضور.',
    rsvpError: 'تعذر إرسال التأكيد حالياً، يرجى المحاولة مرة أخرى.',
    rsvpNameRequired: 'يرجى إدخال الاسم.',
    rsvpPhoneRequired: 'يرجى إدخال رقم الهاتف.',
    rsvpAttendingRequired: 'يرجى تأكيد الحضور.',
    rsvpGuestsRequired: 'يرجى إدخال عدد الضيوف.',
    rsvpGuestsInvalid: 'يجب أن يكون عدد الضيوف رقماً موجباً.',
    rsvpSaving: 'جاري الإرسال…',
    countdownPassed: 'لقد مضى موعد هذا الاحتفال بالفعل.',
    previewDenied: 'المعاينة تتطلب تسجيل دخول المسؤول.',
    connectionTimeout: 'استغرق التحميل وقتاً طويلاً. يرجى تحديث الصفحة.',
    loadError: 'حدث خطأ أثناء تحميل الدعوة.'
  }
};

const themeColorMap = {
  'royal-gold': '#d9b45f',
  'minimal-white': '#b98f56',
  'modern-black': '#7dd3fc',
  'arabic-luxury': '#d6b461',
  'floral-elegant': '#f4a6b8'
};

const state = {
  invitation: null,
  language: 'en',
  preview: false,
  opened: false,
  countdownTimer: null,
  isAudioPlaying: false,
  isAudioMuted: false,
  rsvpSubmitting: false
};

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const withTimeout = (promise, ms = 12000) => Promise.race([
  promise,
  new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error('Invitation request timed out.')), ms);
  })
]);

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const copy = () => labels[state.language] || labels.en;

const stopLoading = () => {
  loadingEl.hidden = true;
};

const getRequestContext = () => {
  const params = new URLSearchParams(window.location.search);
  const preview = params.get('preview') === '1';
  const invitationId = String(params.get('invitationId') || params.get('id') || '').trim();
  const fromQuery = String(params.get('slug') || '').trim().toLowerCase();
  if (fromQuery) return { slug: fromQuery, preview, invitationId };

  const cleanPath = window.location.pathname.replace(/\/+$/, '');
  const parts = cleanPath.split('/').filter(Boolean).map((part) => decodeURIComponent(part.trim().toLowerCase()));
  const idx = parts.indexOf('invite');
  const slug = idx >= 0 && parts[idx + 1] && parts[idx + 1] !== 'index.html' ? parts[idx + 1] : '';
  return { slug, preview, invitationId };
};

const setTheme = (theme) => {
  document.body.dataset.theme = theme || 'royal-gold';
  const themeColor = themeColorMap[theme] || '#d9b45f';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor);
};

const showEmpty = (message, title, badge) => {
  stopLoading();
  openingEl.hidden = true;
  pageEl.hidden = true;
  topbarEl.hidden = true;
  emptyEl.hidden = false;
  const t = copy();
  emptyEl.innerHTML = `
    <div class="invite-empty-card">
      <div class="invite-empty-badge">${esc(badge || t.unavailableBadge)}</div>
      <h1>${esc(title || t.unavailableTitle)}</h1>
      <p>${esc(message || t.unavailableMessage)}</p>
    </div>
  `;
};

const waitForAuthReady = (timeoutMs = 8000) => new Promise((resolve) => {
  let settled = false;
  const finish = (user) => {
    if (settled) return;
    settled = true;
    resolve(user || null);
  };
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    finish(user);
  }, () => {
    unsubscribe();
    finish(null);
  });
  window.setTimeout(() => {
    try { unsubscribe(); } catch {}
    finish(auth.currentUser || null);
  }, timeoutMs);
});

const classifyInviteError = (error, { preview = false } = {}) => {
  const t = labels.en;
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (code.includes('permission') || message.includes('permission')) {
    return preview
      ? { title: 'Preview unavailable', message: t.previewDenied }
      : { title: t.unavailableTitle, message: t.unavailableMessage };
  }
  if (message.includes('timed out')) {
    return { title: t.unavailableTitle, message: t.connectionTimeout };
  }
  return { title: t.unavailableTitle, message: t.loadError };
};

const spawnParticles = () => {
  if (!particlesEl || prefersReducedMotion()) return;
  particlesEl.innerHTML = '';
  const count = 18;
  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'invite-particle';
    dot.style.left = `${Math.random() * 100}%`;
    dot.style.animationDelay = `${Math.random() * 4}s`;
    dot.style.animationDuration = `${4 + Math.random() * 5}s`;
    particlesEl.appendChild(dot);
  }
};

const applyLanguage = () => {
  const invitation = state.invitation;
  if (!invitation) return;

  const t = copy();
  const dir = state.language === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = state.language;
  document.documentElement.dir = dir;
  document.body.dir = dir;
  document.title = `${deriveCoupleDisplayName(invitation, state.language)} | Wedding Invitation`;

  document.getElementById('invite-loading-badge').textContent = t.loadingBadge;
  document.getElementById('invite-loading-title').textContent = t.loadingTitle;
  document.getElementById('invite-opening-welcome').textContent = t.welcome;
  document.getElementById('invite-opening-sub').textContent = t.openingSub;
  document.getElementById('invite-opening-btn-text').textContent = t.pressToOpen;
  document.getElementById('invite-kicker').textContent = t.invite;
  document.getElementById('invite-countdown-label').textContent = t.countdownLabel;
  document.getElementById('invite-countdown-heading').textContent = t.countdownHeading;
  document.getElementById('label-days').textContent = t.days;
  document.getElementById('label-hours').textContent = t.hours;
  document.getElementById('label-minutes').textContent = t.minutes;
  document.getElementById('label-seconds').textContent = t.seconds;
  document.getElementById('invite-location-label').textContent = t.location;
  document.getElementById('invite-rsvp-label').textContent = t.rsvp;
  document.getElementById('invite-rsvp-heading').textContent = t.rsvpHeading;
  document.getElementById('label-rsvp-name').textContent = t.name;
  document.getElementById('label-rsvp-phone').textContent = t.phone;
  document.getElementById('label-rsvp-attending').textContent = t.attending;
  document.getElementById('option-attending-placeholder').textContent = t.attendingPlaceholder;
  document.getElementById('option-attending-yes').textContent = t.attendingYes;
  document.getElementById('option-attending-no').textContent = t.attendingNo;
  document.getElementById('label-rsvp-guests').textContent = t.guests;
  document.getElementById('label-rsvp-message').textContent = t.message;
  document.getElementById('invite-rsvp-submit').textContent = t.send;
  document.getElementById('invite-whatsapp-btn').textContent = t.share;
  langToggleEl.textContent = state.language === 'ar' ? 'EN' : 'AR';

  const locationBtn = document.getElementById('invite-location-btn');
  const locationLink = document.getElementById('invite-location-link');
  locationBtn.textContent = t.openLocation;
  locationLink.textContent = t.openLocation;

  const wazeBtn = document.getElementById('invite-waze-btn');
  const wazeLink = document.getElementById('invite-waze-link');
  wazeBtn.textContent = t.openWaze;
  wazeLink.textContent = t.openWaze;

  document.getElementById('invite-calendar-btn').textContent = t.addToCalendar;
  audioToggleEl.setAttribute('aria-label', state.isAudioMuted ? t.unmuteMusic : t.muteMusic);
  audioToggleEl.classList.toggle('is-muted', state.isAudioMuted);

  document.getElementById('invite-couple').textContent = deriveCoupleDisplayName(invitation, state.language);
  document.getElementById('invite-title').textContent = invitation.eventTitle || 'Wedding Invitation';
  document.getElementById('invite-date').textContent = formatInviteEventDate(invitation.eventDate, state.language);
  document.getElementById('invite-time').textContent = invitation.eventTime || '';
};

const updateCountdown = () => {
  const target = buildEventDateTime(state.invitation);
  const noteEl = document.getElementById('invite-countdown-note');
  const sectionEl = document.getElementById('invite-countdown-section');
  if (!target) {
    noteEl.textContent = '';
    return;
  }

  const diff = target.getTime() - Date.now();
  if (diff <= 0) {
    document.getElementById('count-days').textContent = '00';
    document.getElementById('count-hours').textContent = '00';
    document.getElementById('count-minutes').textContent = '00';
    document.getElementById('count-seconds').textContent = '00';
    noteEl.textContent = copy().countdownPassed;
    sectionEl.classList.add('is-passed');
    return;
  }

  sectionEl.classList.remove('is-passed');
  const seconds = Math.floor(diff / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  document.getElementById('count-days').textContent = String(days).padStart(2, '0');
  document.getElementById('count-hours').textContent = String(hours).padStart(2, '0');
  document.getElementById('count-minutes').textContent = String(minutes).padStart(2, '0');
  document.getElementById('count-seconds').textContent = String(remainingSeconds).padStart(2, '0');
  noteEl.textContent = '';
};

const bindLocationActions = () => {
  const invitation = state.invitation;
  const mapUrl = String(invitation?.mapUrl || '').trim();
  const wazeUrl = buildWazeUrl(mapUrl, invitation?.venueAddress);
  const hasLocation = Boolean(mapUrl || invitation?.venueName);

  const locationBtn = document.getElementById('invite-location-btn');
  const locationLink = document.getElementById('invite-location-link');
  const wazeBtn = document.getElementById('invite-waze-btn');
  const wazeLink = document.getElementById('invite-waze-link');

  const showMaps = Boolean(mapUrl);
  [locationBtn, locationLink].forEach((el) => {
    el.hidden = !showMaps;
    if (showMaps) el.href = mapUrl;
  });
  [wazeBtn, wazeLink].forEach((el) => {
    el.hidden = !wazeUrl;
    if (wazeUrl) el.href = wazeUrl;
  });

  document.getElementById('invite-venue-section').hidden = !hasLocation && !invitation?.venueAddress;
  document.getElementById('invite-venue-name').textContent = invitation?.venueName || '';
  document.getElementById('invite-venue-address').textContent = invitation?.venueAddress || '';
};

const bindCalendar = () => {
  const btn = document.getElementById('invite-calendar-btn');
  const start = buildEventDateTime(state.invitation);
  btn.hidden = !start;
  btn.onclick = () => {
    const gcal = buildGoogleCalendarUrl(state.invitation);
    if (gcal) window.open(gcal, '_blank', 'noopener,noreferrer');
    downloadIcsFile(state.invitation);
  };
};

const bindWhatsapp = () => {
  const btn = document.getElementById('invite-whatsapp-btn');
  btn.hidden = false;
  btn.onclick = () => {
    const url = buildWhatsappShareUrl(state.invitation, state.language, window.location.href);
    window.open(url, '_blank', 'noopener,noreferrer');
  };
};

const bindAudio = () => {
  const musicUrl = state.invitation?.musicUrl;
  const features = state.invitation?.features || {};
  const musicEnabled = features.music !== false;

  if (!musicUrl || !musicEnabled) {
    audioToggleEl.hidden = true;
    audioPlayerEl.removeAttribute('src');
    return;
  }

  audioPlayerEl.src = musicUrl;
  audioToggleEl.hidden = !state.opened;

  const toggleMute = async () => {
    try {
      if (state.isAudioMuted) {
        state.isAudioMuted = false;
        audioPlayerEl.muted = false;
        if (audioPlayerEl.paused) await audioPlayerEl.play();
        state.isAudioPlaying = true;
      } else {
        state.isAudioMuted = true;
        audioPlayerEl.muted = true;
        state.isAudioPlaying = false;
      }
      applyLanguage();
    } catch (error) {
      console.warn('[invite-audio] playback failed:', error?.message || error);
    }
  };

  audioToggleEl.onclick = toggleMute;
  audioPlayerEl.onpause = () => {
    if (!audioPlayerEl.muted) state.isAudioPlaying = false;
  };
  audioPlayerEl.onplay = () => {
    if (!audioPlayerEl.muted) state.isAudioPlaying = true;
  };
};

const startMusicAfterOpen = async () => {
  if (!state.invitation?.musicUrl || state.invitation?.features?.music === false) return;
  try {
    audioPlayerEl.muted = false;
    state.isAudioMuted = false;
    await audioPlayerEl.play();
    state.isAudioPlaying = true;
    audioToggleEl.hidden = false;
    applyLanguage();
  } catch (error) {
    console.warn('[invite-audio] autoplay blocked:', error?.message || error);
    audioToggleEl.hidden = false;
  }
};

const updateGuestsFieldVisibility = () => {
  const attending = rsvpFormEl.elements.attending?.value;
  const showGuests = attending === 'yes';
  guestsFieldEl.hidden = !showGuests;
  rsvpFormEl.elements.guests.required = showGuests;
};

const bindRsvp = () => {
  const invitation = state.invitation;
  const features = invitation?.features || {};
  const rsvpFeature = features.rsvp !== false;

  if (!invitation?.rsvpEnabled || !rsvpFeature) {
    rsvpSectionEl.hidden = true;
    return;
  }

  rsvpSectionEl.hidden = false;
  const deadlinePassed = isRsvpDeadlinePassed(invitation.rsvpDeadline);
  const t = copy();

  if (invitation.rsvpDeadline) {
    rsvpDeadlineEl.hidden = false;
    rsvpDeadlineEl.textContent = `${t.rsvpDeadline} ${formatInviteEventDate(invitation.rsvpDeadline, state.language)}`;
  } else {
    rsvpDeadlineEl.hidden = true;
  }

  if (deadlinePassed) {
    rsvpClosedEl.hidden = false;
    rsvpClosedEl.textContent = t.rsvpClosed;
    rsvpFormEl.hidden = true;
    return;
  }

  rsvpClosedEl.hidden = true;
  rsvpFormEl.hidden = false;
  updateGuestsFieldVisibility();
  rsvpFormEl.elements.attending.addEventListener('change', updateGuestsFieldVisibility);

  rsvpFormEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.rsvpSubmitting) return;

    const formData = new FormData(rsvpFormEl);
    const guestName = String(formData.get('name') || '').trim();
    const phone = String(formData.get('phone') || '').trim();
    const attending = String(formData.get('attending') || '');
    const guestsRaw = formData.get('guests');
    const message = String(formData.get('message') || '').trim();

    if (!guestName) {
      rsvpFeedbackEl.textContent = t.rsvpNameRequired;
      return;
    }
    if (!phone) {
      rsvpFeedbackEl.textContent = t.rsvpPhoneRequired;
      return;
    }
    if (!attending) {
      rsvpFeedbackEl.textContent = t.rsvpAttendingRequired;
      return;
    }

    let guestCount = 0;
    if (attending === 'yes') {
      guestCount = Number(guestsRaw);
      if (!guestsRaw || Number.isNaN(guestCount)) {
        rsvpFeedbackEl.textContent = t.rsvpGuestsRequired;
        return;
      }
      if (guestCount < 1) {
        rsvpFeedbackEl.textContent = t.rsvpGuestsInvalid;
        return;
      }
    }

    state.rsvpSubmitting = true;
    const submitBtn = document.getElementById('invite-rsvp-submit');
    submitBtn.disabled = true;
    rsvpFeedbackEl.textContent = t.rsvpSaving;

    const payload = {
      inviteId: invitation.id,
      inviteSlug: invitation.slug,
      guestName,
      phone,
      attending: attending === 'no' ? 'no' : 'yes',
      guestCount: attending === 'yes' ? guestCount : 0,
      message,
      createdAt: serverTimestamp()
    };

    try {
      if (invitation._collection === 'weddingInvitations') {
        await addDoc(collection(db, 'weddingInvitations', invitation.id, 'rsvps'), {
          name: guestName,
          phone,
          attending: payload.attending,
          guests: payload.guestCount,
          message,
          createdAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, INVITATION_RSVPS_COLLECTION), payload);
      }
      const inviteCollection = invitation._collection || INVITATIONS_COLLECTION;
      try {
        await updateDoc(doc(db, inviteCollection, invitation.id), {
          rsvpCount: Number(invitation.rsvpCount || 0) + 1
        });
        invitation.rsvpCount = Number(invitation.rsvpCount || 0) + 1;
      } catch (countError) {
        console.warn('[invite-rsvp] count increment skipped:', countError?.message || countError);
      }
      rsvpFormEl.reset();
      rsvpFeedbackEl.textContent = t.rsvpSuccess;
    } catch (error) {
      console.error('[invite-rsvp] failed:', error);
      rsvpFeedbackEl.textContent = t.rsvpError;
      submitBtn.disabled = false;
      state.rsvpSubmitting = false;
    }
  });
};

const incrementViews = async () => {
  try {
    const inviteCollection = state.invitation._collection || INVITATIONS_COLLECTION;
    await updateDoc(doc(db, inviteCollection, state.invitation.id), {
      views: Number(state.invitation.views || 0) + 1
    });
  } catch (error) {
    console.warn('[invite-view] increment skipped:', error?.message || error);
  }
};

const revealInvitation = () => {
  state.opened = true;
  openingEl.classList.add('is-opening');
  if (prefersReducedMotion()) {
    openingEl.hidden = true;
    pageEl.hidden = false;
    topbarEl.hidden = false;
    pageEl.classList.add('is-visible');
    bindAudio();
    startMusicAfterOpen();
    return;
  }

  window.setTimeout(() => {
    openingEl.hidden = true;
    pageEl.hidden = false;
    topbarEl.hidden = false;
    pageEl.classList.add('is-visible');
    bindAudio();
    startMusicAfterOpen();
  }, 900);
};

const showOpeningScreen = () => {
  stopLoading();
  emptyEl.hidden = true;
  pageEl.hidden = true;
  topbarEl.hidden = true;
  openingEl.hidden = false;
  spawnParticles();
  applyLanguage();
  setTheme(state.invitation.theme);

  const heroMediaEl = document.getElementById('invite-hero-media');
  if (state.invitation.coverImageUrl) {
    heroMediaEl.style.backgroundImage = `url("${state.invitation.coverImageUrl}")`;
  }

  openingBtnEl.onclick = revealInvitation;
};

const renderInvitationContent = () => {
  const invitation = state.invitation;
  applyLanguage();
  bindLocationActions();
  bindCalendar();
  bindWhatsapp();
  updateCountdown();
  clearInterval(state.countdownTimer);
  state.countdownTimer = window.setInterval(updateCountdown, 1000);
  bindRsvp();
  incrementViews();
};

const prepareInvitation = () => {
  const invitation = state.invitation;
  setTheme(invitation.theme);
  state.language = invitation.languageDefault === 'ar' ? 'ar' : 'en';
  showOpeningScreen();
  renderInvitationContent();
};

const loadInvitation = async () => {
  const { slug, preview, invitationId } = getRequestContext();
  state.preview = preview;

  try {
    let invitation = null;

    if (preview && invitationId) {
      await waitForAuthReady();
      let docSnap = await withTimeout(getDoc(doc(db, INVITATIONS_COLLECTION, invitationId)));
      if (!docSnap.exists()) {
        docSnap = await withTimeout(getDoc(doc(db, 'weddingInvitations', invitationId)));
      }
      if (docSnap.exists()) {
        invitation = { id: docSnap.id, ...docSnap.data() };
      }
    } else if (slug) {
      const loadBySlug = async (collectionName) => {
        const slugQuery = query(
          collection(db, collectionName),
          where('slug', '==', slug),
          where('active', '==', true),
          limit(1)
        );
        const snapshot = await withTimeout(getDocs(slugQuery));
        const docSnap = snapshot.docs[0];
        return docSnap ? { id: docSnap.id, ...docSnap.data(), _collection: collectionName } : null;
      };
      invitation = await loadBySlug(INVITATIONS_COLLECTION);
      if (!invitation) {
        invitation = await loadBySlug('weddingInvitations');
      }
    }

    if (!invitation) {
      showEmpty(copy().invalid, copy().unavailableTitle);
      return;
    }

    if (!isInvitationPubliclyAvailable(invitation, { preview })) {
      showEmpty(copy().inactive, copy().unavailableTitle);
      return;
    }

    state.invitation = invitation;
    prepareInvitation();
  } catch (error) {
    console.error('[invite] load failed:', error);
    const view = classifyInviteError(error, { preview });
    showEmpty(view.message, view.title);
  }
};

langToggleEl.addEventListener('click', () => {
  state.language = state.language === 'ar' ? 'en' : 'ar';
  applyLanguage();
  updateCountdown();
  bindLocationActions();
});

window.addEventListener('error', (event) => {
  console.error('[invite] runtime error:', event.error || event.message || event);
  if (!loadingEl.hidden && emptyEl.hidden) {
    showEmpty(copy().loadError, copy().unavailableTitle);
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[invite] unhandled promise rejection:', event.reason || event);
  if (!loadingEl.hidden && emptyEl.hidden) {
    showEmpty(copy().loadError, copy().unavailableTitle);
  }
});

window.addEventListener('pagehide', () => {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
}, { passive: true });

loadInvitation();
