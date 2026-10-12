import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { nights, text, money, whole, transition, today } from '../../../lib/hotel.mjs';
export const dynamic = 'force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){
 const user=await getChatGPTUser(); if(!user)return json({error:'Inicia sessão para continuar.'},401);
 try { if(!env.DB)throw Error('Database unavailable'); const db=env.DB;
 const results=await db.batch([db.prepare('SELECT * FROM rooms WHERE owner=? ORDER BY number').bind(user.userId),db.prepare('SELECT * FROM guests WHERE owner=? ORDER BY name').bind(user.userId),db.prepare('SELECT * FROM bookings WHERE owner=? ORDER BY arrival DESC, created DESC').bind(user.userId)]);
 return json({rooms:results[0].results,guests:results[1].results,bookings:results[2].results});
 }catch{ return json({error:'Não foi possível carregar os dados. Tenta novamente.'},503); }
}
export async function POST(request:Request){
 const user=await getChatGPTUser(); if(!user)return json({error:'Inicia sessão para continuar.'},401);
 const origin=request.headers.get('origin'); if(!origin||origin!==new URL(request.url).origin)return json({error:'Origem inválida.'},403);
 if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Formato inválido.'},415);
 try {
 const raw=await request.text(); if(raw.length>16000)return json({error:'Pedido demasiado grande.'},413);
 const body=JSON.parse(raw); if(!body||typeof body!=='object')throw Error('Pedido inválido.');
 const {action}=body; const db=env.DB; if(!db)return json({error:'Base de dados indisponível.'},503); const owner=user.userId; const id=body.id?text(body.id,80):crypto.randomUUID();
 if(action==='room'){
 const number=text(body.number,20),type=text(body.type,40),capacity=whole(body.capacity,1,20),rate=money(body.rate);if(!rate)throw Error('A diária deve ser superior a zero.');
 if(body.id){const result=await db.prepare("UPDATE rooms SET number=?,type=?,capacity=?,rate=? WHERE id=? AND owner=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE room_id=rooms.id AND status IN ('confirmed','inhouse') AND people>?)").bind(number,type,capacity,rate,id,owner,capacity).run();if(!result.meta.changes)throw Error('Quarto não encontrado ou capacidade inferior a uma reserva activa.');}
 else await db.prepare('INSERT INTO rooms (id,owner,number,type,capacity,rate,state) VALUES (?,?,?,?,?,?,?)').bind(id,owner,number,type,capacity,rate,'available').run();
 }else if(action==='guest'){
 const name=text(body.name,100),phone=text(body.phone??'',30,false),email=text(body.email??'',150,false);if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Indica um e-mail válido.');
 if(body.id){const result=await db.prepare('UPDATE guests SET name=?,phone=?,email=? WHERE id=? AND owner=?').bind(name,phone,email,id,owner).run();if(!result.meta.changes)throw Error('Hóspede não encontrado.');}
 else await db.prepare('INSERT INTO guests (id,owner,name,phone,email) VALUES (?,?,?,?,?)').bind(id,owner,name,phone,email).run();
 }else if(action==='booking'){
 const count=nights(body.arrival,body.departure);if(body.arrival<today())throw Error('A chegada não pode ser anterior a hoje.');const people=whole(body.people,1,20),roomId=text(body.room_id,80),guestId=text(body.guest_id,80);
 const room=await db.prepare('SELECT * FROM rooms WHERE id=? AND owner=?').bind(roomId,owner).first<{capacity:number;rate:number;state:string}>();const guest=await db.prepare('SELECT id FROM guests WHERE id=? AND owner=?').bind(guestId,owner).first();
 if(!room||!guest)throw Error('Selecciona um quarto e um hóspede válidos.');if(room.state==='maintenance')throw Error('O quarto está em manutenção.');if(people>room.capacity)throw Error('O número de hóspedes excede a capacidade do quarto.');
 const total=room.rate*count,paid=money(body.paid??0);if(paid>total)throw Error('O valor recebido excede o total.');
 const result=await db.prepare(`INSERT INTO bookings (id,owner,room_id,guest_id,arrival,departure,people,total,paid,status,notes,created)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE id=? AND owner=? AND capacity>=? AND state!='maintenance') AND EXISTS(SELECT 1 FROM guests WHERE id=? AND owner=?) AND NOT EXISTS(SELECT 1 FROM bookings WHERE room_id=? AND status IN ('confirmed','inhouse') AND arrival<? AND departure>?)`).bind(id,owner,roomId,guestId,body.arrival,body.departure,people,total,paid,'confirmed',text(body.notes??'',1000,false),new Date().toISOString(),roomId,owner,people,guestId,owner,roomId,body.departure,body.arrival).run();
 if(!result.meta.changes)return json({error:'O quarto já está reservado para essas datas ou deixou de estar disponível.'},409);
 }else if(action==='status'){
 const b=await db.prepare('SELECT * FROM bookings WHERE id=? AND owner=?').bind(id,owner).first<{status:string;room_id:string;arrival:string;departure:string;paid:number;total:number}>();if(!b||!transition(b.status,body.status))throw Error('Esta alteração de estado não é permitida.');
 if(body.status==='inhouse'){
 if(b.arrival>today()||b.departure<=today())throw Error('O check-in só está disponível durante as datas da estadia.');
 const room=await db.prepare('SELECT state FROM rooms WHERE id=? AND owner=?').bind(b.room_id,owner).first<{state:string}>();if(room?.state!=='available')throw Error('O quarto precisa de estar pronto para receber o hóspede.');
 }
 if(body.status==='cancelled'&&b.paid>0)throw Error('Regista primeiro a devolução do valor recebido, ajustando o recebido para zero.');
 if(body.status==='completed'){
 // D1 batch is transactional: clean the room and close the same active stay together.
 const results=await db.batch([
 db.prepare("UPDATE rooms SET state='cleaning' WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM bookings WHERE id=? AND owner=? AND room_id=rooms.id AND status='inhouse')").bind(b.room_id,owner,id,owner),
 db.prepare("UPDATE bookings SET status='completed' WHERE id=? AND owner=? AND status='inhouse'").bind(id,owner)]);
 if(!results[1].meta.changes)throw Error('A reserva foi alterada. Actualiza a página.');
 }else if(body.status==='inhouse'){
 const result=await db.prepare(`UPDATE bookings SET status='inhouse' WHERE id=? AND owner=? AND status='confirmed' AND arrival<=? AND departure>? AND EXISTS(SELECT 1 FROM rooms WHERE id=bookings.room_id AND owner=? AND state='available') AND NOT EXISTS(SELECT 1 FROM bookings AS other WHERE other.id!=bookings.id AND other.room_id=bookings.room_id AND other.status='inhouse')`).bind(id,owner,today(),today(),owner).run();
 if(!result.meta.changes)return json({error:'O quarto ainda está ocupado, não está pronto ou a reserva foi alterada.'},409);
 }else{
 const result=await db.prepare("UPDATE bookings SET status='cancelled' WHERE id=? AND owner=? AND status='confirmed' AND paid=0").bind(id,owner).run();
 if(!result.meta.changes)throw Error('A reserva ou o valor recebido foi alterado. Actualiza a página.');
 }
 }else if(action==='payment'){
 const paid=money(body.paid);const result=await db.prepare("UPDATE bookings SET paid=? WHERE id=? AND owner=? AND total>=? AND status!='cancelled'").bind(paid,id,owner,paid).run();if(!result.meta.changes)throw Error('Reserva inválida ou valor superior ao total.');
 }else if(action==='room-state'){
 if(!['available','cleaning','maintenance'].includes(body.state))throw Error('Estado inválido.');const result=await db.prepare("UPDATE rooms SET state=? WHERE id=? AND owner=? AND NOT EXISTS(SELECT 1 FROM bookings WHERE room_id=rooms.id AND status='inhouse')").bind(body.state,id,owner).run();if(!result.meta.changes)throw Error('Não é possível alterar um quarto ocupado.');
 }else return json({error:'Acção desconhecida.'},400);
 return json({ok:true,id});
 }catch(e){const msg=e instanceof Error?e.message:'';if(msg.includes('overlapping_booking'))return json({error:'O quarto já está reservado para essas datas.'},409);if(msg.includes('room_occupied'))return json({error:'O quarto ainda está ocupado por outro hóspede.'},409);if(msg.includes('room_unavailable'))return json({error:'O quarto não está disponível ou a capacidade foi alterada.'},409);if(msg.includes('UNIQUE constraint'))return json({error:'Já existe um quarto com esse número.'},409);if(msg.includes('D1')||msg.includes('SQLITE')||msg.includes('constraint')||e instanceof SyntaxError){console.error('hotel request failed',msg);return json({error:'Não foi possível guardar. Actualiza os dados e tenta novamente.'},400);}return json({error:msg||'Pedido inválido.'},400);}
}
