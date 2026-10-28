export const ATTENDANCE = ['SCHEDULED','COMPLETED','ABSENT','CANCELLED','RESCHEDULED'] as const;
export type Attendance = typeof ATTENDANCE[number];
export const ATTENDANCE_LABELS: Record<Attendance,string> = { SCHEDULED:'Scheduled', COMPLETED:'Completed', ABSENT:'Student absent', CANCELLED:'Teacher cancelled', RESCHEDULED:'Rescheduled' };
export type Company = { id:string; name:string; cycle_day:number; tracking_start:string };
export type Student = { id:string; name:string; company_id:string; needs_assignment:number; updated_at:string };
export type Lesson = { id:string; student_id:string; student_name:string; company_id:string; lesson_date:string; start_time:string; end_time:string; status:Attendance; billable:number; automatic:number; notes:string; original_id:string|null; replacement_id:string|null; replacement_date?:string|null; replacement_time?:string|null; updated_at:string };
export type LessonEvent = { id:number; lesson_id:string; changed_at:number; action:string; before_json:string|null; after_json:string };
export type RegisterData = { today:string; server_now:number; companies:Company[]; students:Student[]; lessons:Lesson[]; history:LessonEvent[]; from:string; to:string };
export function normalizeName(name:string) { return name.trim().replace(/\s+/g,' ').normalize('NFKC').toLowerCase(); }
export function saDate(now = Date.now()) { return new Date(now+2*3600_000).toISOString().slice(0,10); }
export function nextDate(date:string,days=1) { return new Date(Date.parse(date+'T12:00:00Z')+days*86400_000).toISOString().slice(0,10); }
export function lessonTimestamp(date:string,time:string) { return Date.parse(`${date}T${time}:00+02:00`); }
export function billingPeriod(month:string,cycleDay:number) {
 const [year,m]=month.split('-').map(Number);
 if(cycleDay===16) return {from:`${month}-16`,to:new Date(Date.UTC(year,m,15)).toISOString().slice(0,10)};
 return {from:`${month}-01`,to:new Date(Date.UTC(year,m,0)).toISOString().slice(0,10)};
}
export function dateLabel(date:string) { return new Date(date+'T12:00:00Z').toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Johannesburg'}); }
