import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { nights, money, today, transition } from '../lib/hotel.mjs';
const db=new DatabaseSync(':memory:'); db.exec('PRAGMA foreign_keys=ON');
for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('drizzle/'+file,'utf8'));
function prepared(sql,args=[]){return {bind(...values){return prepared(sql,values)},async first(){return db.prepare(sql).get(...args)||null},async all(){if(/^SELECT/i.test(sql.trim()))return {results:db.prepare(sql).all(...args)};const r=db.prepare(sql).run(...args);return {results:[],meta:{changes:Number(r.changes)}}},async run(){const r=db.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}};}
globalThis.__hotelTestDB={prepare:prepared,async batch(statements){db.exec('BEGIN');try{const result=await Promise.all(statements.map(s=>s.all()));db.exec('COMMIT');return result}catch(e){db.exec('ROLLBACK');throw e}}};
globalThis.__hotelTestUser={userId:'owner-a'};
const code=ts.transpileModule(readFileSync('app/api/hotel/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/import \{ env \} from 'cloudflare:workers';/,"const env={DB:globalThis.__hotelTestDB};").replace(/import \{ getChatGPTUser \} from '..\/..\/chatgpt-auth';/,"const getChatGPTUser=async()=>globalThis.__hotelTestUser;").replace("'../../../lib/hotel.mjs'",JSON.stringify(pathToFileURL(process.cwd()+'/lib/hotel.mjs').href));
const {GET,POST}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const post=(body,origin='https://hotel.test')=>POST(new Request('https://hotel.test/api/hotel',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)}));
const tomorrow=new Date(Date.parse(today())+86400000).toISOString().slice(0,10);
let roomId,guestId,bookingId;
test('date and monetary validation',()=>{assert.equal(nights('2026-12-31','2027-01-02'),2);for(const d of ['2026-02-30','invalid',''])assert.throws(()=>nights(d,'2026-03-04'));assert.throws(()=>nights('2026-01-02','2026-01-02'));assert.equal(money(12.34),1234);for(const v of [NaN,-1,1.001,Infinity,'100'])assert.throws(()=>money(v));assert.equal(transition('completed','inhouse'),false);assert.equal(transition('confirmed','inhouse'),true);assert.match(today(),/^\d{4}-\d{2}-\d{2}$/)});
test('API requires authentication',async()=>{globalThis.__hotelTestUser=null;assert.equal((await GET()).status,401);assert.equal((await post({action:'room'})).status,401);globalThis.__hotelTestUser={userId:'owner-a'}});
test('API rejects cross-origin writes and unsupported content types',async()=>{assert.equal((await post({action:'room'},'https://evil.test')).status,403);assert.equal((await POST(new Request('https://hotel.test/api/hotel',{method:'POST',headers:{Origin:'https://hotel.test'},body:'x'}))).status,415)});
test('room and guest creation; duplicate room rejection',async()=>{const a=await post({action:'room',number:'101',type:'Standard',capacity:2,rate:3500});assert.equal(a.status,200);roomId=(await a.json()).id;const b=await post({action:'guest',name:'Hóspede de teste',phone:'+258 800000000'});assert.equal(b.status,200);guestId=(await b.json()).id;assert.equal((await post({action:'room',number:'101',type:'Standard',capacity:2,rate:3500})).status,409)});
test('room capacity and invalid dates enforced by API',async()=>{for(const change of [{people:3},{arrival:'2026-02-30'},{paid:4000}])assert.equal((await post({action:'booking',room_id:roomId,guest_id:guestId,arrival:today(),departure:tomorrow,people:1,...change})).status,400)});
test('create reservation and calculate price on server',async()=>{const r=await post({action:'booking',room_id:roomId,guest_id:guestId,arrival:today(),departure:tomorrow,people:2,paid:1000,total:1});assert.equal(r.status,200);bookingId=(await r.json()).id;const booking=db.prepare('SELECT * FROM bookings WHERE id=?').get(bookingId);assert.equal(booking.total,350000);assert.equal(booking.paid,100000)});
test('overlapping reservations rejected by atomic API insertion',async()=>{const r=await post({action:'booking',room_id:roomId,guest_id:guestId,arrival:today(),departure:tomorrow,people:1});assert.equal(r.status,409);assert.match((await r.json()).error,/reservado/)});
test('owners cannot read or modify each other’s records',async()=>{globalThis.__hotelTestUser={userId:'owner-b'};const r=await GET();const d=await r.json();assert.equal(d.rooms.length,0);assert.equal(d.guests.length,0);assert.equal(d.bookings.length,0);assert.equal((await post({action:'payment',id:bookingId,paid:0})).status,400);assert.equal((await post({action:'booking',room_id:roomId,guest_id:guestId,arrival:today(),departure:tomorrow,people:1})).status,400);globalThis.__hotelTestUser={userId:'owner-a'}});
test('room capacity cannot shrink below active reservation',async()=>{assert.equal((await post({action:'room',id:roomId,number:'101',type:'Standard',capacity:1,rate:3500})).status,400)});
test('check-in blocked during cleaning, allowed when ready',async()=>{assert.equal((await post({action:'room-state',id:roomId,state:'cleaning'})).status,200);assert.equal((await post({action:'status',id:bookingId,status:'inhouse'})).status,400);await post({action:'room-state',id:roomId,state:'available'});assert.equal((await post({action:'status',id:bookingId,status:'inhouse'})).status,200)});
test('occupied rooms cannot enter maintenance',async()=>{assert.equal((await post({action:'room-state',id:roomId,state:'maintenance'})).status,400)});
test('adjacent reservations allowed; future check-in blocked',async()=>{const after=new Date(Date.parse(tomorrow)+86400000).toISOString().slice(0,10);const r=await post({action:'booking',room_id:roomId,guest_id:guestId,arrival:tomorrow,departure:after,people:1});assert.equal(r.status,200);const id=(await r.json()).id;assert.equal((await post({action:'status',id,status:'inhouse'})).status,400)});
test('check-out atomically marks room for cleaning and cannot be repeated',async()=>{assert.equal((await post({action:'status',id:bookingId,status:'completed'})).status,200);assert.equal(db.prepare('SELECT state FROM rooms WHERE id=?').get(roomId).state,'cleaning');assert.equal((await post({action:'status',id:bookingId,status:'completed'})).status,400)});
test('payments cannot exceed total; settled balance persists',async()=>{assert.equal((await post({action:'payment',id:bookingId,paid:3501})).status,400);assert.equal((await post({action:'payment',id:bookingId,paid:3500})).status,200);const d=await (await GET()).json();assert.equal(d.bookings.find(b=>b.id===bookingId).paid,350000)});
test('cancellation requires refund; releases dates and locks payment editing',async()=>{const b=db.prepare("SELECT id FROM bookings WHERE status='confirmed'").get();await post({action:'payment',id:b.id,paid:100});assert.equal((await post({action:'status',id:b.id,status:'cancelled'})).status,400);await post({action:'payment',id:b.id,paid:0});assert.equal((await post({action:'status',id:b.id,status:'cancelled'})).status,200);assert.equal((await post({action:'payment',id:b.id,paid:10})).status,400)});

test('atomic check-in rejects an overdue occupant in an adjacent stay',async()=>{
 const yesterday=new Date(Date.parse(today())-86400000).toISOString().slice(0,10);
 db.prepare("UPDATE rooms SET state='available' WHERE id=?").run(roomId);
 db.prepare("UPDATE bookings SET arrival=?,departure=?,status='inhouse' WHERE id=?").run(yesterday,today(),bookingId);
 const r=await post({action:'booking',room_id:roomId,guest_id:guestId,arrival:today(),departure:tomorrow,people:1});assert.equal(r.status,200);
 const id=(await r.json()).id;assert.equal((await post({action:'status',id,status:'inhouse'})).status,409);
});
test('two simultaneous submissions yield only one reservation',async()=>{
 const start=new Date(Date.parse(today())+10*86400000).toISOString().slice(0,10),end=new Date(Date.parse(today())+11*86400000).toISOString().slice(0,10);
 const payload={action:'booking',room_id:roomId,guest_id:guestId,arrival:start,departure:end,people:1};
 const results=await Promise.all([post(payload),post(payload)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});
