// Friendly timezone labels. India shows "IST"; a few common cricket/F1/football
// regions get their popular abbreviation; everyone else gets the always-correct
// GMT±offset (e.g. "GMT+5:30"). Adapts to each user's own machine timezone.
const TZ_ABBR: Record<string, string> = {
  'Asia/Kolkata': 'IST',
  'Asia/Calcutta': 'IST',
  'Asia/Colombo': 'IST',
  'Asia/Karachi': 'PKT',
  'Asia/Dubai': 'GST',
  'Asia/Dhaka': 'BDT',
};

export function tzLabel(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TZ_ABBR[zone]) {
      return TZ_ABBR[zone];
    }
    const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(
      new Date()
    );
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/** Localised "Jun 12, 06:00 AM IST" style date-time in the viewer's timezone. */
export function fmtDateTime(d: Date): string {
  const base = d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const tz = tzLabel();
  return tz ? `${base} ${tz}` : base;
}
