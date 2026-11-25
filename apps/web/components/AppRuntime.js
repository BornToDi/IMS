'use client'

import { createContext, useContext, useEffect, useState } from 'react'

const InstallContext = createContext({ canInstall: false, install: async () => {} })

export function InstallAppButton() {
  const { canInstall, install } = useContext(InstallContext)
  if (!canInstall) return null
  return <button type="button" onClick={install} className="mt-3 min-h-11 w-full rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 text-sm font-semibold text-teal-900">Install TrackField</button>
}

export default function AppRuntime({ children }) {
  const [offline, setOffline] = useState(false)
  const [installPrompt, setInstallPrompt] = useState(null)
  useEffect(() => {
    const connectionChanged = () => setOffline(!navigator.onLine)
    const offerInstall = event => { event.preventDefault(); setInstallPrompt(event) }
    const installed = () => setInstallPrompt(null)
    connectionChanged()
    window.addEventListener('online', connectionChanged)
    window.addEventListener('offline', connectionChanged)
    window.addEventListener('beforeinstallprompt', offerInstall)
    window.addEventListener('appinstalled', installed)
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(error => console.debug('App installation is unavailable:', error))
    }
    return () => {
      window.removeEventListener('online', connectionChanged)
      window.removeEventListener('offline', connectionChanged)
      window.removeEventListener('beforeinstallprompt', offerInstall)
      window.removeEventListener('appinstalled', installed)
    }
  }, [])
  async function install() {
    if (!installPrompt) return
    try {
      await installPrompt.prompt()
      await installPrompt.userChoice
    } catch (error) { console.debug('App installation is unavailable:', error) }
    finally { setInstallPrompt(null) }
  }
  return <InstallContext.Provider value={{ canInstall: Boolean(installPrompt), install }}>
    {offline && <div role="status" className="app-notice">You are offline. Reconnect before saving changes or sending messages.</div>}
    {children}
  </InstallContext.Provider>
}
