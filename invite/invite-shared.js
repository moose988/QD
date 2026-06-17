/** Shared invitation constants and helpers (public page + admin). */

export const INVITATIONS_COLLECTION = 'invitations';
export const INVITATION_RSVPS_COLLECTION = 'invitationRsvps';

/** Future guest-list collection — not used in MVP. */
export const INVITATION_GUESTS_COLLECTION = 'invitationGuests';

export const INVITE_THEME_OPTIONS = [
  'royal-gold',
  'minimal-white',
  'modern-black',
  'arabic-luxury',
  'floral-elegant'
];

export const createDefaultInvitationFeatures = () => ({
  rsvp: true,
  music: true,
  gallery: false,
  guestList: false,
  qrCheckin: false,
  multiEvents: false,
  password: false
});

/** True for non-empty /assets/ paths or http(s) URLs. */
export const isValidInvitationMediaPath = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/assets/')) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/** @deprecated Use isValidInvitationMediaPath */
export const isValidInvitationMediaUrl = isValidInvitationMediaPath;

export const buildInvitationAssetPathSuggestions = (slug) => {
  const clean = String(slug || '').trim() || 'your-slug';
  const base = `/assets/invitations/${clean}`;
  return {
    coverImageUrl: `${base}/cover.jpg`,
    musicUrl: `${base}/music.mp3`,
    gallery: [`${base}/photo-1.jpg`, `${base}/photo-2.jpg`]
  };
};

/** Trim media paths; static invitations always use empty storage path fields. */
export const normalizeInvitationMediaFields = (fields = {}) => {
  const coverImageUrl = String(fields.coverImageUrl || '').trim();
  const musicUrl = String(fields.musicUrl || '').trim();
  const coverValid = isValidInvitationMediaPath(coverImageUrl);
  const musicValid = isValidInvitationMediaPath(musicUrl);
  return {
    coverImageUrl: coverValid ? coverImageUrl : '',
    coverImageStoragePath: '',
    musicUrl: musicValid ? musicUrl : '',
    musicStoragePath: ''
  };
};

export const normalizeInvitationGallery = (gallery = []) => {
  const list = Array.isArray(gallery)
    ? gallery
    : String(gallery || '').split(/\r?\n/);
  return list
    .map((item) => String(item || '').trim())
    .filter((item) => isValidInvitationMediaPath(item));
};

export const deriveCoupleDisplayName = (invitation, lang = 'en') => {
  const manual = String(invitation?.coupleDisplayName || '').trim();
  if (manual) return manual;
  const bride = String(invitation?.brideName || '').trim();
  const groom = String(invitation?.groomName || '').trim();
  if (bride && groom) {
    return lang === 'ar' ? `${bride} و ${groom}` : `${bride} & ${groom}`;
  }
  return bride || groom || '';
};

export const buildEventDateTime = (invitation) => {
  if (!invitation?.eventDate) return null;
  const raw = invitation.eventTime
    ? `${invitation.eventDate}T${invitation.eventTime}`
    : `${invitation.eventDate}T18:00`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatInviteEventDate = (dateValue, lang = 'en') => {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return String(dateValue);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-GB', { dateStyle: 'full' }).format(date);
};

export const isInvitationPubliclyAvailable = (invitation, { preview = false } = {}) => {
  if (!invitation) return false;
  if (preview) return true;
  if (invitation.active === false) return false;
  const status = String(invitation.status || '').toLowerCase();
  if (status === 'disabled' || status === 'draft') return false;
  return true;
};

export const isRsvpDeadlinePassed = (rsvpDeadline) => {
  if (!rsvpDeadline) return false;
  const end = new Date(`${rsvpDeadline}T23:59:59`);
  return !Number.isNaN(end.getTime()) && Date.now() > end.getTime();
};

export const normalizeRsvpRecord = (data = {}) => ({
  guestName: String(data.guestName || data.name || '').trim(),
  phone: String(data.phone || '').trim(),
  attending: data.attending === 'no' ? 'no' : 'yes',
  guestCount: Math.max(0, Number(data.guestCount ?? data.guests ?? 0)),
  message: String(data.message || '').trim(),
  createdAt: data.createdAt ?? null
});

export const buildInvitationPublicUrl = (slug, origin = '') => {
  const base = origin || (typeof window !== 'undefined' ? window.location.origin : 'https://qdsystems.ae');
  return `${String(base).replace(/\/$/, '')}/invite/${slug}`;
};

export const buildInvitationWhatsappMessage = (invitation, lang = 'en', link = '') => {
  const names = deriveCoupleDisplayName(invitation, lang) || (lang === 'ar' ? 'حفل الزفاف' : 'our wedding');
  const date = formatInviteEventDate(invitation?.eventDate, lang);
  const publicLink = link || buildInvitationPublicUrl(invitation?.slug || '');
  if (lang === 'ar') {
    const datePart = date ? ` بتاريخ ${date}` : '';
    return `ندعوكم لحضور زفاف ${names}${datePart}. رابط الدعوة: ${publicLink}`;
  }
  const datePart = date ? ` on ${date}` : '';
  return `You are invited to celebrate the wedding of ${names}${datePart}. View invitation: ${publicLink}`;
};

export const buildWhatsappShareUrl = (invitation, lang = 'en', link = '') => {
  const message = buildInvitationWhatsappMessage(invitation, lang, link);
  const number = String(invitation?.whatsappNumber || '').replace(/[^\d]/g, '');
  const base = number ? `https://wa.me/${number}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
};

export const buildWazeUrl = (mapUrl = '', venueAddress = '') => {
  if (!mapUrl && !venueAddress) return '';
  const latLngMatch = String(mapUrl).match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (latLngMatch) {
    return `https://waze.com/ul?ll=${latLngMatch[1]},${latLngMatch[2]}&navigate=yes`;
  }
  const q = encodeURIComponent(venueAddress || mapUrl);
  return `https://waze.com/ul?q=${q}&navigate=yes`;
};

const formatIcsDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

export const buildGoogleCalendarUrl = (invitation) => {
  const start = buildEventDateTime(invitation);
  if (!start) return '';
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const title = encodeURIComponent(invitation.eventTitle || deriveCoupleDisplayName(invitation) || 'Wedding');
  const details = encodeURIComponent([
    deriveCoupleDisplayName(invitation),
    invitation.eventTitle,
    invitation.mapUrl ? `Location: ${invitation.mapUrl}` : ''
  ].filter(Boolean).join('\n'));
  const location = encodeURIComponent([
    invitation.venueName,
    invitation.venueAddress
  ].filter(Boolean).join(', '));
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${formatIcsDate(start)}/${formatIcsDate(end)}&details=${details}&location=${location}`;
};

export const buildIcsContent = (invitation) => {
  const start = buildEventDateTime(invitation);
  if (!start) return '';
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const uid = `${invitation.slug || 'invite'}-${start.getTime()}@qdsystems.ae`;
  const summary = (invitation.eventTitle || deriveCoupleDisplayName(invitation) || 'Wedding').replace(/\n/g, ' ');
  const description = [
    deriveCoupleDisplayName(invitation),
    invitation.mapUrl || ''
  ].filter(Boolean).join('\\n');
  const location = [invitation.venueName, invitation.venueAddress].filter(Boolean).join(', ');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//QD Systems//Wedding Invitation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
};

export const downloadIcsFile = (invitation) => {
  const content = buildIcsContent(invitation);
  if (!content) return false;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${invitation.slug || 'wedding'}-event.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return true;
};
