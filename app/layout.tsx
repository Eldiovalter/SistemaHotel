import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'SistemaHotel · Gestão hoteleira',description:'Quartos, hóspedes e reservas num só lugar.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="pt-MZ"><body>{children}</body></html>;}
