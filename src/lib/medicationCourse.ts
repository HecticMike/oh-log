import type { MedCourse } from './models';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const pad2 = (value: number) => String(value).padStart(2, '0');

const toIcsUtc = (date: Date) =>
  `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}T${pad2(date.getUTCHours())}${pad2(
    date.getUTCMinutes()
  )}${pad2(date.getUTCSeconds())}Z`;

const sanitizeLine = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

export const formatRelativeTime = (iso: string, nowDate = new Date()) => {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return 'just now';
  const diffMs = nowDate.getTime() - ts;
  if (diffMs < MINUTE_MS) return 'just now';
  const totalMinutes = Math.floor(diffMs / MINUTE_MS);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    if (hours > 0) return `${days}d ${hours}h ago`;
    return `${days}d ago`;
  }
  if (hours > 0) {
    if (minutes > 0) return `${hours}h ${minutes}m ago`;
    return `${hours}h ago`;
  }
  return `${minutes}m ago`;
};

export const buildCourseSchedule = (course: MedCourse): string[] => {
  const startTs = new Date(course.startAtISO).getTime();
  if (!Number.isFinite(startTs)) return [];
  const stepMs = Math.max(1, Math.round(course.intervalHours)) * HOUR_MS;
  const endTs = startTs + Math.max(1, Math.round(course.durationDays)) * DAY_MS;
  const output: string[] = [];
  for (let ts = startTs; ts < endTs; ts += stepMs) {
    output.push(new Date(ts).toISOString());
  }
  return output;
};

export const buildCourseIcs = (course: MedCourse, memberName: string) => {
  const created = new Date();
  const nowStamp = toIcsUtc(created);
  const schedule = buildCourseSchedule(course);
  const safeMember = memberName.trim() || 'Member';
  const summary = `${course.medName}${course.doseText ? ` ${course.doseText}` : ''}`.trim();
  const descriptionLines = [
    `Member: ${safeMember}`,
    `Medication: ${course.medName}`,
    course.doseText ? `Dose: ${course.doseText}` : '',
    course.route ? `Route: ${course.route}` : '',
    `Interval: every ${course.intervalHours} hours`,
    `Duration: ${course.durationDays} days`,
    course.note ? `Note: ${course.note}` : ''
  ].filter(Boolean);
  const description = sanitizeLine(descriptionLines.join('\n'));

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Our Health//Medication Course//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  schedule.forEach((atISO, index) => {
    const start = new Date(atISO);
    const end = new Date(start.getTime() + 15 * MINUTE_MS);
    const uid = `${course.id}-${index}@our-health`;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART:${toIcsUtc(start)}`);
    lines.push(`DTEND:${toIcsUtc(end)}`);
    lines.push(`SUMMARY:${sanitizeLine(summary)}`);
    lines.push(`DESCRIPTION:${description}`);
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${sanitizeLine(summary)}`);
    lines.push('TRIGGER:-PT10M');
    lines.push('END:VALARM');
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${sanitizeLine(summary)}`);
    lines.push('TRIGGER:PT0M');
    lines.push('END:VALARM');
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
};
