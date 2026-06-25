import './globals.css'

export const metadata = {
  title: 'NetField',
  description: 'Field tasks, bank tickets, hardware flow, and team chat in one place',
}

export default function RootLayout({ children }) {
 return (
    <html lang="en">
      <head />
      <body className="bg-slate-950 text-slate-900">
        {children}
      </body>
    </html>
  )
}
