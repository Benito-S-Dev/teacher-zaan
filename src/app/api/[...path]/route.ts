import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { AppError, store } from '@/lib/store';
import { RegisterError } from '@/lib/lesson-store';
import { saDate } from '@/lib/lessons';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const COOKIE='matrona_session';
const json = (body: unknown, status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function handle(request: NextRequest) {
 try {
  const path=new URL(request.url).pathname.replace('/api/','');
  const token=request.cookies.get(COOKIE)?.value;
  const db=store();
  const admin=db.authenticated(token);
  if(request.method==='GET') {
   if(path==='session') return json({admin});
   if(path==='schedule') return json({slots:db.slots(false)});
   if(path==='admin') { if(!admin) throw new AppError('Please sign in.',401); return json({slots:db.slots(true),requests:db.requests(),students:db.register.students()}); }
   if(path==='register') {
    if(!admin) throw new AppError('Please sign in.',401);
    const params=new URL(request.url).searchParams;
    return json(db.register.data(params.get('from')||saDate(),params.get('to')||saDate()));
   }
   if(path==='lesson-history') {
    if(!admin) throw new AppError('Please sign in.',401);
    return json({history:db.register.history(new URL(request.url).searchParams.get('id'))});
   }
   throw new AppError('Not found.',404);
  }
  // Every mutation is same-origin JSON; cross-site forms cannot call these routes.
  const origin=request.headers.get('origin');
  if(!origin || new URL(origin).host!==request.headers.get('host')) throw new AppError('Request origin rejected.',403);
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError('JSON required.',415);
  const reader=request.body?.getReader(); let size=0; const chunks:Uint8Array[]=[];
  if(reader) { while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>8192) { await reader.cancel(); throw new AppError('Request too large.',413); } chunks.push(value); } }
  let body: Record<string,unknown>;
  try { body=JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new AppError('Invalid JSON.'); }
  if(!body || Array.isArray(body) || typeof body!=='object') throw new AppError('Invalid request.');
  if(path==='login') {
   const session=db.login(body.username,body.password); const response=json({ok:true});
   response.cookies.set(COOKIE,session,{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true',path:'/',maxAge:7*86400}); return response;
  }
  if(path==='logout') { db.logout(token); const response=json({ok:true}); response.cookies.set(COOKIE,'',{httpOnly:true,sameSite:'strict',secure:process.env.COOKIE_SECURE==='true',path:'/',maxAge:0}); return response; }
  if(path==='requests') { db.submit(body); return json({ok:true},201); }
  if(!admin) throw new AppError('Please sign in.',401);
  if(path==='slots') db.update(body);
  else if(path==='review') db.review(body.id);
  else if(path==='students') db.register.saveStudent(body);
  else if(path==='companies') db.register.addCompany(body);
  else if(path==='lessons') db.register.updateLesson(body);
  else if(path==='reschedule') db.register.reschedule(body);
  else throw new AppError('Not found.',404);
  return json({ok:true});
 } catch(error) {
  if(error instanceof AppError || error instanceof RegisterError) return json({error:error.message},error.status);
  console.error('Matrona API error:',error instanceof Error?error.message:'Unknown error');
  return json({error:'Unable to save or load data. Please try again.'},500);
 }
}
export const GET=handle;
export const POST=handle;
