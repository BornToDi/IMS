export function filterTickets(tickets, { range = 'ALL', query = '', status = 'ALL', urgentOnly = false, now = Date.now() } = {}) {
  const term = query.trim().toLowerCase()
  return tickets.filter(ticket => {
    if (range !== 'ALL' && new Date(ticket.createdAt).getTime() < now - Number(range) * 86400000) return false
    if (status !== 'ALL' && ticket.status !== status) return false
    if (urgentOnly && (ticket.status === 'COMPLETED' || !['HIGH', 'URGENT'].includes(ticket.priority))) return false
    return !term || ['ticketNo', 'title', 'tidNumber', 'posSerial', 'merchantAddress', 'zoneName', 'serviceType'].some(key => String(ticket[key] || '').toLowerCase().includes(term))
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function ticketSummary(tickets) {
  const counts = {}
  for (const ticket of tickets) counts[ticket.status] = (counts[ticket.status] || 0) + 1
  const completed = counts.COMPLETED || 0
  return { counts, total: tickets.length, completed, open: tickets.length - completed, submitted: counts.SUBMITTED || 0, urgent: tickets.filter(ticket => ticket.status !== 'COMPLETED' && ['HIGH', 'URGENT'].includes(ticket.priority)).length }
}

export function ticketCsv(tickets) {
  // Spreadsheet applications interpret leading formula characters even in quoted cells.
  const cell = value => {
    let text = String(value ?? '')
    if (/^[\s]*[=+@-]|^[\t\r]/.test(text)) text = "'" + text
    return '"' + text.replaceAll('"', '""') + '"'
  }
  const headers = ['Ticket', 'Service', 'TID', 'POS serial', 'Merchant address', 'Engineer', 'Priority', 'Status', 'Raised']
  const rows = tickets.map(ticket => [ticket.ticketNo, ticket.serviceType || ticket.title, ticket.tidNumber, ticket.posSerial, ticket.merchantAddress, ticket.workspace?.assignedEmployee?.name || ticket.workspaces?.[0]?.assignedEmployee?.name, ticket.priority, ticket.status, ticket.createdAt])
  return [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')
}
