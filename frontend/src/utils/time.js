// Formats a YYYY-MM-DD string as "Thursday, June 11" (or locale equivalent)
export function formatDate(dateStr, locale = 'en-US') {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' });
}

// Formats a YYYY-MM-DD string as "Jun 11" / "6月11日"
export function formatDateShort(dateStr, locale = 'en-US') {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

function to12Hour(sgtDate) {
  const h24 = sgtDate.getUTCHours();
  const m = sgtDate.getUTCMinutes().toString().padStart(2, '0');
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

// Converts a UTC date + time string to Singapore Time (UTC+8)
// Returns formatted string like "Jun 12, 10:00 PM (GMT+8)" or null if no time available
export function toSGT(date, time, locale = 'en-US') {
  if (!date || !time) return null;
  const utc = new Date(`${date}T${time}:00Z`);
  const sgt = new Date(utc.getTime() + 8 * 60 * 60 * 1000);
  const datePart = sgt.toLocaleDateString(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${datePart}, ${to12Hour(sgt)} (GMT+8)`;
}

// Returns the YYYY-MM-DD date string in SGT, falling back to the raw date if no time
export function toSGTDateKey(date, time) {
  if (!date) return 'TBD';
  if (!time) return date;
  const utc = new Date(`${date}T${time}:00Z`);
  const sgt = new Date(utc.getTime() + 8 * 60 * 60 * 1000);
  const y = sgt.getUTCFullYear();
  const mo = String(sgt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(sgt.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

// Returns just the time portion in SGT, e.g. "10:00 PM (GMT+8)", or null if no time
// short=true omits the timezone suffix for compact mobile display
export function formatTime(date, time, { short = false } = {}) {
  if (!date || !time) return null;
  const utc = new Date(`${date}T${time}:00Z`);
  const sgt = new Date(utc.getTime() + 8 * 60 * 60 * 1000);
  return short ? to12Hour(sgt) : `${to12Hour(sgt)} (GMT+8)`;
}
