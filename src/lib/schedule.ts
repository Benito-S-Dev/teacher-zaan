export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export type ScheduleZone = 'south-africa' | 'china';
export const ZONES: Record<ScheduleZone, { label: string; short: string; hoursAhead: number }> = {
 'south-africa': { label: 'South Africa (UTC+2)', short: 'South Africa time', hoursAhead: 0 },
 china: { label: 'China / 中国 (UTC+8)', short: 'China time', hoursAhead: 6 },
};
// Both regions use fixed offsets year-round. Stored times are always South African time.
// The fixed 07:00–17:00 board becomes 13:00–23:00 in China, on the same weekday.
export function displayTime(value: string, zone: ScheduleZone): string {
 const [hour,minute] = value.split(':').map(Number);
 return `${String((hour + ZONES[zone].hoursAhead) % 24).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
}
export function preferredZone(saved: string | null, deviceZone: string): ScheduleZone {
 if(saved==='china' || saved==='south-africa') return saved;
 return ['Asia/Shanghai','Asia/Chongqing','Asia/Chungking','Asia/Harbin','PRC'].includes(deviceZone) ? 'china' : 'south-africa';
}
export const STATUSES = ['EMPTY', 'AVAILABLE', 'BOOKED', 'BREAK', 'CATCHUP', 'BLOCKED'] as const;
export type Status = typeof STATUSES[number];
export type Slot = { id: string; day_of_week: number; start_time: string; end_time: string; status: Status; student_name?: string | null; updated_at: string };
export type BookingRequest = { id: string; slot_id: string; requester_name: string; notes: string | null; is_reviewed: boolean };
export const LABELS: Record<Status, string> = { EMPTY: 'Empty', AVAILABLE: 'Available', BOOKED: 'Booked', BREAK: 'Break', CATCHUP: 'Catch-up', BLOCKED: 'Blocked' };
export function time(index: number) { return `${String(7 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`; }
export function emptySlots(): Slot[] { return DAYS.flatMap((_, d) => Array.from({ length: 20 }, (_, i) => ({ id: `preview-${d}-${i}`, day_of_week: d + 1, start_time: time(i), end_time: time(i + 1), status: 'EMPTY' as Status, updated_at: '' }))); }
