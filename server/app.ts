import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { z } from 'zod';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { Store, checkPassword, id, now, publicUser, type StoredSession } from './db.js';
import { ANIMALS, isAnimal, pickAnimal } from '../shared/avatars.js';
import { AREAS, type User, type Student, type Assignment, type Review, type Skill, type Evaluation, type Delivery, type StudentNote, type Meeting, type Attachment, type AuditEvent, type Workspace } from '../shared/types.js';

type AuthRequest = Request & { actor?: User; session?: StoredSession };
interface FileRecord extends Attachment { storageName: string; mimeType: string }
interface AppOptions { store: Store; demo?: boolean; uploadsDir?: string; origins?: string[]; secureCookie?: boolean; distDir?: string; sessionHours?: number; trustProxy?: boolean }
class ApiError extends Error { constructor(public status: number, message: string, public code?: string) { super(message); } }
const fail = (status: number, message: string, code?: string): never => { throw new ApiError(status, message, code); };
const text = (length = 300) => z.string().trim().max(length);
const date = z.string().datetime({ offset: true }).refine(s => Number.isFinite(Date.parse(s)) && Date.parse(s) >= Date.UTC(2000,0,1) && Date.parse(s) < Date.UTC(2101,0,1), 'La fecha debe estar entre 2000 y 2100.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Usa una fecha AAAA-MM-DD.').refine(s => Number.isFinite(Date.parse(`${s}T12:00:00Z`)) && s >= '2000-01-01' && s < '2101-01-01', 'La fecha debe estar entre 2000 y 2100.');
const hours = z.number().min(0).max(500);
const identifier = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const httpUrl = z.string().trim().max(2048).refine(value => { if (!value) return true; try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } }, 'Usa un enlace http o https válido.');
const tags = z.array(text(80).min(1)).max(30).transform(a=>[...new Set(a)]);
const registration = text(40).min(2).regex(/^[\p{L}\p{N}._-]+$/u, 'El identificador no puede contener espacios.').transform(v=>v.toUpperCase());
const studentShape = { name: text(160).min(2), registration, email: z.union([z.email().max(254),z.literal('')]).default(''), career: text(160).default(''), semester: text(50).default(''), modalities: tags.default([]), technologies: tags.default([]), avatar: z.enum(ANIMALS).optional(), startDate: day.nullable().optional(), endDate: day.nullable().optional(), hoursRequired: z.number().int().min(1).max(5000).nullable().optional() };
const studentCreate = z.object(studentShape).strict();
const studentPatch = z.object({ ...studentShape, version: z.number().int().positive(), status: z.enum(['active','paused','completed']) }).strict();
const assignmentCreate = z.object({ studentId: identifier, title: text(200).min(3), description: text(10000).default(''), project: text(200).default(''), dueAt: date.nullable().default(null), reviewAt: date, skillIds: z.array(identifier).min(1).max(30).transform(a=>[...new Set(a)]), startAt: date.nullable().default(null), phase: text(80).default(''), priority: z.enum(['normal','high']).default('normal'), links: z.array(z.object({ label: text(120).min(1), url: httpUrl.refine(Boolean,'El enlace es obligatorio.') }).strict()).max(20).default([]) }).strict();
const assignmentPatch = z.object({ version: z.number().int().positive(), status: z.enum(['in_progress','pending_review','changes_requested','completed','cancelled']).optional(), blockedReason: text(2000).optional(), dueAt: date.nullable().optional(), changeReason: text(1000).optional(), title: text(200).min(3).optional(), description: text(10000).optional(), project: text(200).optional(), startAt: date.nullable().optional(), phase: text(80).optional(), links: z.array(z.object({ label: text(120).min(1), url: httpUrl.refine(Boolean,'El enlace es obligatorio.') }).strict()).max(20).optional() }).strict();
const deliveryCreate = z.object({ version: z.number().int().positive(), receivedAt: date, summary: text(6000).min(3), url: httpUrl.default(''), completeness: z.enum(['partial','complete','not_submitted']), hours: hours.nullable().default(null), progress: z.number().int().min(0).max(100).nullable().default(null) }).strict();
const evaluationCreate = z.object({ version: z.number().int().positive(), scores: z.array(z.object({ skillId: identifier, score: z.number().min(0).max(10).nullable(), comment: text(2000).default('') }).strict()).min(1).max(30), feedback: text(6000).default(''), outcome: z.enum(['completed','changes_requested']), nextReviewAt: date.optional(), reviewId: identifier.optional() }).strict();
const reviewCreate = z.object({ studentId: identifier, assignmentId: identifier.nullable().default(null), startsAt: date, durationMinutes: z.number().int().min(5).max(480).default(30), type: z.enum(['follow_up','delivery','evaluation']).default('follow_up'), notes: text(6000).default('') }).strict();
const reviewPatch = z.object({ version: z.number().int().positive(), status: z.enum(['scheduled','completed','cancelled','missed']).optional(), outcome: text(6000).optional(), startsAt: date.optional(), changeReason: text(1000).optional(), hours: hours.nullable().optional(), agreements: z.array(z.object({ id: identifier.optional(), text: text(500).min(1), done: z.boolean().default(false) }).strict()).max(30).optional() }).strict();
const areaList = z.array(z.enum(['software','hardware','research'])).min(1,'Elige al menos un responsable.').max(3).transform(a=>[...new Set(a)]);
const meetingCreate = z.object({ title: text(160).min(3), startsAt: date, durationMinutes: z.number().int().min(10).max(480).default(60), areaIds: areaList, place: text(300).default(''), notes: text(4000).default('') }).strict();
const meetingPatch = z.object({ version: z.number().int().positive(), title: text(160).min(3).optional(), startsAt: date.optional(), durationMinutes: z.number().int().min(10).max(480).optional(), areaIds: areaList.optional(), place: text(300).optional(), notes: text(4000).optional(), status: z.enum(['scheduled','cancelled']).optional() }).strict();
const periodCheck = (s: { startDate?: string|null; endDate?: string|null }) => { if (s.startDate && s.endDate && s.endDate < s.startDate) fail(400,'La fecha de término debe ser posterior al inicio.'); };
const startCheck = (a: { startAt?: string|null; dueAt?: string|null }) => { if (a.startAt && a.dueAt && Date.parse(a.startAt) > Date.parse(a.dueAt)) fail(400,'El inicio debe ser anterior a la fecha límite.'); };
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const equal = (a: string, b: string) => { const first=Buffer.from(a),second=Buffer.from(b);return first.length===second.length&&timingSafeEqual(first,second); };
const csvCell = (value: unknown) => { let s = String(value ?? ''); if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = `'${s}`; return `"${s.replaceAll('"','""')}"`; };

export function createApp(options: AppOptions) {
  const { store, demo = false, secureCookie = false } = options;
  // La cookie no distingue puertos: una demostración en el mismo dominio usa otro nombre para no cerrar la sesión real.
  const cookieName = demo ? 'sag_demo_session' : 'sag_session';
  const uploadsDir = resolve(options.uploadsDir ?? (demo ? '.data/demo-files' : '.data/files'));
  mkdirSync(uploadsDir,{recursive:true});
  // Expedientes anteriores a los avatares: reciben uno una sola vez (los que ya tienen no se tocan ni cambian de versión).
  store.transaction(()=>{ const all = store.all<Student>('students'); const used = all.map(s=>s.avatar); for (const s of all) if (!isAnimal(s.avatar)) { const avatar = pickAnimal(used); used.push(avatar); store.put('students',{...s,avatar}); } });
  const origins = new Set(options.origins ?? ['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:3001','http://localhost:3001']);
  const app = express();
  app.disable('x-powered-by');
  // Detrás de un proxy local (Caddy, nginx) todas las conexiones llegan desde 127.0.0.1; sin esto, el límite de
  // intentos de acceso sería uno solo para todos. Solo se confía en el proxy de la misma máquina.
  app.set('trust proxy', options.trustProxy ? 'loopback' : false);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'","'unsafe-inline'"], fontSrc: ["'self'"], imgSrc: ["'self'",'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: secureCookie ? [] : null } }, strictTransportSecurity: secureCookie ? undefined : false, referrerPolicy: {policy:'same-origin'} }));
  app.use('/api', (_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  app.use('/api', (req,res,next)=> {
    if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (!origin || !origins.has(origin)) return res.status(403).json({error:'Origen no autorizado.',code:'ORIGIN_REJECTED'});
      if (!req.is('application/json') && !req.is('multipart/form-data')) return res.status(415).json({error:'Formato de solicitud no admitido.'});
    }
    next();
  });
  app.use(express.json({limit:'128kb',strict:true}));
  app.use('/api', (req: AuthRequest,_res,next)=>{
    const token = req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      const row = store.db.prepare('SELECT * FROM sessions WHERE hash=? AND expires_at>?').get(tokenHash(token),Date.now()) as unknown as StoredSession | undefined;
      if (row) { const user = store.user(row.user_id); if (user) { req.actor = publicUser(user); req.session = row; } }
    }
    next();
  });
  const auth = (req: AuthRequest,_res: Response,next: NextFunction) => { if (!req.actor) return next(new ApiError(401,'Inicia sesión para continuar.','AUTH_REQUIRED')); next(); };
  const csrf = (req: AuthRequest,_res: Response,next: NextFunction) => { const supplied = req.get('x-csrf-token'); if (!req.session || !supplied || !equal(supplied,req.session.csrf)) return next(new ApiError(403,'La sesión de seguridad cambió. Recarga e inténtalo de nuevo.','CSRF_REJECTED')); next(); };
  const writer = (req: AuthRequest,_res: Response,next: NextFunction) => { if (req.actor?.role === 'director') return next(new ApiError(403,'La cuenta del jefe es exclusivamente de consulta.','READ_ONLY')); next(); };
  const mutate = [auth,csrf,writer];
  // Única escritura del jefe: agendar reuniones con los responsables. Los datos de alumnos siguen siendo de solo consulta para él.
  const directorOnly = (req: AuthRequest,_res: Response,next: NextFunction) => { if (req.actor?.role !== 'director') return next(new ApiError(403,'Solo el jefe agenda reuniones con los responsables.','DIRECTOR_ONLY')); next(); };
  const organize = [auth,csrf,directorOnly];
  const actor = (req: Request) => (req as AuthRequest).actor!;
  const checkVersion = (actual: number, expected: number) => { if (actual!==expected) fail(409,'Este registro cambió. Actualiza la vista antes de guardar.','VERSION_CONFLICT'); };
  const studentFor = (req: Request, studentId: string) => {
    const student = store.get<Student>('students',studentId) ?? fail(404,'Alumno no encontrado.');
    const user = actor(req);
    if (user.role!=='director' && !student.areaIds.includes(user.areaId!)) fail(403,'El alumno no pertenece a tu área.');
    return student;
  };
  const assignmentFor = (req: Request, assignmentId: string) => {
    const assignment = store.get<Assignment>('assignments',assignmentId) ?? fail(404,'Actividad no encontrada.');
    if (actor(req).role!=='director' && assignment.areaId!==actor(req).areaId) fail(403,'No puedes acceder a las actividades de otra área.');
    return assignment;
  };
  const reviewFor = (req: Request, reviewId: string) => {
    const review = store.get<Review>('reviews',reviewId) ?? fail(404,'Revisión no encontrada.');
    if (actor(req).role!=='director' && review.areaId!==actor(req).areaId) fail(403,'No puedes acceder a las revisiones de otra área.');
    return review;
  };
  const audit = (user: User, action: string, entityId: string, detail: string, areaId = user.areaId) => store.put<AuditEvent>('audit',{ id:id('audit'), actorName:user.name, areaId, action, entityId, detail, createdAt:now() });
  const login = (req: AuthRequest,res: Response,user: User) => {
    if (req.session) store.db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session.hash);
    store.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const ttl = (options.sessionHours ?? 12)*60*60*1000;
    store.db.prepare('INSERT INTO sessions(hash,user_id,csrf,expires_at) VALUES(?,?,?,?)').run(tokenHash(token),user.id,csrfToken,Date.now()+ttl);
    res.cookie(cookieName,token,{ httpOnly:true,sameSite:'strict',secure:secureCookie,path:'/',maxAge:ttl });
    res.json({user,csrf:csrfToken,demo});
  };
  const loginLimiter = rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Demasiados intentos de acceso. Espera unos minutos.'}});
  app.get('/api/session',(req: AuthRequest,res)=>res.json({user:req.actor ?? null,csrf:req.session?.csrf ?? null,demo}));
  app.post('/api/auth/login',loginLimiter,async(req: AuthRequest,res)=>{
    const body = z.object({email:z.email().max(254),password:z.string().min(1).max(256)}).strict().parse(req.body);
    const user = store.userByEmail(body.email.toLowerCase());
    const valid = await checkPassword(body.password,user?.passwordHash);
    if (!user || !valid) fail(401,'Correo o contraseña incorrectos.','INVALID_CREDENTIALS');
    login(req,res,publicUser(user!));
  });
  app.post('/api/auth/demo',loginLimiter,(req: AuthRequest,res)=>{
    if (!demo) fail(404,'Ruta no encontrada.');
    const body = z.object({role:z.enum(['software','hardware','research','director'])}).strict().parse(req.body);
    const user = store.users().find(u=>u.role===body.role) ?? fail(503,'La demostración no está preparada.');
    login(req,res,publicUser(user));
  });
  app.post('/api/auth/logout',auth,csrf,(req: AuthRequest,res)=>{
    store.db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session!.hash);
    res.clearCookie(cookieName,{httpOnly:true,sameSite:'strict',secure:secureCookie,path:'/'});
    res.json({user:null,csrf:null,demo});
  });
  function workspace(user: User): Workspace {
    const visibleArea = (areaId: string|null) => user.role==='director' || areaId===user.areaId;
    const allAssignments = store.all<Assignment>('assignments');
    const students = store.all<Student>('students').map(s=>{
      const safe = user.role==='director'||s.areaIds.includes(user.areaId!) ? s : {...s,email:'',career:'',semester:'',modalities:[]};
      return {...safe,openAssignmentCount:allAssignments.filter(a=>a.studentId===s.id&&!['completed','cancelled'].includes(a.status)).length};
    });
    const assignments = allAssignments.filter(a=>visibleArea(a.areaId));
    const assignmentIds = new Set(assignments.map(a=>a.id));
    const evaluations = store.all<Evaluation>('evaluations').map(e=>visibleArea(e.areaId) ? e : {...e,feedback:'',scores:e.scores.map(s=>({...s,comment:''}))});
    return { user,areas:AREAS,students,assignments,reviews:store.all<Review>('reviews').filter(r=>visibleArea(r.areaId)),skills:store.all<Skill>('skills'),deliveries:store.all<Delivery>('deliveries').filter(d=>assignmentIds.has(d.assignmentId)),evaluations,notes:store.all<StudentNote>('notes').filter(n=>visibleArea(n.areaId)),attachments:store.all<FileRecord>('attachments').filter(f=>assignmentIds.has(f.assignmentId)).map(({storageName:_,mimeType:__,...file})=>file),audit:store.all<AuditEvent>('audit').filter(a=>visibleArea(a.areaId)).slice(-200).reverse(),meetings:store.all<Meeting>('meetings').filter(m=>user.role==='director'||m.areaIds.includes(user.areaId!)) };
  }
  app.get('/api/workspace',auth,(req,res)=>res.json(workspace(actor(req))));
  app.post('/api/students',...mutate,(req,res)=>{
    const body = studentCreate.parse(req.body);
    periodCheck(body);
    const existing = store.all<Student>('students').find(s=>s.registration.toUpperCase()===body.registration);
    if (existing) fail(409,'Ya existe un alumno con ese identificador. Búscalo y añádelo a tu área.','DUPLICATE_STUDENT');
    const student = store.transaction(()=>{
      const created = store.put<Student>('students',{id:id('student'),...body,avatar:body.avatar ?? pickAnimal(store.all<Student>('students').map(s=>s.avatar)),status:'active',areaIds:[actor(req).areaId!],createdAt:now(),version:1});
      audit(actor(req),'student_created',created.id,`Alta de ${created.name} (${created.registration}).`);
      return created;
    });
    res.status(201).json({student});
  });
  app.post('/api/students/:id/join',...mutate,(req,res)=>{
    z.object({}).strict().parse(req.body);
    const student = store.get<Student>('students',String(req.params.id)) ?? fail(404,'Alumno no encontrado.');
    const areaId = actor(req).areaId!;
    if (!student.areaIds.includes(areaId) && student.status!=='active') fail(409,'El expediente está en pausa o finalizado. Su responsable actual debe reactivarlo antes de incorporarlo a otra área.','STUDENT_INACTIVE');
    if (!student.areaIds.includes(areaId)) store.transaction(()=>{ student.areaIds.push(areaId); student.version++; store.put('students',student); audit(actor(req),'student_joined',student.id,`${student.name} se incorporó al área. Se conserva su expediente único.`); });
    res.json({student});
  });
  app.patch('/api/students/:id',...mutate,(req,res)=>{
    const body = studentPatch.parse(req.body);
    const student = studentFor(req,String(req.params.id));
    periodCheck({...student,...body});
    checkVersion(student.version,body.version);
    if (student.areaIds.length>1 && body.status!==student.status) fail(409,'Este alumno participa en varias áreas. Su estado compartido se conserva; puedes cerrar o cancelar las actividades de tu área sin afectar a los demás responsables.','SHARED_STATUS');
    if (store.all<Student>('students').some(s=>s.id!==student.id&&s.registration.toUpperCase()===body.registration)) fail(409,'Ese identificador ya pertenece a otro alumno.','DUPLICATE_STUDENT');
    const updated = store.transaction(()=>{ const result = store.put('students',{...student,...body,version:student.version+1}); audit(actor(req),'student_updated',student.id,`Se actualizó el expediente compartido de ${student.name}. Estado: ${body.status}.`); return result; });
    res.json({student:updated});
  });
  app.post('/api/assignments',...mutate,(req,res)=>{
    const body = assignmentCreate.parse(req.body);
    startCheck(body);
    const student = studentFor(req,body.studentId);
    if (student.status!=='active') fail(409,'Activa al alumno antes de asignarle nuevas actividades.');
    if (body.skillIds.some(skillId=>{const s=store.get<Skill>('skills',skillId);return !s || (s.areaId!==null && s.areaId!==actor(req).areaId);})) fail(400,'Selecciona habilidades de tu área o habilidades compartidas.');
    const user = actor(req);
    const result = store.transaction(()=>{
      const {reviewAt,...fields} = body;
      const assignment = store.put<Assignment>('assignments',{...fields,id:id('assignment'),areaId:user.areaId!,ownerId:user.id,status:'in_progress',blockedReason:'',createdAt:now(),updatedAt:now(),version:1});
      const review = store.put<Review>('reviews',{id:id('review'),studentId:student.id,assignmentId:assignment.id,areaId:user.areaId!,ownerId:user.id,startsAt:reviewAt,durationMinutes:30,type:'follow_up',status:'scheduled',notes:'',outcome:'',version:1});
      audit(user,'assignment_created',assignment.id,`Se asignó «${assignment.title}» a ${student.name}. Primera revisión: ${reviewAt}.`);
      return {assignment,review};
    });
    res.status(201).json(result);
  });
  app.patch('/api/assignments/:id',...mutate,(req,res)=>{
    const body = assignmentPatch.parse(req.body);
    const assignment = assignmentFor(req,String(req.params.id));
    checkVersion(assignment.version,body.version);
    startCheck({...assignment,...body});
    if (Object.keys(body).length===1) fail(400,'No hay cambios para guardar.');
    if (body.dueAt!==undefined && body.dueAt!==assignment.dueAt && !body.changeReason) fail(400,'Indica el motivo del cambio de fecha.');
    if (body.status && body.status!==assignment.status) {
      const transitions: Record<Assignment['status'],Assignment['status'][]> = {in_progress:['cancelled'],pending_review:['cancelled'],changes_requested:['in_progress','cancelled'],completed:[],cancelled:[]};
      if (!transitions[assignment.status].includes(body.status)) fail(409,'Ese cambio requiere registrar una entrega o una evaluación. Las actividades cerradas conservan su resultado.');
      if (body.status==='cancelled'&&!body.changeReason) fail(400,'Indica el motivo de cancelación.');
    }
    const {version:_,changeReason,...fields} = body;
    const updated = store.transaction(()=>{
      const result = store.put('assignments',{...assignment,...fields,updatedAt:now(),version:assignment.version+1});
      if (body.status==='cancelled') for (const review of store.all<Review>('reviews').filter(r=>r.assignmentId===assignment.id&&r.status==='scheduled')) store.put('reviews',{...review,status:'cancelled',outcome:`Actividad cancelada: ${changeReason}`,version:review.version+1});
      audit(actor(req),'assignment_updated',assignment.id,body.dueAt!==undefined&&body.dueAt!==assignment.dueAt ? `Plazo anterior: ${assignment.dueAt??'sin plazo'}. Nuevo: ${body.dueAt??'sin plazo'}. Motivo: ${changeReason}.` : `Actividad actualizada. ${changeReason??''}`);
      return result;
    });
    res.json({assignment:updated});
  });
  app.post('/api/assignments/:id/deliveries',...mutate,(req,res)=>{
    const body = deliveryCreate.parse(req.body);
    const assignment = assignmentFor(req,String(req.params.id));
    checkVersion(assignment.version,body.version);
    if (assignment.status==='cancelled'||assignment.status==='completed') fail(409,'La actividad está cerrada. Conserva sus entregas; puedes registrar una nueva actividad o revisar su evaluación vigente.','ASSIGNMENT_CLOSED');
    if (Date.parse(body.receivedAt)>Date.now()+5*60*1000) fail(400,'La fecha real de entrega no puede estar en el futuro.');
    if (Date.parse(body.receivedAt)<Date.parse(assignment.createdAt)-24*60*60*1000) fail(400,'La entrega no puede ser anterior a la asignación.');
    if (body.completeness==='not_submitted') {
      if (!assignment.dueAt || Date.parse(assignment.dueAt)>Date.now()) fail(409,'Solo puedes confirmar una no entrega cuando la actividad tiene un plazo de entrega vencido.','DEADLINE_REQUIRED');
      if (Date.parse(body.receivedAt)<Date.parse(assignment.dueAt!)) fail(400,'La confirmación de no entrega debe ser posterior al plazo acordado.');
      if (store.all<Delivery>('deliveries').some(d=>d.assignmentId===assignment.id&&d.completeness==='complete')) fail(409,'Ya hay una entrega completa registrada. Conserva esa evidencia y documenta cualquier pendiente mediante la evaluación.','DELIVERY_EXISTS');
      if (body.url) fail(400,'Una no entrega se documenta con una observación, sin enlace de entrega.');
    }
    const result = store.transaction(()=>{
      const {version:_,...fields} = body;
      const delivery = store.put<Delivery>('deliveries',{id:id('delivery'),assignmentId:assignment.id,...fields,recordedAt:now(),authorId:actor(req).id});
      const updated = store.put('assignments',{...assignment,status:body.completeness==='complete'?'pending_review' as const:assignment.status,updatedAt:now(),version:assignment.version+1});
      audit(actor(req),body.completeness==='not_submitted'?'non_delivery_confirmed':'delivery_recorded',assignment.id,body.completeness==='not_submitted'?`No entrega confirmada: ${body.receivedAt}. Motivo: ${body.summary}. Registro: ${delivery.recordedAt}.`:`Entrega ${body.completeness==='complete'?'completa':'parcial'} recibida: ${body.receivedAt}. Registro: ${delivery.recordedAt}.`);
      return {delivery,assignment:updated};
    });
    res.status(201).json(result);
  });
  app.post('/api/assignments/:id/evaluations',...mutate,(req,res)=>{
    const body = evaluationCreate.parse(req.body);
    const assignment = assignmentFor(req,String(req.params.id));
    checkVersion(assignment.version,body.version);
    if (assignment.status==='cancelled') fail(409,'La actividad está cancelada.');
    if (!store.all<Delivery>('deliveries').some(d=>d.assignmentId===assignment.id&&d.completeness==='complete')) fail(409,'Registra una entrega completa antes de evaluar.','DELIVERY_REQUIRED');
    const scoreIds = body.scores.map(s=>s.skillId);
    if (new Set(scoreIds).size!==scoreIds.length || assignment.skillIds.some(skillId=>!scoreIds.includes(skillId))) fail(400,'Incluye una calificación o «sin evaluar» para cada habilidad de la actividad, sin duplicados.');
    // Se puede evaluar una habilidad observada que no estaba en la actividad: debe existir y ser del área o compartida.
    const addedSkillIds = scoreIds.filter(skillId=>!assignment.skillIds.includes(skillId));
    if (addedSkillIds.some(skillId=>{const s=store.get<Skill>('skills',skillId);return !s || (s.areaId!==null && s.areaId!==assignment.areaId);})) fail(400,'Solo puedes añadir habilidades de tu área o habilidades compartidas.');
    let targetReview: Review|undefined;
    if (body.reviewId) { targetReview = reviewFor(req,body.reviewId); if (targetReview.studentId!==assignment.studentId||targetReview.assignmentId!==assignment.id||targetReview.status!=='scheduled') fail(409,'La revisión seleccionada no corresponde a esta actividad o ya se cerró.'); }
    const result = store.transaction(()=>{
      for (const previous of store.all<Evaluation>('evaluations').filter(e=>e.assignmentId===assignment.id&&e.current)) store.put('evaluations',{...previous,current:false});
      const evaluation = store.put<Evaluation>('evaluations',{id:id('evaluation'),assignmentId:assignment.id,studentId:assignment.studentId,areaId:assignment.areaId,evaluatorId:actor(req).id,evaluatorName:actor(req).name,createdAt:now(),scores:body.scores,feedback:body.feedback,outcome:body.outcome,current:true});
      const updated = store.put('assignments',{...assignment,skillIds:[...assignment.skillIds,...addedSkillIds],status:body.outcome,blockedReason:body.outcome==='completed'?'':assignment.blockedReason,updatedAt:now(),version:assignment.version+1});
      if (targetReview) store.put('reviews',{...targetReview,status:'completed',outcome:body.feedback,version:targetReview.version+1});
      let review: Review|undefined;
      if (body.nextReviewAt) review = store.put<Review>('reviews',{id:id('review'),studentId:assignment.studentId,assignmentId:assignment.id,areaId:assignment.areaId,ownerId:actor(req).id,startsAt:body.nextReviewAt,durationMinutes:30,type:'follow_up',status:'scheduled',notes:'Seguimiento acordado durante la evaluación.',outcome:'',version:1});
      const addedNames = addedSkillIds.map(skillId=>store.get<Skill>('skills',skillId)?.name).filter(Boolean);
      audit(actor(req),'evaluation_recorded',assignment.id,`Evaluación registrada: ${body.outcome==='completed'?'terminada':'requiere correcciones'}.${addedNames.length?` Se añadieron habilidades observadas: ${addedNames.join(', ')}.`:''} Se conserva el historial anterior.`);
      return {evaluation,assignment:updated,review};
    });
    res.status(201).json(result);
  });
  app.post('/api/reviews',...mutate,(req,res)=>{
    const body = reviewCreate.parse(req.body);
    const student = studentFor(req,body.studentId);
    if (student.status!=='active') fail(409,'El alumno no está activo.');
    if (body.assignmentId) { const assignment = assignmentFor(req,body.assignmentId); if (assignment.studentId!==student.id) fail(400,'La actividad pertenece a otro alumno.'); if (assignment.status==='cancelled') fail(409,'La actividad está cancelada.'); }
    const review = store.transaction(()=>{ const created = store.put<Review>('reviews',{...body,id:id('review'),areaId:actor(req).areaId!,ownerId:actor(req).id,status:'scheduled',outcome:'',version:1}); audit(actor(req),'review_created',created.id,`Revisión de ${student.name} programada para ${body.startsAt}.`); return created; });
    res.status(201).json({review});
  });
  app.patch('/api/reviews/:id',...mutate,(req,res)=>{
    const body = reviewPatch.parse(req.body);
    const review = reviewFor(req,String(req.params.id));
    checkVersion(review.version,body.version);
    if (review.status!=='scheduled') fail(409,'La revisión ya se cerró. Programa una nueva revisión para continuar.');
    if ((body.startsAt&&body.startsAt!==review.startsAt) || body.status==='cancelled'||body.status==='missed') if (!body.changeReason) fail(400,'Indica el motivo del cambio.');
    const updated = store.transaction(()=>{ const {version:_,changeReason,agreements,...fields} = body; const result = store.put('reviews',{...review,...fields,...(agreements?{agreements:agreements.map(a=>({id:a.id??id('agreement'),text:a.text,done:a.done}))}:{}),version:review.version+1}); audit(actor(req),'review_updated',review.id,`Estado: ${result.status}. Fecha anterior: ${review.startsAt}. Fecha actual: ${result.startsAt}. ${changeReason??body.outcome??''}`); return result; });
    res.json({review:updated});
  });
  // Marcar un acuerdo como cumplido también en revisiones ya cerradas: es seguimiento, no cambia el resultado.
  app.post('/api/reviews/:id/agreements/:agreementId',...mutate,(req,res)=>{
    const {done} = z.object({done:z.boolean()}).strict().parse(req.body);
    const review = reviewFor(req,String(req.params.id));
    const agreement = review.agreements?.find(a=>a.id===String(req.params.agreementId)) ?? fail(404,'Acuerdo no encontrado.');
    const updated = store.transaction(()=>{ const result = store.put('reviews',{...review,agreements:review.agreements!.map(a=>a.id===agreement.id?{...a,done}:a),version:review.version+1}); audit(actor(req),'review_updated',review.id,`Acuerdo ${done?'cumplido':'reabierto'}: ${agreement.text}`); return result; });
    res.json({review:updated});
  });
  app.post('/api/meetings',...organize,(req,res)=>{
    const body = meetingCreate.parse(req.body);
    const user = actor(req);
    const meeting = store.transaction(()=>{ const created = store.put<Meeting>('meetings',{...body,id:id('meeting'),status:'scheduled',organizerName:user.name,createdAt:now(),updatedAt:now(),version:1}); for (const areaId of created.areaIds) audit(user,'meeting_created',created.id,`Reunión «${created.title}» agendada para ${created.startsAt}.`,areaId); return created; });
    res.status(201).json({meeting});
  });
  app.patch('/api/meetings/:id',...organize,(req,res)=>{
    const body = meetingPatch.parse(req.body);
    const meeting = store.get<Meeting>('meetings',String(req.params.id)) ?? fail(404,'Reunión no encontrada.');
    checkVersion(meeting.version,body.version);
    if (meeting.status==='cancelled') fail(409,'La reunión ya se canceló. Agenda una nueva.');
    const {version:_,...fields} = body;
    const updated = store.transaction(()=>{ const result = store.put<Meeting>('meetings',{...meeting,...fields,updatedAt:now(),version:meeting.version+1}); for (const areaId of new Set([...meeting.areaIds,...result.areaIds])) audit(actor(req),'meeting_updated',meeting.id,result.status==='cancelled'?`Reunión «${meeting.title}» cancelada.`:`Reunión «${result.title}» actualizada: ${result.startsAt}.`,areaId); return result; });
    res.json({meeting:updated});
  });
  app.post('/api/notes',...mutate,(req,res)=>{
    const body = z.object({studentId:identifier,text:text(6000).min(1)}).strict().parse(req.body);
    studentFor(req,body.studentId);
    const note = store.transaction(()=>{ const result = store.put<StudentNote>('notes',{id:id('note'),...body,areaId:actor(req).areaId!,authorName:actor(req).name,createdAt:now()}); audit(actor(req),'note_created',body.studentId,'Se añadió una observación de seguimiento.'); return result; });
    res.status(201).json({note});
  });
  app.post('/api/skills',...mutate,(req,res)=>{
    const body = z.object({name:text(100).min(2),description:text(2000).min(3)}).strict().parse(req.body);
    if (store.all<Skill>('skills').some(s=>(s.areaId===actor(req).areaId||s.areaId===null)&&s.name.localeCompare(body.name,'es',{sensitivity:'base'})===0)) fail(409,'Ya existe una habilidad con ese nombre.');
    const skill = store.transaction(()=>{ const result=store.put<Skill>('skills',{id:id('skill'),...body,areaId:actor(req).areaId!}); audit(actor(req),'skill_created',result.id,`Nueva habilidad: ${body.name}.`); return result; });
    res.status(201).json({skill});
  });
  const upload = multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:1,parts:2,fieldSize:100}});
  app.post('/api/assignments/:id/files',...mutate,(req,res,next)=>{ assignmentFor(req,String(req.params.id)); next(); },upload.single('file'),(req,res)=>{
    const assignment = assignmentFor(req,String(req.params.id));
    const {kind} = z.object({kind:z.enum(['instruction','evidence'])}).strict().parse(req.body);
    const file = req.file ?? fail(400,'Selecciona un archivo.');
    const name = file.originalname.replace(/[\x00-\x1F\x7F/\\]/g,'_').slice(0,180);
    const extension = extname(name).toLowerCase();
    const types: Record<string,string> = {'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.txt':'text/plain','.csv':'text/csv','.md':'text/plain','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
    if (!types[extension]||file.size===0) fail(400,'Archivo no admitido. Usa PDF, imágenes PNG/JPG, texto, CSV o documentos Office sin macros.');
    const sig = file.buffer.subarray(0,8);
    if ((extension==='.pdf'&&!file.buffer.subarray(0,5).equals(Buffer.from('%PDF-'))) || (extension==='.png'&&!sig.equals(Buffer.from([137,80,78,71,13,10,26,10]))) || (['.jpg','.jpeg'].includes(extension)&&!(sig[0]===255&&sig[1]===216&&sig[2]===255)) || (['.docx','.xlsx','.pptx'].includes(extension)&&!(sig[0]===80&&sig[1]===75))) fail(400,'El contenido del archivo no coincide con su extensión.');
    const attachment: FileRecord = {id:id('file'),assignmentId:assignment.id,name,size:file.size,kind,createdAt:now(),storageName:randomBytes(24).toString('hex')+extension,mimeType:types[extension]};
    const path = resolve(uploadsDir,attachment.storageName);
    writeFileSync(path,file.buffer,{flag:'wx',mode:0o600});
    try { store.transaction(()=>{ store.put('attachments',attachment); audit(actor(req),'file_uploaded',assignment.id,`Se adjuntó ${name} (${file.size} bytes).`); }); }
    catch(error) { unlinkSync(path); throw error; }
    const {storageName:_,mimeType:__,...safe} = attachment;
    res.status(201).json({attachment:safe});
  });
  app.get('/api/files/:id',auth,(req,res)=>{
    const file = store.get<FileRecord>('attachments',String(req.params.id)) ?? fail(404,'Archivo no encontrado.');
    assignmentFor(req,file.assignmentId);
    const path = resolve(uploadsDir,file.storageName);
    if (!path.startsWith(uploadsDir+sep)||!existsSync(path)) fail(404,'El archivo no está disponible.');
    res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options','nosniff');
    res.type(file.mimeType);
    res.download(path,file.name);
  });
  app.get('/api/export',auth,(req,res)=>{
    const data = workspace(actor(req));
    const students = data.students.filter(s=>actor(req).role==='director'||s.areaIds.includes(actor(req).areaId!));
    const rows: unknown[][] = [['Identificador','Alumno','Áreas','Estado','Actividades abiertas del alcance','Habilidad','Promedio','Evaluaciones','Última evaluación']];
    for (const student of students) {
      const evaluations = data.evaluations.filter(e=>e.studentId===student.id&&e.current&&(actor(req).role==='director'||e.areaId===actor(req).areaId));
      const open = data.assignments.filter(a=>a.studentId===student.id&&!['completed','cancelled'].includes(a.status)).length;
      const base = [student.registration,student.name,student.areaIds.map(a=>AREAS.find(area=>area.id===a)?.name).join(', '),student.status,open];
      const scores = new Map<string,{sum:number,count:number,last:string}>();
      for(const e of evaluations) for(const s of e.scores) if(s.score!==null) {const current=scores.get(s.skillId)??{sum:0,count:0,last:''};current.sum+=s.score;current.count++;current.last=e.createdAt>current.last?e.createdAt:current.last;scores.set(s.skillId,current);}
      if (!scores.size) rows.push([...base,'Sin evaluar','','','']);
      for(const [skillId,s] of scores) rows.push([...base,data.skills.find(k=>k.id===skillId)?.name??skillId,(s.sum/s.count).toFixed(2),s.count,s.last]);
    }
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="sag-reporte.csv"');
    res.send('\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'));
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Ruta no encontrada.'}));
  if (options.distDir && existsSync(resolve(options.distDir,'index.html'))) {
    app.use(express.static(options.distDir,{index:false,dotfiles:'deny',maxAge:'1h'}));
    app.get('/{*path}',(_req,res)=>{res.setHeader('Cache-Control','no-cache');res.sendFile(resolve(options.distDir!,'index.html'));});
  }
  app.use((error: unknown,_req: Request,res: Response,_next: NextFunction)=>{
    if (error instanceof ApiError) return res.status(error.status).json({error:error.message,code:error.code});
    if (error instanceof z.ZodError) return res.status(400).json({error:'Revisa los datos del formulario.',details:error.issues.map(i=>({field:i.path.join('.'),message:i.message}))});
    if (error instanceof multer.MulterError) return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:error.code==='LIMIT_FILE_SIZE'?'El archivo supera el límite de 10 MB.':'No se pudo cargar el archivo. Comprueba el formato y el número de archivos.'});
    if (error && typeof error==='object' && 'type' in error && error.type==='entity.too.large') return res.status(413).json({error:'La solicitud es demasiado grande.'});
    if (error instanceof SyntaxError) return res.status(400).json({error:'El cuerpo de la solicitud no es válido.'});
    console.error('SAG: error interno',error instanceof Error ? error.name : 'Error');
    return res.status(500).json({error:'No se pudo completar la operación. Inténtalo de nuevo.'});
  });
  return app;
}
