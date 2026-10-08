export async function authRequest(url, token, options = {}, { refreshAccessToken, fetcher = fetch } = {}) {
  const request = accessToken => fetcher(url, {
    credentials: 'include', ...options,
    headers: { ...options.headers, ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) }
  })
  let response = await request(token)
  if (response.status === 401 && refreshAccessToken) {
    const renewed = await refreshAccessToken()
    if (options.signal?.aborted) throw new DOMException('Request aborted', 'AbortError')
    if (renewed) response = await request(renewed)
  }
  return response
}
