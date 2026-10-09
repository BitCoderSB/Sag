import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import { createApp } from '../server/app.js';
import { openStore, hashPassword, type Store } from '../server/db.js';
import { seedDemo } from '../server/seed.js';
import { isAnimal } from '../shared/avatars.js';
import type { Assignment, Evaluation, Student, Workspace } from '../shared/types.js';

let directory: string;
let store: Store;
let server: Server;
let base: string;
const origin = 'http://127.0.0.1:5173';
type Client = {cookie:string;csrf:string;request:(path:string,method?:string,body?:unknown,headers?:Record<string,string>)=>Promise<Response>};
async function request(path: string, method='GET', body?: unknown, headers: Record<string,string>={}) {
  return fetch(base+path,{method,headers:{origin,...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});
}
async function client(role: string): Promise<Client> {
  const response=await request('/api/auth/demo','POST',{role});
  assert.equal(response.status,200);
  const session=await response.json();
  const cookie=response.headers.get('set-cookie')!.split(';')[0];
  return {cookie,csrf:session.csrf,request:(path,method='GET',body,headers={})=>request(path,method,body,{cookie,'x-csrf-token':session.csrf,...headers})};
}
// Sesiones reutilizadas en las pruebas más recientes: el servidor limita los inicios de sesión por dirección.
const sessions = new Map<string, Promise<Client>>();
const session = (role: string) => { if (!sessions.has(role)) sessions.set(role, client(role)); return sessions.get(role)!; };
async function jsonOk(response: Response,status=200) {const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;}
const future = () => new Date(Date.now()+24*3600*1000).toISOString();
async function newAssignment(c: Client,studentId='student_1') {
  const result=await jsonOk(await c.request('/api/assignments','POST',{studentId,title:'Práctica de validación',description:'Demostrar comportamiento correcto.',project:'Pruebas',dueAt:future(),reviewAt:future(),skillIds:['skill_backend','skill_documentation'],priority:'normal',links:[]}),201);
  return result.assignment as Assignment;
}
async function completeDelivery(c: Client,a: Assignment) {const r=await jsonOk(await c.request(`/api/assignments/${a.id}/deliveries`,'POST',{version:a.version,receivedAt:new Date().toISOString(),summary:'Demostración presentada ante el responsable.',url:'',completeness:'complete'}),201);return r.assignment as Assignment;}

before(async()=>{
  directory=mkdtempSync(join(tmpdir(),'sag-api-'));
  store=openStore(join(directory,'test.sqlite'));
  await seedDemo(store);
  const app=createApp({store,demo:true,uploadsDir:join(directory,'files'),origins:[origin]});
  server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.on('listening',resolve));
  const address=server.address();
  assert.ok(address&&typeof address!=='string');
  base=`http://127.0.0.1:${address.port}`;
});
after(async()=>{
  await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  store.close();
  // Test cleanup is limited to the explicitly-created temporary directory.
  assert.ok(directory.startsWith(join(tmpdir(),'sag-api-')));
  rmSync(directory,{recursive:true,force:true});
});

test('authentication: no anonymous workspace, session cookie is HttpOnly, logout revokes access',async()=>{
  assert.equal((await request('/api/workspace')).status,401);
  const response=await request('/api/auth/demo','POST',{role:'software'});
  assert.match(response.headers.get('set-cookie')!,/HttpOnly/i);
  assert.match(response.headers.get('set-cookie')!,/SameSite=Strict/i);
  const c=await client('software');
  const session=await jsonOk(await c.request('/api/session'));
  assert.equal(session.user.role,'software');
  assert.equal(session.user.passwordHash,undefined);
  assert.equal((await c.request('/api/auth/logout','POST',{})).status,200);
  assert.equal((await c.request('/api/workspace')).status,401);
});
test('production disables demo login; passwords use salted hashes and login validates them',async()=>{
  const local=openStore(':memory:');
  const password='A-private-test-password-42';
  const one=await hashPassword(password),two=await hashPassword(password);
  assert.notEqual(one,two);
  local.putUser({id:'real',name:'Ana',email:'real@example.com',role:'software',areaId:'software',passwordHash:one});
  const prod=createApp({store:local,demo:false,uploadsDir:join(directory,'production-files'),origins:[origin]}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>prod.on('listening',resolve));
  const address=prod.address();assert.ok(address&&typeof address!=='string');
  const root=`http://127.0.0.1:${address.port}`;
  const login=(path:string,body:unknown)=>fetch(root+path,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  try {
    assert.equal((await login('/api/auth/demo',{role:'software'})).status,404);
    assert.equal((await login('/api/auth/login',{email:'real@example.com',password:'wrong'})).status,401);
    const good=await login('/api/auth/login',{email:'real@example.com',password});
    assert.equal(good.status,200);
    assert.equal((await good.json()).user.passwordHash,undefined);
  } finally {await new Promise<void>(r=>prod.close(()=>r()));local.close();}
});
test('director can read all three areas but every mutation endpoint rejects writes',async()=>{
  const c=await client('director');
  const data=await jsonOk(await c.request('/api/workspace')) as Workspace;
  assert.equal(new Set(data.assignments.map(a=>a.areaId)).size,3);
  assert.equal(data.students.length,16);
  const routes:[string,string][]=[['/api/students','POST'],['/api/students/student_1/join','POST'],['/api/students/student_1','PATCH'],['/api/assignments','POST'],['/api/assignments/assignment_software_1','PATCH'],['/api/assignments/assignment_software_1/deliveries','POST'],['/api/assignments/assignment_software_1/evaluations','POST'],['/api/reviews','POST'],['/api/reviews/review_software_1','PATCH'],['/api/notes','POST'],['/api/skills','POST'],['/api/reviews/review_software_1/agreements/x','POST'],['/api/assignments/assignment_software_1/files','POST']];
  for(const [route,method] of routes) {const response=await c.request(route,method,{});assert.equal(response.status,403,route);assert.equal((await response.json()).code,'READ_ONLY');}
});
test('workspace limits private records but retains cross-area talent scores',async()=>{
  const c=await client('software');
  const data=await jsonOk(await c.request('/api/workspace')) as Workspace;
  assert.ok(data.assignments.every(a=>a.areaId==='software'));
  assert.ok(data.notes.every(n=>n.areaId==='software'));
  assert.ok(data.reviews.every(r=>r.areaId==='software'));
  assert.ok(data.audit.every(a=>a.areaId==='software'));
  assert.equal(data.students.find(s=>s.id==='student_11')!.email,'');
  assert.ok(data.evaluations.some(e=>e.areaId==='hardware'));
  assert.ok(data.evaluations.filter(e=>e.areaId!=='software').every(e=>e.feedback===''&&e.scores.every(s=>s.comment==='')));
  const shared=data.students.find(s=>s.id==='student_3')!;
  assert.equal(shared.openAssignmentCount,store.all<Assignment>('assignments').filter(a=>a.studentId===shared.id&&!['completed','cancelled'].includes(a.status)).length);
  const a=store.get<Assignment>('assignments','assignment_hardware_1')!;
  assert.equal((await c.request(`/api/assignments/${a.id}`,'PATCH',{version:a.version,blockedReason:'Cambio ajeno'})).status,403);
  assert.equal((await c.request('/api/notes','POST',{studentId:'student_11',text:'No autorizado'})).status,403);
});
test('origin, CSRF, role injection and invalid links are rejected before mutation',async()=>{
  const c=await client('software');
  assert.equal((await c.request('/api/notes','POST',{studentId:'student_1',text:'Prueba'},{'x-csrf-token':''})).status,403);
  assert.equal((await c.request('/api/notes','POST',{studentId:'student_1',text:'Prueba'},{origin:'https://attacker.example'})).status,403);
  assert.equal((await request('/api/auth/demo','POST',{role:'software'},{origin:'null'})).status,403);
  assert.equal((await c.request('/api/students','POST',{name:'Prueba inyección',registration:'TEST-INJECT',areaIds:['hardware']})).status,400);
  const a=await newAssignment(c);
  assert.equal((await c.request(`/api/assignments/${a.id}/deliveries`,'POST',{version:a.version,receivedAt:new Date().toISOString(),summary:'Documento de prueba',url:'javascript:alert(1)',completeness:'complete'})).status,400);
});
test('student identity is global; join is idempotent and stale edits conflict',async()=>{
  const software=await client('software'),hardware=await client('hardware');
  const created=await jsonOk(await software.request('/api/students','POST',{name:'Alumno compartido',registration:'test-001',email:'alumno@example.com',career:'Ingeniería',semester:'5',modalities:['Tesis'],technologies:['Python']}),201);
  const s=created.student as Student;
  assert.equal(s.registration,'TEST-001');
  assert.deepEqual(s.areaIds,['software']);
  assert.equal((await hardware.request('/api/students','POST',{name:'Otro nombre',registration:'TEST-001'})).status,409);
  const joined=await jsonOk(await hardware.request(`/api/students/${s.id}/join`,'POST',{}));
  assert.deepEqual(joined.student.areaIds,['software','hardware']);
  const repeat=await jsonOk(await hardware.request(`/api/students/${s.id}/join`,'POST',{}));
  assert.equal(repeat.student.version,joined.student.version);
  assert.equal(store.all<Student>('students').filter(v=>v.registration==='TEST-001').length,1);
  const changes={version:s.version,name:s.name,registration:s.registration,email:s.email,career:s.career,semester:s.semester,modalities:s.modalities,technologies:s.technologies,status:s.status};
  assert.equal((await software.request(`/api/students/${s.id}`,'PATCH',changes)).status,409);
  assert.equal((await software.request(`/api/students/${s.id}`,'PATCH',{...changes,version:joined.student.version,name:'Nombre actualizado'})).status,200);
  const latest=store.get<Student>('students',s.id)!;
  const rejected=await software.request(`/api/students/${s.id}`,'PATCH',{...changes,version:latest.version,status:'paused'});
  assert.equal(rejected.status,409);assert.equal((await rejected.json()).code,'SHARED_STATUS');
  assert.equal(store.get<Student>('students',s.id)!.status,'active');
});
test('every student gets an animal avatar: assigned by default without repeats, chosen explicitly, validated, kept on edit and backfilled once',async()=>{
  const software=await client('software');
  const seeded=new Set(store.all<Student>('students').map(v=>v.avatar));
  assert.ok(!seeded.has(undefined),'el demo siembra un avatar por alumno');
  const first=(await jsonOk(await software.request('/api/students','POST',{name:'Alumno con avatar',registration:'avatar-001'}),201)).student as Student;
  assert.ok(isAnimal(first.avatar));
  assert.ok(!seeded.has(first.avatar),'se elige un animal aún sin usar mientras existan');
  const chosen=(await jsonOk(await software.request('/api/students','POST',{name:'Alumno elegido',registration:'avatar-002',avatar:'owl'}),201)).student as Student;
  assert.equal(chosen.avatar,'owl');
  assert.equal((await software.request('/api/students','POST',{name:'Alumno inválido',registration:'avatar-003',avatar:'dragon'})).status,400);
  const changes={version:chosen.version,name:chosen.name,registration:chosen.registration,email:'',career:'',semester:'',modalities:[],technologies:[],status:'active'};
  const kept=await jsonOk(await software.request(`/api/students/${chosen.id}`,'PATCH',changes));
  assert.equal(kept.student.avatar,'owl');
  const changed=await jsonOk(await software.request(`/api/students/${chosen.id}`,'PATCH',{...changes,version:kept.student.version,avatar:'cat'}));
  assert.equal(changed.student.avatar,'cat');
  assert.equal((await software.request(`/api/students/${chosen.id}`,'PATCH',{...changes,version:changed.student.version,avatar:'dragon'})).status,400);
  // Expediente anterior a los avatares: al iniciar la aplicación recibe uno y no cambia de versión.
  const legacy=store.get<Student>('students','student_1')!; const {avatar:_,...bare}=legacy; store.put('students',bare);
  createApp({store,demo:true,uploadsDir:join(directory,'files'),origins:[origin]});
  const restored=store.get<Student>('students','student_1')!;
  assert.ok(isAnimal(restored.avatar)); assert.equal(restored.version,legacy.version);
  const again=restored.avatar; createApp({store,demo:true,uploadsDir:join(directory,'files'),origins:[origin]});
  assert.equal(store.get<Student>('students','student_1')!.avatar,again,'el relleno ocurre una sola vez');
});
test('plan data: student period and hours, activity start and phase, review hours and agreements carried forward',async()=>{
  const software=await client('software'),hardware=await client('hardware');
  assert.equal((await software.request('/api/students','POST',{name:'Periodo inválido',registration:'plan-000',startDate:'2026-09-01',endDate:'2026-08-01'})).status,400);
  const s=(await jsonOk(await software.request('/api/students','POST',{name:'Alumna con plan',registration:'plan-001',modalities:['Servicio social'],startDate:'2026-01-10',endDate:'2026-07-10',hoursRequired:480}),201)).student as Student;
  assert.equal(s.startDate,'2026-01-10'); assert.equal(s.hoursRequired,480);
  const due=new Date(Date.now()+10*24*3600*1000).toISOString();
  const bad=await software.request('/api/assignments','POST',{studentId:s.id,title:'Fase imposible',dueAt:due,reviewAt:future(),startAt:new Date(Date.now()+20*24*3600*1000).toISOString(),skillIds:['skill_backend']});
  assert.equal(bad.status,400);
  const created=await jsonOk(await software.request('/api/assignments','POST',{studentId:s.id,title:'Marco teórico del proyecto',dueAt:due,reviewAt:future(),startAt:new Date().toISOString(),phase:'Marco teórico',skillIds:['skill_backend']}),201);
  assert.equal(created.assignment.phase,'Marco teórico'); assert.ok(created.assignment.startAt);
  const review=created.review as { id: string; version: number };
  // Revisión de hoy en el pasado inmediato: se registra con horas y acuerdos; el servidor les pone identificador.
  const recorded=await jsonOk(await software.request(`/api/reviews/${review.id}`,'PATCH',{version:review.version,status:'completed',outcome:'Avance revisado.',hours:12.5,agreements:[{text:'Citar diez fuentes'},{text:'Entregar el índice',done:true}]}));
  const agreements=recorded.review.agreements as { id: string; text: string; done: boolean }[];
  assert.equal(recorded.review.hours,12.5); assert.equal(agreements.length,2); assert.ok(agreements.every(a=>a.id.startsWith('agreement_'))); assert.equal(agreements[0].done,false);
  // Se marca como cumplido aunque la revisión ya esté cerrada; otra área no puede tocarlo.
  const toggled=await jsonOk(await software.request(`/api/reviews/${review.id}/agreements/${agreements[0].id}`,'POST',{done:true}));
  assert.equal(toggled.review.agreements[0].done,true);
  assert.equal((await software.request(`/api/reviews/${review.id}/agreements/no-existe`,'POST',{done:true})).status,404);
  assert.notEqual((await hardware.request(`/api/reviews/${review.id}/agreements/${agreements[0].id}`,'POST',{done:false})).status,200);
  assert.equal((await software.request(`/api/reviews/${review.id}/agreements/${agreements[0].id}`,'POST',{done:'sí'})).status,400);
  const delivered=await jsonOk(await software.request(`/api/assignments/${created.assignment.id}/deliveries`,'POST',{version:created.assignment.version,receivedAt:new Date().toISOString(),summary:'Primer borrador del marco.',url:'',completeness:'partial',hours:6}),201);
  assert.equal(delivered.delivery.hours,6);
  assert.equal((await software.request(`/api/assignments/${created.assignment.id}/deliveries`,'POST',{version:delivered.assignment.version,receivedAt:new Date().toISOString(),summary:'Horas negativas.',url:'',completeness:'partial',hours:-1})).status,400);
});
test('demo enrichment adds plan data once and never overwrites existing values',async()=>{
  const students=store.all<Student>('students');
  assert.ok(students.filter(s=>/^student_d+$/.test(s.id)).every(s=>s.startDate&&s.endDate));
  assert.ok(store.all<{agreements?:unknown[]}>('reviews').some(r=>r.agreements?.length));
  const before=store.all<Student>('students').length;
  await seedDemo(store);
  assert.equal(store.all<Student>('students').length,before);
});
test('director schedules meetings with chosen responsables; only invitees see them; responsables cannot create or edit them',async()=>{
  const director=await client('director'),software=await session('software'),hardware=await session('hardware'),research=await session('research');
  const startsAt=new Date(Date.now()+2*24*3600*1000).toISOString();
  // Un responsable no puede agendar reuniones; el jefe sí, pero sigue sin poder escribir datos de alumnos.
  const denied=await software.request('/api/meetings','POST',{title:'Intento',startsAt,areaIds:['software']});
  assert.equal(denied.status,403); assert.equal((await denied.json()).code,'DIRECTOR_ONLY');
  assert.equal((await director.request('/api/students','POST',{name:'No permitido',registration:'meet-000'})).status,403);
  assert.equal((await director.request('/api/meetings','POST',{title:'Sin invitados',startsAt,areaIds:[]})).status,400);
  assert.equal((await director.request('/api/meetings','POST',{title:'Área falsa',startsAt,areaIds:['marketing']})).status,400);
  const created=await jsonOk(await director.request('/api/meetings','POST',{title:'Revisión mensual de avances',startsAt,durationMinutes:45,areaIds:['software','hardware','software'],place:'Sala de juntas'}),201);
  const meeting=created.meeting as { id: string; version: number; areaIds: string[]; organizerName: string; status: string };
  assert.deepEqual(meeting.areaIds,['software','hardware']); assert.equal(meeting.status,'scheduled'); assert.ok(meeting.organizerName);
  const seen=async(c:Client)=>((await jsonOk(await c.request('/api/workspace'))) as Workspace).meetings.some(m=>m.id===meeting.id);
  assert.equal(await seen(software),true); assert.equal(await seen(hardware),true); assert.equal(await seen(research),false); assert.equal(await seen(director),true);
  // El historial de cada invitado registra la reunión.
  const feed=(await jsonOk(await hardware.request('/api/workspace'))) as Workspace;
  assert.ok(feed.audit.some(e=>e.action==='meeting_created'&&e.entityId===meeting.id));
  assert.equal((await software.request(`/api/meetings/${meeting.id}`,'PATCH',{version:meeting.version,status:'cancelled'})).status,403);
  const moved=await jsonOk(await director.request(`/api/meetings/${meeting.id}`,'PATCH',{version:meeting.version,areaIds:['research']}));
  assert.equal(await seen(software),false); assert.equal(await seen(research),true);
  assert.equal((await director.request(`/api/meetings/${meeting.id}`,'PATCH',{version:meeting.version,title:'Versión vieja'})).status,409);
  const cancelled=await jsonOk(await director.request(`/api/meetings/${meeting.id}`,'PATCH',{version:moved.meeting.version,status:'cancelled'}));
  assert.equal(cancelled.meeting.status,'cancelled');
  assert.equal((await director.request(`/api/meetings/${meeting.id}`,'PATCH',{version:cancelled.meeting.version,title:'Reabrir'})).status,409);
});
test('progress: a partial delivery records an estimated percentage between 0 and 100 and keeps the activity open',async()=>{
  const software=await client('software');
  const a=await newAssignment(software,'student_1');
  assert.equal((await software.request(`/api/assignments/${a.id}/deliveries`,'POST',{version:a.version,receivedAt:new Date().toISOString(),summary:'Avance revisado en sesión.',url:'',completeness:'partial',progress:150})).status,400);
  const r=await jsonOk(await software.request(`/api/assignments/${a.id}/deliveries`,'POST',{version:a.version,receivedAt:new Date().toISOString(),summary:'Avance revisado en sesión.',url:'',completeness:'partial',progress:40}),201);
  assert.equal(r.delivery.progress,40); assert.equal(r.assignment.status,'in_progress');
  const legacy=await jsonOk(await software.request(`/api/assignments/${a.id}/deliveries`,'POST',{version:r.assignment.version,receivedAt:new Date().toISOString(),summary:'Registro sin porcentaje.',url:'',completeness:'partial'}),201);
  assert.equal(legacy.delivery.progress,null);
});
test('inactive student cannot be joined into a shared state that no area could reactivate',async()=>{
  const c=await client('software'),other=await client('hardware');
  const {student}=await jsonOk(await c.request('/api/students','POST',{name:'Alumno en pausa',registration:'PAUSED-001'}),201);
  const body={name:student.name,registration:student.registration,email:'',career:'',semester:'',modalities:[],technologies:[],version:student.version,status:'paused'};
  await jsonOk(await c.request(`/api/students/${student.id}`,'PATCH',body));
  const response=await other.request(`/api/students/${student.id}/join`,'POST',{});
  assert.equal(response.status,409);assert.equal((await response.json()).code,'STUDENT_INACTIVE');
  assert.deepEqual(store.get<Student>('students',student.id)!.areaIds,['software']);
});
test('assignment creation is atomic; invalid skill/date never leaves activity or review',async()=>{
  const c=await client('software');
  const before=[store.all('assignments').length,store.all('reviews').length];
  assert.equal((await c.request('/api/assignments','POST',{studentId:'student_1',title:'Práctica inválida',reviewAt:future(),skillIds:['skill_electronics']})).status,400);
  assert.equal((await c.request('/api/assignments','POST',{studentId:'student_1',title:'Fecha inválida',reviewAt:'ayer',skillIds:['skill_backend']})).status,400);
  assert.equal((await c.request('/api/assignments','POST',{studentId:'student_1',title:'Día inexistente',reviewAt:'2026-02-30T10:00:00-06:00',skillIds:['skill_backend']})).status,400);
  assert.equal((await c.request('/api/assignments','POST',{studentId:'student_1',title:'Año no bisiesto',reviewAt:'2027-02-29T10:00:00-06:00',skillIds:['skill_backend']})).status,400);
  assert.deepEqual([store.all('assignments').length,store.all('reviews').length],before);
  const a=await newAssignment(c);
  assert.equal(store.all<Assignment>('assignments').filter(x=>x.id===a.id).length,1);
  assert.equal(store.all<{assignmentId:string}>('reviews').filter(x=>x.assignmentId===a.id).length,1);
});
test('delivery date preserves real versus recorded dates and deadline changes require a reason',async()=>{
  const c=await client('software');const a=await newAssignment(c);
  assert.equal((await c.request(`/api/assignments/${a.id}`,'PATCH',{version:a.version,dueAt:future()})).status,400);
  const changed=await jsonOk(await c.request(`/api/assignments/${a.id}`,'PATCH',{version:a.version,dueAt:null,changeReason:'Se acordó revisar el alcance antes de fijar fecha.'}));
  assert.equal(changed.assignment.dueAt,null);
  assert.equal((await c.request(`/api/assignments/${a.id}/deliveries`,'POST',{version:changed.assignment.version,receivedAt:future(),summary:'Entrega futura',url:'',completeness:'complete'})).status,400);
  const receivedAt=new Date(Date.now()-60000).toISOString();
  const delivered=await jsonOk(await c.request(`/api/assignments/${a.id}/deliveries`,'POST',{version:changed.assignment.version,receivedAt,summary:'Evidencia recibida hace un minuto',url:'',completeness:'complete'}),201);
  assert.equal(delivered.delivery.receivedAt,receivedAt);
  assert.notEqual(delivered.delivery.recordedAt,receivedAt);
  assert.equal(delivered.assignment.status,'pending_review');
});
test('confirmed non-delivery requires an expired deadline, never scores competence and preserves subsequent real delivery',async()=>{
  const c=await client('software');let a=await newAssignment(c);
  const payload=()=>({version:a.version,receivedAt:new Date().toISOString(),summary:'El responsable confirmó que no recibió el trabajo antes del plazo.',url:'',completeness:'not_submitted'});
  const futureResponse=await c.request(`/api/assignments/${a.id}/deliveries`,'POST',payload());assert.equal(futureResponse.status,409);assert.equal((await futureResponse.json()).code,'DEADLINE_REQUIRED');
  a=(await jsonOk(await c.request(`/api/assignments/${a.id}`,'PATCH',{version:a.version,dueAt:new Date(Date.now()-3600000).toISOString(),changeReason:'Se documentó el plazo acordado.'}))).assignment;
  const confirmed=await jsonOk(await c.request(`/api/assignments/${a.id}/deliveries`,'POST',payload()),201);
  assert.equal(confirmed.delivery.completeness,'not_submitted');assert.equal(confirmed.assignment.status,'in_progress');
  assert.equal(store.all<Evaluation>('evaluations').filter(e=>e.assignmentId===a.id).length,0);
  a=confirmed.assignment;
  const scores=a.skillIds.map(skillId=>({skillId,score:0,comment:''}));
  assert.equal((await c.request(`/api/assignments/${a.id}/evaluations`,'POST',{version:a.version,scores,feedback:'Sin entrega',outcome:'completed'})).status,409);
  a=await completeDelivery(c,a);
  const contradictory=await c.request(`/api/assignments/${a.id}/deliveries`,'POST',payload());assert.equal(contradictory.status,409);assert.equal((await contradictory.json()).code,'DELIVERY_EXISTS');
  const deliveries=store.all<{assignmentId:string;completeness:string}>('deliveries').filter(d=>d.assignmentId===a.id);assert.deepEqual(deliveries.map(d=>d.completeness),['not_submitted','complete']);
});
test('evaluation requires complete evidence; zero and null stay distinct; reevaluation keeps one current result',async()=>{
  const c=await client('software');let a=await newAssignment(c);
  const scores=[{skillId:'skill_backend',score:0,comment:'Resultado observado: aún no funciona.'},{skillId:'skill_documentation',score:null,comment:'No se evaluó en esta sesión.'}];
  const evaluation=()=>({version:a.version,scores,feedback:'Se acordaron correcciones.',outcome:'changes_requested'});
  assert.equal((await c.request(`/api/assignments/${a.id}/evaluations`,'POST',evaluation())).status,409);
  await jsonOk(await c.request(`/api/assignments/${a.id}/deliveries`,'POST',{version:a.version,receivedAt:new Date().toISOString(),summary:'Solo un avance parcial',url:'',completeness:'partial'}),201);
  a=store.get<Assignment>('assignments',a.id)!;
  assert.equal((await c.request(`/api/assignments/${a.id}/evaluations`,'POST',evaluation())).status,409);
  a=await completeDelivery(c,a);
  const first=await jsonOk(await c.request(`/api/assignments/${a.id}/evaluations`,'POST',evaluation()),201);
  assert.equal(first.evaluation.scores[0].score,0);assert.equal(first.evaluation.scores[1].score,null);
  assert.equal((await c.request(`/api/assignments/${a.id}/evaluations`,'POST',evaluation())).status,409);
  a=first.assignment;
  const second=await jsonOk(await c.request(`/api/assignments/${a.id}/evaluations`,'POST',{...evaluation(),scores:[{skillId:'skill_backend',score:8,comment:'Correcciones verificadas.'},{skillId:'skill_documentation',score:null,comment:''}],outcome:'completed'}),201);
  const all=store.all<Evaluation>('evaluations').filter(e=>e.assignmentId===a.id);
  assert.equal(all.length,2);assert.equal(all.filter(e=>e.current).length,1);
  assert.equal(all[0].scores[0].score,0);assert.equal(all[0].current,false);
  assert.equal(second.assignment.status,'completed');
  const deliveryBody={version:a.version,receivedAt:new Date().toISOString(),summary:'Formulario abierto antes de finalizar',url:'',completeness:'complete'};
  const stale=await c.request(`/api/assignments/${a.id}/deliveries`,'POST',deliveryBody);assert.equal(stale.status,409);assert.equal((await stale.json()).code,'VERSION_CONFLICT');
  const closed=await c.request(`/api/assignments/${a.id}/deliveries`,'POST',{...deliveryBody,version:second.assignment.version});assert.equal(closed.status,409);assert.equal((await closed.json()).code,'ASSIGNMENT_CLOSED');
  assert.equal(store.get<Assignment>('assignments',a.id)!.status,'completed');
});
test('evaluation can add an observed skill of the area, never one from another area, and keeps every original skill',async()=>{
  const c=await client('software');const a=await completeDelivery(c,await newAssignment(c));
  const base=a.skillIds.map(skillId=>({skillId,score:7,comment:''}));
  const missing=await c.request(`/api/assignments/${a.id}/evaluations`,'POST',{version:a.version,scores:[base[0]],outcome:'completed'});
  assert.equal(missing.status,400);
  const foreign=await c.request(`/api/assignments/${a.id}/evaluations`,'POST',{version:a.version,scores:[...base,{skillId:'skill_electronics',score:6,comment:''}],outcome:'completed'});
  assert.equal(foreign.status,400);
  const added=await jsonOk(await c.request(`/api/assignments/${a.id}/evaluations`,'POST',{version:a.version,scores:[...base,{skillId:'skill_ux',score:9,comment:'Propuso mejoras de flujo.'},{skillId:'skill_communication',score:null,comment:''}],outcome:'completed'}),201);
  assert.deepEqual(added.assignment.skillIds,[...a.skillIds,'skill_ux','skill_communication']);
  assert.equal(added.evaluation.feedback,'');
  assert.equal(added.evaluation.scores.find((s: {skillId:string;score:number|null})=>s.skillId==='skill_ux').score,9);
});
test('activity links can be added or removed after creation; only http(s) links are accepted',async()=>{
  const c=await client('software');const a=await newAssignment(c);
  const drive={label:'Carpeta de Drive',url:'https://drive.google.com/drive/folders/abc123'};
  const added=await jsonOk(await c.request(`/api/assignments/${a.id}`,'PATCH',{version:a.version,links:[drive]}),200);
  assert.deepEqual(added.assignment.links,[drive]);
  assert.equal((await c.request(`/api/assignments/${a.id}`,'PATCH',{version:added.assignment.version,links:[{label:'Malo',url:'javascript:alert(1)'}]})).status,400);
  const removed=await jsonOk(await c.request(`/api/assignments/${a.id}`,'PATCH',{version:added.assignment.version,links:[]}),200);
  assert.deepEqual(removed.assignment.links,[]);
});
test('foreign review cannot be closed as part of another activity evaluation',async()=>{
  const c=await client('software');const a=await completeDelivery(c,await newAssignment(c));
  const count=store.all('evaluations').length;
  const response=await c.request(`/api/assignments/${a.id}/evaluations`,'POST',{version:a.version,scores:a.skillIds.map(skillId=>({skillId,score:8,comment:''})),feedback:'Evaluación',outcome:'completed',reviewId:'review_software_1'});
  assert.equal(response.status,409);assert.equal(store.all('evaluations').length,count);
  assert.equal(store.get<Assignment>('assignments',a.id)!.version,a.version);
});
/** ZIP mínimo sin compresión (lo justo para un .xlsx de prueba). */
function zip(entries:Record<string,string>){
  const locals:Buffer[]=[];const centrals:Buffer[]=[];let offset=0;
  for(const [name,text] of Object.entries(entries)){
    const data=Buffer.from(text);const n=Buffer.from(name);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(offset,42);
    locals.push(local,n,data);centrals.push(central,n);offset+=30+n.length+data.length;
  }
  const dir=Buffer.concat(centrals);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(centrals.length/2,8);end.writeUInt16LE(centrals.length/2,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,dir,end]);
}
test('thesis documents: research uploads, a schedule sets the plan, other areas cannot see them',async()=>{
  const re=await session('research'); const sw=await session('software');
  const st=(await jsonOk(await re.request('/api/students','POST',{name:'Tesista Documentos',registration:'TES-TEST-2',modalities:['Tesis']}),201)).student as Student;
  await jsonOk(await re.request(`/api/students/${st.id}/thesis`,'PUT',{topic:'Robótica'}));
  const sheet='<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>46251</v></c><c r="C2"><v>46265</v></c></row><row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>46266</v></c><c r="C3"><v>46287</v></c></row><row r="4"><c r="A4" t="s"><v>3</v></c><c r="B4"><v>46294</v></c><c r="C4"><v>46412</v></c></row></sheetData></worksheet>';
  const strings='<sst><si><t>Fases (A)</t></si><si><t>1. Elección de tema y delimitación (Pre-propuesta)</t></si><si><t>2. Desarrollo de Propuesta de tesis</t></si><si><t>9. Redacción de documento</t></si></sst>';
  const form=new FormData();form.set('kind','schedule');form.set('file',new Blob([zip({'xl/worksheets/sheet1.xml':sheet,'xl/sharedStrings.xml':strings})]),'Cronograma.xlsx');
  const up=await jsonOk(await re.request(`/api/students/${st.id}/thesis/files`,'POST',form),201);
  assert.equal(up.document.storageName,undefined); assert.equal(up.plan.length,3);
  assert.deepEqual(up.plan[0],{label:'Elección de tema y delimitación (Pre-propuesta)',start:'2026-08-17',end:'2026-08-31',phase:'preproposal'});
  assert.equal(up.plan[2].phase,null);
  const mine=await jsonOk(await re.request('/api/workspace')) as Workspace;
  assert.equal(mine.students.find(s=>s.id===st.id)?.thesis?.plan?.length,3); assert.ok(mine.thesisDocs?.some(d=>d.id===up.document.id));
  const bad=new FormData();bad.set('kind','schedule');bad.set('file',new Blob(['hola']),'notas.txt');
  assert.equal((await re.request(`/api/students/${st.id}/thesis/files`,'POST',bad)).status,400);
  const path=`/api/thesis-files/${up.document.id}`;
  assert.equal((await sw.request(path)).status,404);
  assert.ok(!((await jsonOk(await sw.request('/api/workspace')) as Workspace).thesisDocs??[]).length);
  const pdf=new FormData();pdf.set('kind','proposal');pdf.set('file',new Blob(['%PDF-1.4 prueba']),'Propuesta.pdf');
  assert.equal((await sw.request(`/api/students/${st.id}/thesis/files`,'POST',pdf)).status,403);
  const doc=(await jsonOk(await re.request(`/api/students/${st.id}/thesis/files`,'POST',pdf),201)).document;
  assert.equal((await re.request(`/api/thesis-files/${doc.id}`)).status,200);
  assert.equal((await re.request(`/api/thesis-files/${doc.id}`,'DELETE',{})).status,204);
  assert.equal((await re.request(`/api/thesis-files/${doc.id}`)).status,404);
});
test('files are authenticated, area-restricted, allowlisted and always downloaded',async()=>{
  const c=await client('software');const a=await newAssignment(c);
  const form=new FormData();form.set('kind','evidence');form.set('file',new Blob(['Documento de prueba'],{type:'text/plain'}),'evidencia.txt');
  const uploaded=await jsonOk(await c.request(`/api/assignments/${a.id}/files`,'POST',form),201);
  assert.equal(uploaded.attachment.storageName,undefined);
  const path=`/api/files/${uploaded.attachment.id}`;
  assert.equal((await request(path)).status,401);
  const hardware=await client('hardware');assert.equal((await hardware.request(path)).status,403);
  const download=await c.request(path);assert.equal(download.status,200);assert.match(download.headers.get('content-disposition')!,/^attachment;/);assert.equal(await download.text(),'Documento de prueba');
  const bad=new FormData();bad.set('kind','evidence');bad.set('file',new Blob(['<script>alert(1)</script>'],{type:'image/svg+xml'}),'attack.svg');
  assert.equal((await c.request(`/api/assignments/${a.id}/files`,'POST',bad)).status,400);
  const fake=new FormData();fake.set('kind','instruction');fake.set('file',new Blob(['executable pretending PDF']),'fake.pdf');
  assert.equal((await c.request(`/api/assignments/${a.id}/files`,'POST',fake)).status,400);
});
test('CSV export is role-scoped and neutralizes spreadsheet formulas',async()=>{
  const c=await client('software');
  const created=await jsonOk(await c.request('/api/students','POST',{name:'=HYPERLINK("https://example.com")',registration:'CSV-TEST'}),201);
  const response=await c.request('/api/export');assert.equal(response.status,200);
  const csv=await response.text();assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes(created.student.registration));assert.ok(!csv.includes('A2026011'));assert.ok(!csv.includes('passwordHash'));
});
test('SQLite transaction rolls back all writes when any step fails',()=>{
  const before=store.all('notes').length;
  assert.throws(()=>store.transaction(()=>{store.put('notes',{id:'rollback-note',text:'should not persist'});throw new Error('force rollback');}));
  assert.equal(store.all('notes').length,before);
});
test('backup takes a readable snapshot with private files and excludes sessions',()=>{
  const backupRoot=join(directory,'backups');
  execFileSync(process.execPath,['--experimental-sqlite','--import','tsx','scripts/backup.ts',backupRoot],{cwd:process.cwd(),env:{...process.env,SAG_DEMO:'0',SAG_DB:join(directory,'test.sqlite'),SAG_FILES:join(directory,'files')},stdio:'pipe'});
  const snapshot=join(backupRoot,readdirSync(backupRoot)[0]);
  const restored=openStore(join(snapshot,'sag.sqlite'));
  try {
    assert.equal(restored.all('students').length,store.all('students').length);
    assert.equal(restored.db.prepare('SELECT count(*) AS n FROM sessions').get()!.n,0);
    const manifest=JSON.parse(readFileSync(join(snapshot,'manifest.json'),'utf8'));
    assert.equal(manifest.attachments.length,store.all('attachments').length+store.all('thesisDocs').length);
    assert.ok(manifest.attachments.length>0);
    const first=manifest.attachments[0];assert.equal(readFileSync(join(snapshot,'files',first.storageName),'utf8'),'Documento de prueba');
  } finally {restored.close();}
});
test('real provisioning creates exactly four accounts without printing passwords and refuses overwrite',()=>{
  const provisionDir=mkdtempSync(join(directory,'provision-'));
  const setupUrl=new URL('../scripts/setup.ts',import.meta.url).href;
  const script=`process.chdir(${JSON.stringify(provisionDir)});await import(${JSON.stringify(setupUrl)});`;
  const env: NodeJS.ProcessEnv={...process.env,SAG_DEMO:'0'};delete env.SAG_DB;delete env.SAG_FILES;
  const args=['--experimental-sqlite','--import','tsx','--input-type=module','-e',script];
  const output=execFileSync(process.execPath,args,{cwd:process.cwd(),env,encoding:'utf8',stdio:'pipe'});
  const provisioned=openStore(join(provisionDir,'.data','sag.sqlite'));
  try {
    const users=provisioned.users();assert.equal(users.length,4);assert.equal(users.filter(u=>u.role==='director').length,1);
    const credentials=readFileSync(join(provisionDir,'.local','initial-credentials.txt'),'utf8');
    const passwords=[...credentials.matchAll(/Contraseña: (.+)/g)].map(m=>m[1]);
    assert.equal(passwords.length,4);assert.equal(new Set(passwords).size,4);
    for(const password of passwords) {assert.ok(password.length>=32);assert.ok(!output.includes(password));assert.ok(users.every(u=>!u.passwordHash.includes(password)));}
    assert.throws(()=>execFileSync(process.execPath,args,{cwd:process.cwd(),env,stdio:'pipe'}));
    assert.equal(provisioned.users().length,4);
  } finally {provisioned.close();}
});

test('behind a trusted local proxy, failed logins are limited per client instead of shared by everyone', async()=>{
  const dir=mkdtempSync(join(tmpdir(),'sag-proxy-'));
  const proxyStore=openStore(join(dir,'proxy.sqlite'));
  const proxied=createApp({store:proxyStore,uploadsDir:join(dir,'files'),origins:[origin],trustProxy:true}).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>proxied.on('listening',resolve));
  const address=proxied.address();
  assert.ok(address&&typeof address!=='string');
  const login=(ip:string)=>fetch(`http://127.0.0.1:${address.port}/api/auth/login`,{method:'POST',headers:{origin,'Content-Type':'application/json','x-forwarded-for':ip},body:JSON.stringify({email:'nadie@sag.local',password:'incorrecta'})});
  try {
    for(let i=0;i<30;i++) assert.equal((await login('203.0.113.7')).status,401);
    assert.equal((await login('203.0.113.7')).status,429);
    assert.equal((await login('198.51.100.9')).status,401);
  } finally {await new Promise(resolve=>proxied.close(resolve));proxyStore.close();rmSync(dir,{recursive:true,force:true});}
});

test('demo sessions use their own cookie so a demo on the same host never replaces the real session', async()=>{
  const response=await request('/api/auth/demo','POST',{role:'software'});
  assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie')!;
  assert.match(cookie,/^sag_demo_session=/);
  assert.equal((await request('/api/workspace','GET',undefined,{cookie:cookie.split(';')[0].replace('sag_demo_session','sag_session')})).status,401);
});

test('blocking records since when and keeps how it was resolved in the history',async()=>{
  const c=await session('software');
  let a=await newAssignment(c);
  assert.equal(a.blockedSince??null,null);
  a=(await jsonOk(await c.request(`/api/assignments/${a.id}`,'PATCH',{version:a.version,blockedReason:'Falta el sensor',blockNote:'Laboratorio lo pide el lunes'}))).assignment;
  assert.ok(a.blockedSince && Date.now()-Date.parse(a.blockedSince)<60000);
  const since=a.blockedSince;
  // Editar otro dato no reinicia la fecha del impedimento.
  a=(await jsonOk(await c.request(`/api/assignments/${a.id}`,'PATCH',{version:a.version,title:'Práctica de validación revisada'}))).assignment;
  assert.equal(a.blockedSince,since);
  a=(await jsonOk(await c.request(`/api/assignments/${a.id}`,'PATCH',{version:a.version,blockedReason:'',blockNote:'Llegó el sensor'}))).assignment;
  assert.equal(a.blockedSince,null);
  const w=await jsonOk(await c.request('/api/workspace')) as Workspace;
  const details=w.audit.filter(e=>e.entityId===a.id).map(e=>e.detail).join(' | ');
  assert.match(details,/Impedimento anotado: Falta el sensor\. Siguiente paso: Laboratorio lo pide el lunes\./);
  assert.match(details,/Impedimento resuelto: Falta el sensor\. Cómo se resolvió: Llegó el sensor\./);
});

test('waiting on an impediment keeps the review date and the history says until when',async()=>{
  const c=await session('software');
  let a=await newAssignment(c);
  const later=new Date(Date.now()+5*86400000).toISOString().slice(0,10);
  a=(await jsonOk(await c.request(`/api/assignments/${a.id}`,'PATCH',{version:a.version,blockedReason:'Espera aprobación',blockedReviewAt:later}))).assignment;
  assert.equal(a.blockedReviewAt,later);
  const after=new Date(Date.now()+9*86400000).toISOString().slice(0,10);
  a=(await jsonOk(await c.request(`/api/assignments/${a.id}`,'PATCH',{version:a.version,blockedReviewAt:after,blockNote:'Comité se reúne el jueves'}))).assignment;
  assert.equal(a.blockedReviewAt,after);
  a=(await jsonOk(await c.request(`/api/assignments/${a.id}`,'PATCH',{version:a.version,blockedReason:''}))).assignment;
  assert.equal(a.blockedReviewAt,null);
  const w=await jsonOk(await c.request('/api/workspace')) as Workspace;
  assert.match(w.audit.filter(e=>e.entityId===a.id).map(e=>e.detail).join(' | '),/Se sigue esperando; se revisa el .+ Comité se reúne el jueves\./);
});

test('pausing is per area, hides the reason from other areas and blocks new assignments until resumed',async()=>{
  const sw=await session('software'); const hw=await session('hardware');
  const shared=(await jsonOk(await sw.request('/api/students','POST',{name:'Alumno Compartido',registration:'PAUSA-01',modalities:['Prácticas']}),201)).student as Student;
  await jsonOk(await hw.request(`/api/students/${shared.id}/join`,'POST',{}));
  const a=await newAssignment(sw,shared.id);
  const back=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
  const paused=(await jsonOk(await sw.request(`/api/students/${shared.id}/pause`,'POST',{kind:'health',reason:'Incapacidad médica',returnAt:back,assignments:'keep',cancelReviews:true}))).student as Student;
  assert.equal(paused.pauses?.software?.returnAt,back);
  assert.equal(paused.status,'active');
  const reviews=(await jsonOk(await sw.request('/api/workspace')) as Workspace).reviews.filter(r=>r.assignmentId===a.id);
  assert.ok(reviews.every(r=>r.status!=='scheduled'));
  const fromHardware=(await jsonOk(await hw.request('/api/workspace')) as Workspace).students.find(s=>s.id===shared.id)!;
  assert.equal(fromHardware.pauses,undefined);
  assert.equal((await sw.request('/api/assignments','POST',{studentId:shared.id,title:'Otra actividad',description:'Algo nuevo.',project:'',dueAt:future(),reviewAt:future(),skillIds:['skill_backend']})).status,409);
  assert.equal((await hw.request('/api/assignments','POST',{studentId:shared.id,title:'Actividad de hardware',description:'Sigue en su otra área.',project:'',dueAt:future(),reviewAt:future(),skillIds:['skill_documentation']})).status,201);
  const resumed=(await jsonOk(await sw.request(`/api/students/${shared.id}/resume`,'POST',{}))).student as Student;
  assert.equal(resumed.pauses?.software,undefined);
});

test('activity bank: drafts belong to an area and can be edited and removed',async()=>{
  const sw=await session('software'); const hw=await session('hardware');
  const draft=(await jsonOk(await sw.request('/api/drafts','POST',{title:'Prueba de carga del API',description:'Medir tiempos con 100 usuarios.',skillIds:['skill_backend'],links:[]}),201)).draft;
  const visible=(await jsonOk(await sw.request('/api/workspace')) as Workspace).drafts!;
  assert.ok(visible.some(d=>d.id===draft.id));
  assert.ok(!((await jsonOk(await hw.request('/api/workspace')) as Workspace).drafts??[]).some(d=>d.id===draft.id));
  assert.equal((await hw.request(`/api/drafts/${draft.id}`,'DELETE',{})).status,403);
  const edited=(await jsonOk(await sw.request(`/api/drafts/${draft.id}`,'PATCH',{version:draft.version,title:'Prueba de carga del API v2'}))).draft;
  assert.equal(edited.title,'Prueba de carga del API v2');
  await jsonOk(await sw.request(`/api/drafts/${draft.id}`,'DELETE',{}));
  assert.ok(!((await jsonOk(await sw.request('/api/workspace')) as Workspace).drafts??[]).some(d=>d.id===draft.id));
});

test('student fields can stay empty: no registration or modality, and blanks do not collide',async()=>{
  const c=await session('software');
  const a=(await jsonOk(await c.request('/api/students','POST',{name:'Alumno Sin Datos'}),201)).student as Student;
  const b=(await jsonOk(await c.request('/api/students','POST',{name:'Otro Sin Datos',registration:''}),201)).student as Student;
  assert.equal(a.registration,''); assert.equal(b.registration,''); assert.deepEqual(a.modalities,[]);
  assert.equal((await c.request('/api/students','POST',{name:'Con espacios',registration:'A 1'})).status,400);
});
test('thesis workflow: research only, follows the cycle, advances, stays, goes back from math to design',async()=>{
  const re=await session('research'); const sw=await session('software');
  const st=(await jsonOk(await re.request('/api/students','POST',{name:'Tesista Prueba',registration:'TES-TEST-1',modalities:['Tesis'],phone:'221 000 0000'}),201)).student as Student;
  assert.equal((await sw.request(`/api/students/${st.id}/thesis`,'PUT',{topic:'X'})).status,403);
  let s=(await jsonOk(await re.request(`/api/students/${st.id}/thesis`,'PUT',{topic:'Visión por computadora',estimateMonths:6,driveUrl:'https://drive.google.com/x'}))).student as Student;
  assert.equal(s.thesis!.phase,'preproposal'); assert.equal(s.thesis!.step,'kickoff');
  const act=async(action:string,extra:Record<string,unknown>={})=>{ const r=await re.request(`/api/students/${st.id}/thesis/actions`,'POST',{action,version:s.version,...extra}); if(r.status===200) s=(await r.json()).student; return r.status; };
  assert.equal(await act('advance'),409); // no se puede aprobar sin pasar por la llamada
  assert.equal(await act('kickoff'),200); assert.equal(await act('submitted'),200); assert.equal(await act('reviewed'),200);
  assert.equal(await act('stay'),400); // pedir correcciones exige nota
  assert.equal(await act('stay',{note:'Delimitar el tema'}),200); assert.equal(s.thesis!.phase,'preproposal'); assert.equal(s.thesis!.step,'working');
  await act('moved',{to:'math',note:'Importado: ya estaba en desarrollo matemático'});
  await act('submitted'); await act('reviewed');
  assert.equal(await act('back',{note:'Las simulaciones no sostienen el modelo'}),200); assert.equal(s.thesis!.phase,'design');
  await act('submitted'); await act('reviewed'); assert.equal(await act('advance'),200); assert.equal(s.thesis!.phase,'math');
  assert.ok(s.thesis!.history.length>=8);
  const fromSoftware=(await jsonOk(await sw.request('/api/workspace')) as Workspace).students.find(x=>x.id===st.id);
  assert.equal(fromSoftware?.thesis,undefined); assert.equal(fromSoftware?.phone,'');
});
