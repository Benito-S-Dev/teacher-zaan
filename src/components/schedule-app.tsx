'use client';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Check, Download, Inbox, LockKeyhole, LogOut, Printer, RefreshCw, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { LessonRegister, type RegisterView } from '@/components/lesson-register';
import type { Student } from '@/lib/lessons';
import { DAYS, STATUSES, LABELS, ZONES, displayTime, preferredZone, emptySlots, time, type ScheduleZone, type Slot, type Status, type BookingRequest } from '@/lib/schedule';

type InstallPrompt = Event & { prompt: () => Promise<void> };
async function api(path: string, body?: object) {
 const response=await fetch(`/api/${path}`,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 const result=await response.json();
 if(!response.ok) throw new Error(result.error || 'Request failed. Please try again.');
 return result;
}
export function ScheduleApp({adminRoute=false}:{adminRoute?:boolean}) {
 const [slots,setSlots]=useState<Slot[]>(emptySlots);
 const [requests,setRequests]=useState<BookingRequest[]>([]);
 const [admin,setAdmin]=useState(false);
 const [view,setView]=useState<'schedule'|RegisterView>('schedule');
 const [students,setStudents]=useState<Student[]>([]);
 const [ready,setReady]=useState(false);
 const [loading,setLoading]=useState(true);
 const [selected,setSelected]=useState<Slot|null>(null);
 const [status,setStatus]=useState<Status>('EMPTY');
 const [student,setStudent]=useState('');
 const [login,setLogin]=useState(false);
 const [inbox,setInbox]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [dialogError,setDialogError]=useState('');
 const [install,setInstall]=useState<InstallPrompt|null>(null);
 const [zone,setZone]=useState<ScheduleZone>('south-africa');
 const shown=(value:string)=>displayTime(value,zone);
 useEffect(()=>{
  let saved:string|null=null;
  try {saved=localStorage.getItem('matrona-time-zone');} catch {}
  setZone(preferredZone(saved,Intl.DateTimeFormat().resolvedOptions().timeZone));
 },[]);
 function changeZone(value:ScheduleZone) {
  setZone(value);
  try {localStorage.setItem('matrona-time-zone',value);} catch {}
 }
 const generation=useRef(0);
 const load=useCallback(async(quiet=false)=>{
  const token=++generation.current;
  if(!quiet) setLoading(true);
  try {
   const session=adminRoute?await api('session'):{admin:false};
   const data=await api(session.admin?'admin':'schedule');
   if(token!==generation.current) return;
   setAdmin(session.admin); setSlots(data.slots); setRequests(data.requests || []); setStudents(data.students || []); setReady(true); setError('');
   if(!session.admin) {setInbox(false);setView('schedule');setStudents([]);}
  } catch(e) { if(token===generation.current) { setError(e instanceof Error?e.message:'Unable to load schedule.');setReady(false);setAdmin(false);setSlots(emptySlots());setRequests([]);setStudents([]);setView('schedule');setSelected(null); } }
  finally { if(token===generation.current) setLoading(false); }
 },[adminRoute]);
 useEffect(()=>{
  void load(); const refresh=()=>{if(document.visibilityState==='visible') void load(true);};
  const interval=setInterval(refresh,30000); window.addEventListener('online',refresh); document.addEventListener('visibilitychange',refresh);
  return()=>{generation.current++;clearInterval(interval);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[load]);
 useEffect(()=>{
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  const prompt=(e:Event)=>{e.preventDefault();setInstall(e as InstallPrompt);}; window.addEventListener('beforeinstallprompt',prompt);
  return()=>window.removeEventListener('beforeinstallprompt',prompt);
 },[]);
 const openSlot=(slot:Slot)=>{setSelected(slot);setStatus(slot.status);setStudent(slot.student_name || '');setDialogError('');};
 async function save(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();if(!selected) return;setBusy(true);setDialogError(''); const form=new FormData(e.currentTarget);
  try {
   await api(admin?'slots':'requests',admin?{id:selected.id,status,student_name:student,updated_at:selected.updated_at}:{slot_id:selected.id,requester_name:form.get('name'),notes:form.get('notes') || ''});
   setSelected(null);setNotice(admin?'Slot saved.':'Request sent to Teacher Zaan.');await load(true);
  } catch(e) {setDialogError(e instanceof Error?e.message:'Unable to save.');} finally {setBusy(false);}
 }
 async function signIn(e:FormEvent<HTMLFormElement>) {
  e.preventDefault();setBusy(true);setDialogError('');const form=new FormData(e.currentTarget);
  try {await api('login',{username:form.get('username'),password:form.get('password')});setLogin(false);await load();}
  catch(e) {setDialogError(e instanceof Error?e.message:'Unable to sign in.');} finally {setBusy(false);}
 }
 async function signOut() {
  setBusy(true);try {await api('logout',{});generation.current++;setAdmin(false);setSelected(null);setSlots(emptySlots());setRequests([]);setInbox(false);await load();}
  catch(e) {setError(e instanceof Error?e.message:'Unable to sign out.');} finally {setBusy(false);}
 }
 async function review(id:string) {
  setBusy(true);try {await api('review',{id});await load(true);setNotice('Request reviewed. Update the slot separately once confirmed.');}
  catch(e) {setError(e instanceof Error?e.message:'Unable to review.');} finally {setBusy(false);}
 }
 return <main className="schedule-page">
  <nav className="toolbar" aria-label="Schedule controls"><Link className="brand" href="/">Teacher Zaan<span> / {admin?'Teacher':'Weekly timetable'}</span></Link><div className="toolbar-actions">
   {install&&<Button variant="ghost" size="icon" aria-label="Install app" onClick={async()=>{await install.prompt();setInstall(null);}}><Download size={17}/></Button>}
   <Button variant="ghost" size="icon" aria-label="Refresh schedule" disabled={loading} onClick={()=>load()}><RefreshCw size={17} className={loading?'animate-spin':''}/></Button>
   <Button variant="ghost" size="icon" aria-label="Print schedule" onClick={()=>window.print()}><Printer size={17}/></Button>
   <Button aria-label="Share schedule" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(`${location.origin}/`);setNotice('Public schedule link copied.');}catch{setNotice(`Public schedule: ${location.origin}/`);}}}><Share2 size={15}/><span className="button-label">Share</span></Button>
   {admin?<><Button variant="outline" onClick={()=>setInbox(true)}><Inbox size={15}/>Requests ({requests.filter(r=>!r.is_reviewed).length})</Button><Button aria-label="Sign out" variant="outline" disabled={busy} onClick={signOut}><LogOut size={15}/><span className="button-label">Sign out</span></Button></>:adminRoute?<Button onClick={()=>{setLogin(true);setDialogError('');}}><LockKeyhole size={15}/>Sign in</Button>:<Button asChild><Link href="/admin"><LockKeyhole size={15}/>Teacher login</Link></Button>}
  </div></nav>
  {notice&&<div role="status" className="message success">{notice}<button aria-label="Dismiss notification" onClick={()=>setNotice('')}>×</button></div>}
  {error&&<div role="alert" className="message failure">{error}<button onClick={()=>load()}>Retry</button></div>}
  {admin&&<nav className="admin-tabs" aria-label="Teacher workspace">{([['schedule','Weekly timetable'],['today','Daily lessons'],['students','Students & companies'],['reports','Reports']] as const).map(([key,label])=><button key={key} aria-current={view===key?'page':undefined} onClick={()=>setView(key)}>{label}</button>)}</nav>}
  {admin&&view!=='schedule'?<LessonRegister view={view} onStudentChange={()=>void load(true)}/>:<section className="schedule-sheet" aria-label="Permanent weekly schedule">
   <h1>WEEKLY SCHEDULE</h1><p className="teacher-name">Teacher Zaan</p>
   <div className="sheet-subtitle">{admin?'Click a cell to edit your weekly schedule.':'Choose an available time to request a lesson.'}</div>
   <div className="timezone-bar"><label htmlFor="schedule-timezone">Show times in</label><select id="schedule-timezone" value={zone} onChange={e=>changeZone(e.target.value as ScheduleZone)}>{Object.entries(ZONES).map(([key,value])=><option key={key} value={key}>{value.label}</option>)}</select><span className="timezone-note">{zone==='china'?'China is 6 hours ahead of South Africa.':'Teacher Zaan’s local time.'}</span></div>
   <div className="table-scroll" tabIndex={0} role="region" aria-label="Monday to Friday timetable; scroll horizontally on small screens" aria-busy={loading}>
    <table className="schedule-table"><caption className="sr-only">Permanent weekly teaching schedule, Monday to Friday, {shown("07:00")} to {shown("17:00")} · {ZONES[zone].short}</caption><thead><tr><th scope="col" className="time-heading">TIME / PERIOD<span className="heading-zone">{zone==='china'?'UTC+8':'UTC+2'}</span></th>{DAYS.map(day=><th scope="col" key={day}>{day}</th>)}</tr></thead>
     <tbody>{Array.from({length:20},(_,i)=><tr key={i}><th scope="row" className="time-cell">{shown(time(i))} <span>– {shown(time(i+1))}</span></th>{DAYS.map((day,d)=>{const slot=slots.find(s=>s.day_of_week===d+1&&s.start_time.slice(0,5)===time(i));if(!slot)return <td key={day}/>;return <td key={day} className={`status-${slot.status}`}><button className="schedule-cell" disabled={!ready||(!admin&&slot.status!=='AVAILABLE')} onClick={()=>openSlot(slot)} aria-label={`${day} ${shown(time(i))} ${ZONES[zone].short} ${LABELS[slot.status]}${admin&&slot.student_name?` ${slot.student_name}`:''}`}><span className="cell-name">{admin&&slot.student_name?slot.student_name:slot.status==='EMPTY'?'':LABELS[slot.status]}</span>{admin&&slot.student_name&&<span className="cell-status">{LABELS[slot.status]}</span>}</button></td>;})}</tr>)}</tbody></table>
   </div>
   <div className="sheet-footer"><div className="legend">{STATUSES.filter(s=>s!=='EMPTY'&&(admin||s!=='BLOCKED')).map(s=><span key={s}><i className={`dot-${s}`}/>{LABELS[s]}</span>)}</div><span>{ZONES[zone].short} · {shown("07:00")}–{shown("17:00")}</span></div>
  </section>}
  {admin && <footer className="page-footer"><span>Permanent weekly template · No dates or weekly resets</span><span>Student names are private to your teacher login.</span></footer>}
  <Dialog open={!!selected} onOpenChange={open=>{if(!open&&!busy)setSelected(null);}}>{selected&&<DialogContent title={admin?'Edit slot':'Request a lesson'} description={`${DAYS[selected.day_of_week-1]} · ${shown(selected.start_time)}–${shown(selected.end_time)} · ${ZONES[zone].short}`}><form onSubmit={save} className="space-y-4">{admin?<><label className="block">Status<select className="field" value={status} onChange={e=>setStatus(e.target.value as Status)}>{STATUSES.map(s=><option key={s} value={s}>{LABELS[s]}</option>)}</select></label>{['BOOKED','CATCHUP'].includes(status)&&<label className="block">Student name (private)<input className="field" list="known-students" maxLength={120} value={student} onChange={e=>setStudent(e.target.value)}/><datalist id="known-students">{students.map(s=><option key={s.id} value={s.name}/>)}</datalist></label>}<p className="text-xs text-slate-500">Saved to your permanent weekly schedule until you change it.</p></>:<><label className="block">Name<input className="field" name="name" autoComplete="name" required maxLength={120}/></label><label className="block">Notes (optional)<textarea className="field" name="notes" rows={3} maxLength={1000}/></label></>}{dialogError&&<p role="alert" className="text-sm text-red-700">{dialogError}</p>}<Button className="w-full" disabled={busy} type="submit">{busy?'Saving…':admin?'Save slot':'Send request'}</Button></form></DialogContent>}</Dialog>
  <Dialog open={login} onOpenChange={setLogin}><DialogContent title="Teacher login" description="Sign in to edit the timetable and view requests."><form className="space-y-4" onSubmit={signIn}><label className="block">Username<input className="field" name="username" autoComplete="username" required/></label><label className="block">Password<input className="field" name="password" type="password" autoComplete="current-password" required/></label>{dialogError&&<p role="alert" className="text-sm text-red-700">{dialogError}</p>}<Button className="w-full" type="submit" disabled={busy}>{busy?'Signing in…':'Sign in'}</Button></form></DialogContent></Dialog>
  <Dialog open={inbox&&admin} onOpenChange={setInbox}><DialogContent title="Lesson requests" description="Review incoming lesson requests and update the timetable once confirmed."><div className="space-y-4">{!requests.length&&<p className="py-8 text-center text-sm text-slate-500">No requests yet.</p>}{requests.map(r=>{const slot=slots.find(s=>s.id===r.slot_id);return <article className="rounded-lg border border-slate-200 p-4" key={r.id}><h3 className="font-semibold">{r.requester_name}</h3><p className="mt-2 text-xs text-slate-500">{slot?`${DAYS[slot.day_of_week-1]} ${shown(slot.start_time)}–${shown(slot.end_time)} · ${ZONES[zone].short}`:''}</p>{r.notes&&<p className="my-3 whitespace-pre-wrap break-words text-sm">{r.notes}</p>}{r.is_reviewed?<p className="mt-3 text-xs text-emerald-700">Reviewed</p>:<Button className="mt-3" variant="outline" disabled={busy} onClick={()=>review(r.id)}><Check size={14}/>Mark reviewed</Button>}</article>;})}</div></DialogContent></Dialog>
 </main>;
}
