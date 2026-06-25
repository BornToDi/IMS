import './globals.css'

export const metadata = {
  title: 'Collaborative Team Hub',
  description: 'Workspace goals, tasks, announcements, files, and team chat in one place',
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
