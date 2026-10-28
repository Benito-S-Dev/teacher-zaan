'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ATTENDANCE, ATTENDANCE_LABELS, billingPeriod, dateLabel, lessonTimestamp, saDate, type Attendance, type Lesson, type LessonEvent, type RegisterData, type Student } from '@/lib/lessons';

export type RegisterView = 'today'|'students'|'reports';
async function request<T=RegisterData>(path:string,body?:object):Promise<T> {
 const r=await fetch('/api/'+path,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 const data=await r.json();if(!r.ok) throw new Error(data.error||'Unable to load lesson records.');return data;
}
const failure=(e:unknown)=>e instanceof Error?e.message:'Unable to save. Please try again.';
export function LessonRegister({view,onStudentChange}:{view:RegisterView;onStudentChange:()=>void}) {
 const [data,setData]=useState<RegisterData|null>(null);
 const [date,setDate]=useState(()=>saDate());
 const [month,setMonth]=useState(()=>saDate().slice(0,7));
 const [mode,setMode]=useState('calendar');
 const [company,setCompany]=useState('all');
 const [studentFilter,setStudentFilter]=useState('all');
 const [search,setSearch]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [busy,setBusy]=useState(false);
 const [selected,setSelected]=useState<Lesson|null>(null);
 const [editingStudent,setEditingStudent]=useState<Student|null>(null);
 const [addingCompany,setAddingCompany]=useState(false);
 const [attendance,setAttendance]=useState<Attendance>('COMPLETED');
 const [billable,setBillable]=useState(true);
 const [move,setMove]=useState(false);
 const [dialogError,setDialogError]=useState('');
 const [showHistory,setShowHistory]=useState(false);
 const [selectedHistory,setSelectedHistory]=useState<LessonEvent[]>([]);
 const [historyError,setHistoryError]=useState('');
 const [historyLoading,setHistoryLoading]=useState(false);
 const generation=useRef(0);
 const serverDay=useRef<string|null>(null);
 const cycle=mode==='billing'&&company==='carrie'?16:1;
 // Additional companies have their configured cycle in the loaded metadata.
 const cycleDay=mode==='billing'?(data?.companies.find(c=>c.id===company)?.cycle_day??cycle):1;
 const range=view==='reports'?billingPeriod(month,cycleDay):{from:date,to:date};
 const load=useCallback(async()=>{
  const token=++generation.current;setLoading(true);setError('');
  try {const result=await request(`register?from=${range.from}&to=${range.to}`);if(token===generation.current) {setData(result);setLoading(false);}}
  catch(e) {if(token===generation.current){setError(failure(e));setLoading(false);}}
 },[range.from,range.to]);
 useEffect(()=>{void load();const timer=setInterval(()=>{if(document.visibilityState==='visible') void load();},30000);return()=>{generation.current++;clearInterval(timer);};},[load]);
 useEffect(()=>{
  if(!data)return;
  const previous=serverDay.current;
  setDate(current=>previous===null||current===previous?data.today:current);
  serverDay.current=data.today;
 },[data?.today]);
 function openLesson(lesson:Lesson) {setSelected(lesson);setAttendance(lesson.status);setBillable(!!lesson.billable);setMove(false);setShowHistory(false);setSelectedHistory([]);setHistoryError('');setDialogError('');}
 async function toggleHistory() {
  if(showHistory){setShowHistory(false);return;}if(!selected)return;
  setShowHistory(true);setHistoryLoading(true);setHistoryError('');
  try {const result=await request<{history:LessonEvent[]}>(`lesson-history?id=${encodeURIComponent(selected.id)}`);setSelectedHistory(result.history);}
  catch(e){setHistoryError(failure(e));}finally{setHistoryLoading(false);}
 }
 async function saveLesson(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();if(!selected)return;const form=new FormData(e.currentTarget);setBusy(true);setDialogError('');
  try {
   await request(move?'reschedule':'lessons',move?{id:selected.id,updated_at:selected.updated_at,lesson_date:form.get('lesson_date'),start_time:form.get('start_time'),end_time:form.get('end_time'),notes:form.get('notes')}:{id:selected.id,updated_at:selected.updated_at,status:attendance,billable,notes:form.get('notes')});
   setSelected(null);setNotice(move?'Lesson moved. It will count in the billing period of its new date.':'Lesson updated. Attendance and billing totals have been updated.');await load();
  }catch(e){setDialogError(failure(e));}finally{setBusy(false);}
 }
 async function saveStudent(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();if(!editingStudent)return;const form=new FormData(e.currentTarget);setBusy(true);setDialogError('');
  try {await request('students',{id:editingStudent.id,updated_at:editingStudent.updated_at,name:form.get('name'),company_id:form.get('company_id')});setEditingStudent(null);setNotice('Student updated. Past lessons retain their original company.');await load();onStudentChange();}
  catch(e){setDialogError(failure(e));}finally{setBusy(false);}
 }
 async function saveCompany(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();const form=new FormData(e.currentTarget);setBusy(true);setDialogError('');
  try {await request('companies',{name:form.get('name'),cycle_day:form.get('cycle_day')});setAddingCompany(false);setNotice('Company added. You can now assign students to it.');await load();}
  catch(e){setDialogError(failure(e));}finally{setBusy(false);}
 }
 const companies=data?.companies??[];
 const students=data?.students??[];
 const lessons=(data?.from===range.from&&data?.to===range.to?data.lessons:[]).filter(l=>(company==='all'||l.company_id===company)&&(studentFilter==='all'||l.student_id===studentFilter));
 const count=(status:Attendance)=>lessons.filter(l=>l.status===status).length;
 const companyName=(id:string)=>companies.find(c=>c.id===id)?.name??'Company';
 const currentStudent=students.find(s=>s.id===studentFilter);
 const activeCycle=companies.find(c=>c.id===company);
 const summaryGroups=new Map<string,{studentId:string;name:string;companyId:string;lessons:Lesson[]}>();
 for(const l of lessons) {const key=l.student_id+':'+l.company_id;const group=summaryGroups.get(key)??{studentId:l.student_id,name:students.find(s=>s.id===l.student_id)?.name??l.student_name,companyId:l.company_id,lessons:[]};group.lessons.push(l);summaryGroups.set(key,group);}
 const studentMatches=students.filter(s=>s.name.toLowerCase().includes(search.toLowerCase())&&(company==='all'||s.company_id===company));
 const ended=selected?lessonTimestamp(selected.lesson_date,selected.end_time)<=(data?.server_now??Date.now()):false;
 const changeAttendance=(status:Attendance)=>{setAttendance(status);setBillable(status==='COMPLETED');};
 function lessonRows(items:Lesson[]) {return <div className="lesson-list">{items.map(l=><button key={l.id} className="lesson-row" onClick={()=>openLesson(l)}>
  <span className="lesson-time"><strong>{l.start_time}–{l.end_time}</strong><span>{dateLabel(l.lesson_date)}</span></span>
  <span className="lesson-person"><strong>{students.find(s=>s.id===l.student_id)?.name??l.student_name}</strong><span>{companyName(l.company_id)}{l.original_id?' · Make-up lesson':''}</span></span>
  <span className="lesson-outcome"><span className={`attendance-pill attendance-${l.status}`}>{ATTENDANCE_LABELS[l.status]}</span><span>{l.billable?'Billable':l.status==='SCHEDULED'?'Not counted yet':'Not billable'}{l.automatic?' · Automatic':''}</span></span>
  <span className="lesson-edit">Edit →</span>
 </button>)}</div>;}
 return <section className="register-panel" aria-label="Private lesson register">
  <div className="register-heading"><div><p className="register-eyebrow">PRIVATE · TEACHER ONLY</p><h1>{view==='today'?'Daily lessons':view==='students'?'Students & companies':'Lesson reports'}</h1><p>{view==='today'?'Lessons complete automatically after their end time. Tap a lesson to correct attendance or move it.':view==='students'?'Keep each student with the company that provides their lessons.':'See classes taught and billable lessons, with every date and time.'}</p></div><Button variant="outline" onClick={()=>void load()} disabled={loading}>Refresh</Button></div>
  {error&&<div role="alert" className="message failure">{error}<button onClick={()=>void load()}>Retry</button></div>}
  {notice&&<div role="status" className="message success">{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}>×</button></div>}
  <div className="register-start-note"><strong>Tracking starts:</strong> Private / Karin · 30 Oct 2026 <span> | </span> Carrie · 16 Nov 2026. All lesson dates and times below are South African time.</div>
  <div className="register-filters">
   {view==='today'&&<label>Lesson date<input className="field" type="date" value={date} max={data?.today??saDate()} onChange={e=>{if(e.target.value)setDate(e.target.value);}}/></label>}
   {view==='reports'&&<><label>Report type<select className="field" value={mode} onChange={e=>{setMode(e.target.value);if(e.target.value==='billing'&&company==='all')setCompany('private');}}><option value="calendar">Calendar month</option><option value="billing">Company billing cycle</option></select></label><label>{mode==='billing'?'Cycle starting in':'Month'}<input className="field" type="month" value={month} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label></>}
   <label>Company<select className="field" value={company} onChange={e=>setCompany(e.target.value)}>{!(view==='reports'&&mode==='billing')&&<option value="all">All companies</option>}{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   {view!=='students'&&<label>Student<select className="field" value={studentFilter} onChange={e=>setStudentFilter(e.target.value)}><option value="all">All students</option>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
   {view==='students'&&<><label>Find a student<input className="field" type="search" placeholder="Student name" value={search} onChange={e=>setSearch(e.target.value)}/></label><Button variant="outline" onClick={()=>{setAddingCompany(true);setDialogError('');}}>Add company</Button></>}
  </div>
  {view!=='students'&&<>
   <div className="report-period"><strong>{view==='today'?dateLabel(date):`${dateLabel(range.from)} – ${dateLabel(range.to)}`}</strong>{view==='reports'&&mode==='billing'&&activeCycle&&<span>{activeCycle.name} · {activeCycle.cycle_day===16?'16th–15th billing cycle':'Calendar-month billing'} · Tracking from {dateLabel(activeCycle.tracking_start)}</span>}{currentStudent&&<span>{currentStudent.name}</span>}</div>
   <div className="register-stats"><div><strong>{count('COMPLETED')}</strong><span>Classes completed</span></div><div><strong>{count('ABSENT')}</strong><span>Student absences</span></div><div><strong>{lessons.filter(l=>l.status==='ABSENT'&&l.billable).length}</strong><span>Billable absences</span></div><div className="stat-billable"><strong>{lessons.filter(l=>l.billable).length}</strong><span>Total billable lessons</span></div></div>
   <p className="register-muted">{count('SCHEDULED')} scheduled · {count('CANCELLED')} teacher cancelled · {count('RESCHEDULED')} rescheduled. Each half-hour timetable slot is one class.</p>
   {loading&&<p role="status" className="register-muted">Updating lesson records…</p>}
   {!loading&&!error&&!lessons.length&&<div className="register-empty"><h2>No lessons in this period</h2><p>Only named Booked and Catch-up slots are tracked, starting on the company’s agreed date. Future recurring lessons appear on their teaching day.</p></div>}
   {!error&&view==='today'&&lessonRows(lessons)}
   {!error&&view==='reports'&&Array.from(summaryGroups.values()).sort((a,b)=>a.name.localeCompare(b.name)).map(group=><details className="student-report" key={group.studentId+group.companyId} open={studentFilter!=='all'}><summary><span><strong>{group.name}</strong><small>{companyName(group.companyId)}</small></span><span>{group.lessons.filter(l=>l.status==='COMPLETED').length} completed · {group.lessons.filter(l=>l.status==='ABSENT').length} absent · <strong>{group.lessons.filter(l=>l.billable).length} billable</strong></span></summary>{lessonRows(group.lessons)}</details>)}
  </>}
  {view==='students'&&<>
   {students.some(s=>s.needs_assignment===1)&&<div className="register-start-note">Please confirm companies for students marked “Confirm company.” They are provisionally assigned to Private.</div>}
   <div className="student-cards">{studentMatches.map(s=><article className="student-card" key={s.id}><div><h2>{s.name}</h2><p>{companyName(s.company_id)} · {companies.find(c=>c.id===s.company_id)?.cycle_day===16?'16th–15th':'1st–last day'}</p><small>Tracking from {dateLabel(companies.find(c=>c.id===s.company_id)?.tracking_start??'2026-10-30')}</small>{!!s.needs_assignment&&<span className="assignment-badge">Confirm company</span>}</div><Button variant="outline" onClick={()=>{setEditingStudent(s);setDialogError('');}}>Edit student</Button></article>)}</div>
   {!studentMatches.length&&<div className="register-empty">No students found. Add a name to a Booked slot in the timetable to create a student.</div>}
  </>}
  <Dialog open={!!selected} onOpenChange={open=>{if(!open&&!busy)setSelected(null);}}>{selected&&<DialogContent title={move?'Reschedule lesson':students.find(s=>s.id===selected.student_id)?.name??selected.student_name} description={`${dateLabel(selected.lesson_date)} · ${selected.start_time}–${selected.end_time} · ${companyName(selected.company_id)} · South African time`}>
   {selected.replacement_id?<div className="space-y-4"><p>This lesson was moved. It does not count as completed or billable.</p><p>{selected.replacement_date?`Replacement: ${dateLabel(selected.replacement_date)} at ${selected.replacement_time}. Select that date or billing period to edit it.`:''}</p></div>:<form key={selected.id+String(move)} onSubmit={saveLesson} className="space-y-4">
    {move?<><p className="register-muted">This moves one lesson only. The weekly timetable stays the same. Billing follows the new date. A replacement whose end time has already passed completes automatically.</p><label className="block">New date<input required className="field" type="date" name="lesson_date" min="2026-10-30" defaultValue={data?.today??saDate()}/></label><div className="register-filters"><label>Start time<input required className="field" type="time" name="start_time" defaultValue={selected.start_time}/></label><label>End time<input required className="field" type="time" name="end_time" defaultValue={selected.end_time}/></label></div></>:<><label className="block">Attendance<select className="field" value={attendance} onChange={e=>changeAttendance(e.target.value as Attendance)}>{ATTENDANCE.filter(s=>s!=='RESCHEDULED'&&(ended?s!=='SCHEDULED':!['COMPLETED','ABSENT'].includes(s))).map(s=><option value={s} key={s}>{ATTENDANCE_LABELS[s]}</option>)}</select></label>{selected.automatic===1&&<p className="register-muted">Automatically marked completed after the lesson ended. You can change this.</p>}{['ABSENT','COMPLETED'].includes(attendance)&&<label className="billing-choice"><input type="checkbox" checked={billable} onChange={e=>setBillable(e.target.checked)}/><span>{attendance==='ABSENT'?'Charge for this missed lesson':'This lesson is billable'}</span></label>}</>}
    <label className="block">Note (optional)<textarea className="field" rows={3} name="notes" maxLength={1000} defaultValue={selected.notes}/></label>
    {dialogError&&<p role="alert" className="text-sm text-red-700">{dialogError}</p>}
    <Button className="w-full" disabled={busy}>{busy?'Saving…':move?'Confirm new date & time':'Save lesson'}</Button>
    <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={()=>{setMove(!move);setDialogError('');}}>{move?'Back to attendance':'Reschedule this lesson'}</Button>
   </form>}
   <button className="history-toggle" onClick={()=>void toggleHistory()}>{showHistory?'Hide':'View'} change history</button>
   {showHistory&&<div className="lesson-history">{historyLoading&&<p role="status">Loading history…</p>}{historyError&&<p role="alert">{historyError}</p>}{selectedHistory.map(h=><div key={h.id}><strong>{h.action.startsWith('Rescheduled;')?'Moved to a replacement lesson':h.action.startsWith('Replacement for')?'Created as a make-up lesson':h.action}</strong><span>{new Date(h.changed_at).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'})}</span>{(()=>{const after=JSON.parse(h.after_json) as Partial<Lesson>;return after.status?<small>{ATTENDANCE_LABELS[after.status]} · {after.billable?'Billable':'Not billable'}{after.notes?` · ${after.notes}`:''}</small>:null;})()}</div>)}{!historyLoading&&!historyError&&!selectedHistory.length&&<p>No changes in the displayed history.</p>}</div>}
  </DialogContent>}</Dialog>
  <Dialog open={!!editingStudent} onOpenChange={open=>{if(!open&&!busy)setEditingStudent(null);}}>{editingStudent&&<DialogContent title="Edit student" description="Company changes apply to future lessons. Existing lesson records keep their original company."><form onSubmit={saveStudent} className="space-y-4"><label className="block">Student name<input className="field" name="name" required maxLength={120} defaultValue={editingStudent.name}/></label><label className="block">Providing company<select className="field" name="company_id" defaultValue={editingStudent.company_id}>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><p className="register-muted">Names match regardless of capital letters. Changing the name updates their weekly slots and keeps their lesson history together.</p>{dialogError&&<p role="alert" className="text-sm text-red-700">{dialogError}</p>}<Button className="w-full" disabled={busy}>{busy?'Saving…':'Save student'}</Button></form></DialogContent>}</Dialog>
  <Dialog open={addingCompany} onOpenChange={open=>{if(!open&&!busy)setAddingCompany(false);}}><DialogContent title="Add providing company" description="Choose how this company’s billing periods work."><form onSubmit={saveCompany} className="space-y-4"><label className="block">Company name<input className="field" name="name" required maxLength={80}/></label><label className="block">Billing period<select className="field" name="cycle_day" defaultValue="1"><option value="1">1st to last day of month</option><option value="16">16th to 15th of next month</option></select></label>{dialogError&&<p role="alert" className="text-sm text-red-700">{dialogError}</p>}<Button className="w-full" disabled={busy}>{busy?'Saving…':'Add company'}</Button></form></DialogContent></Dialog>
 </section>;
}
