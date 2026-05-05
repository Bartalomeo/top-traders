import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Top Polymarket Traders — See what the best traders are doing',
  description: 'Track top-performing Polymarket traders, their positions, P&L history, and prediction wikis. Follow the best to make better decisions.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-[#0A0A0A] text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
