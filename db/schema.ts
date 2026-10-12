import { sqliteTable, text, integer, uniqueIndex, index, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const rooms = sqliteTable('rooms', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), number:text('number').notNull(), type:text('type').notNull(), capacity:integer('capacity').notNull(), rate:integer('rate').notNull(), state:text('state').notNull().default('available'),
}, t=>[uniqueIndex('room_number').on(t.owner,t.number),check('room_capacity',sql`${t.capacity} BETWEEN 1 AND 20`),check('room_rate',sql`${t.rate} > 0`),check('room_state',sql`${t.state} IN ('available','cleaning','maintenance')`)]);
export const guests = sqliteTable('guests', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), name:text('name').notNull(), phone:text('phone').notNull().default(''), email:text('email').notNull().default(''),
},t=>[index('guest_owner').on(t.owner)]);
export const bookings = sqliteTable('bookings', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), roomId:text('room_id').notNull().references(()=>rooms.id), guestId:text('guest_id').notNull().references(()=>guests.id), arrival:text('arrival').notNull(), departure:text('departure').notNull(), people:integer('people').notNull(), total:integer('total').notNull(), paid:integer('paid').notNull().default(0), status:text('status').notNull().default('confirmed'), notes:text('notes').notNull().default(''), created:text('created').notNull(),
}, t=>[index('booking_owner_dates').on(t.owner,t.arrival,t.departure),index('booking_room').on(t.roomId,t.status),index('booking_room_dates').on(t.roomId,t.arrival,t.departure),check('booking_dates',sql`${t.departure} > ${t.arrival}`),check('booking_money',sql`${t.total} > 0 AND ${t.paid} >= 0 AND ${t.paid} <= ${t.total}`),check('booking_status',sql`${t.status} IN ('confirmed','inhouse','completed','cancelled')`)]);
