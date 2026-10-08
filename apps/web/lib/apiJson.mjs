export async function readApiJson(response) {
  let body
  try { body = await response.json() }
  catch {
    if ([502, 503, 504].includes(response.status)) throw new Error(`API service is unavailable (${response.status}). Please retry shortly.`)
    if (response.status === 404) throw new Error('API endpoint not found (404). Update and restart the API server, then retry.')
    throw new Error(`API returned a non-JSON response (${response.status}). Check the API server and /api proxy, then retry.`)
  }
  if (!response.ok) {
    const error = new Error(body?.error || `Request failed: ${response.status}`)
    error.status = response.status
    error.mapping = body?.mapping
    throw error
  }
  return body
}
