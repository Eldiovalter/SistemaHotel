import { requireChatGPTUser } from './chatgpt-auth';
import HotelApp from './hotel-app';
export const dynamic='force-dynamic';
export default async function Home(){const user=await requireChatGPTUser('/');return <HotelApp userName={user.fullName||'Gestor'} />;}
