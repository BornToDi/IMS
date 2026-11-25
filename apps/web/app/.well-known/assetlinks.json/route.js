import { androidAssociation } from '../../../lib/androidAssociation.mjs'

export const dynamic = 'force-dynamic'

export function GET() {
  const association = androidAssociation(process.env.ANDROID_PACKAGE_NAME, process.env.ANDROID_SHA256_FINGERPRINTS)
  if (!association) return Response.json({ error: 'Android app association is not configured' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
  return Response.json(association, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
