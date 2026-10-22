import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'نیکسوپی', template: '%s | نیکسوپی' },
  description: 'نیکسوپی — پرداخت ارزی، خرید اشتراک و گیفت کارت با تومان',
  icons: { icon: '/uploads/nikso-fa.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
