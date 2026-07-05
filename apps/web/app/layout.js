import './globals.css'

export const metadata = {
  title: 'NetField',
  description: 'Field tasks, bank tickets, hardware flow, and team chat in one place',
  applicationName: 'NetField',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NetField',
  },
  icons: {
    icon: '/netfield-icon.png',
    apple: '/netfield-icon.png',
  },
}

export default function RootLayout({ children }) {
 return (
    <html lang="en">
      <head />
      <body
        className="bg-slate-950 text-slate-900"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  )
}
