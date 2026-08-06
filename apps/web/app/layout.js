import './globals.css'

export const metadata = {
  title: 'TrackField',
  description: 'Field tasks, bank tickets, hardware flow, and team chat in one place',
  applicationName: 'TrackField',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'TrackField',
  },
  icons: {
    icon: '/trackfield-icon.png',
    apple: '/trackfield-icon.png',
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
