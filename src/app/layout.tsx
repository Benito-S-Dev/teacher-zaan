import type { Metadata, Viewport } from 'next';
import './globals.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Teacher Zaan · Weekly schedule', description: 'Your permanent weekly teaching board.', appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Teacher Zaan' }, icons: { icon: '/api/icon?size=192', apple: '/api/icon?size=180' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#047857' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
