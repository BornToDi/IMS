import test from 'node:test'
import assert from 'node:assert/strict'
import { filterTickets, ticketSummary, ticketCsv } from './bankDashboard.mjs'

const tickets = [
  { ticketNo: 'T-1', status: 'SUBMITTED', priority: 'URGENT', createdAt: '2026-10-13T12:00:00Z', tidNumber: '123', merchantAddress: 'Dhaka' },
  { ticketNo: 'T-2', status: 'COMPLETED', priority: 'HIGH', createdAt: '2026-10-01T12:00:00Z' },
  { ticketNo: 'T-3', status: 'IN_PROGRESS', priority: 'NORMAL', createdAt: '2026-10-12T12:00:00Z', posSerial: 'POS-42' }
]
test('ticket filters combine date, status and terminal search without mutating records', () => {
  const now = Date.parse('2026-10-14T12:00:00Z')
  assert.deepEqual(filterTickets(tickets, { range: '7', now }).map(t => t.ticketNo), ['T-1', 'T-3'])
  assert.equal(filterTickets(tickets, { query: ' pos-42 ', status: 'IN_PROGRESS', now })[0].ticketNo, 'T-3')
  assert.equal(filterTickets(tickets, { query: 'missing', now }).length, 0)
  assert.deepEqual(filterTickets(tickets, { urgentOnly: true }).map(t => t.ticketNo), ['T-1'])
  assert.equal(tickets[1].ticketNo, 'T-2')
})
test('summary counts open priority requests and excludes completed requests', () => {
  const summary = ticketSummary(tickets)
  assert.equal(summary.open, 2)
  assert.equal(summary.completed, 1)
  assert.equal(summary.urgent, 1)
  assert.equal(summary.submitted, 1)
  assert.equal(ticketSummary([]).total, 0)
})
test('CSV escapes quotes, preserves addresses and neutralizes spreadsheet formulas', () => {
  const csv = ticketCsv([{ ...tickets[0], title: '=1+1', merchantAddress: 'Shop "A", Dhaka\nFloor 2', posSerial: ' @SUM(1)', workspace: { assignedEmployee: { name: 'Engineer' } } }])
  assert.ok(csv.includes('"\'=1+1"'))
  assert.ok(csv.includes('"\' @SUM(1)"'))
  assert.ok(csv.includes('"Shop ""A"", Dhaka\nFloor 2"'))
  assert.ok(csv.includes('"Engineer"'))
  assert.equal(ticketCsv([]).split('\r\n').length, 1)
})
