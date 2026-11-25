import './globals.css'
import AppRuntime from '../components/AppRuntime'

export const viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover',
  interactiveWidget: 'resizes-content', themeColor: '#020617',
}

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
        <AppRuntime>{children}</AppRuntime>
      </body>
    </html>
  )
}
