export async function fetchChatHistoryPage(url, token, { signal, refreshAccessToken, fetcher = fetch }) {
  const request = accessToken => fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include', signal })
  let response = await request(token)
  if (response.status === 401) {
    const refreshed = await refreshAccessToken()
    if (signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
    if (refreshed) response = await request(refreshed)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    if (response.status === 401) throw new Error('Your session has expired. Please sign in again.')
    if ([502, 503, 504].includes(response.status)) throw new Error('Chat service is temporarily unavailable. Please retry shortly.')
    throw new Error(`Could not load chat (${response.status}). ${body.error || 'Please try again.'}`)
  }
  const page = await response.json()
  if (!Array.isArray(page)) throw new Error('The chat service returned an invalid response. Please retry.')
  return page
}
