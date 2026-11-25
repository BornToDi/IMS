'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Layout from '../../components/Layout'
import { useAuthStore } from '../../store/useAuthStore'
import s from './receipts.module.css'

const banks = ['BRAC Bank PLC', 'Pubali Bank', 'UCB Bank', 'Islami Bank', 'Meghna Bank']
const merchants = ['Shwapno Super Shop', 'City Mart', 'Green Pharmacy', 'Metro Electronics', 'Fresh Foods', 'Family Store', 'Central Fashion', 'Food Corner']
const places = ['Gulshan', 'Banani', 'Dhanmondi', 'Uttara', 'Mirpur', 'Motijheel', 'Mohakhali', 'Chattogram']
const networks = ['VISA', 'Mastercard', 'VISA', 'Mastercard']
const bankHeadings = ['ব্র্যাক ব্যাংক পিএলসি', 'পূবালী ব্যাংক পিএলসি', 'ইউসিবি ব্যাংক পিএলসি', 'ইসলামী ব্যাংক বাংলাদেশ', 'মেঘনা ব্যাংক পিএলসি']
const cardholders = ['A RAHMAN', 'S AKTER', 'M HOSSAIN', 'N AHMED', 'R ISLAM']
const transactions = Array.from({ length: 100 }, (_, index) => {
  const number = index + 1
  const bankIndex = index % banks.length
  const merchantIndex = Math.floor(index / banks.length) % merchants.length
  const date = new Date(Date.UTC(2026, 10, 25 - (index % 20), 3 + (index % 10), (index * 7) % 60))
  return {
    id: `TXN-${String(number).padStart(6, '0')}`, bank: banks[bankIndex], bankHeading: bankHeadings[bankIndex], cardholder: cardholders[index % cardholders.length], merchant: merchants[merchantIndex],
    address: `${places[merchantIndex]}, Bangladesh`, serial: `980${String(bankIndex + 1).padStart(2, '0')}${String(number).padStart(9, '0')}`,
    tid: `${String(bankIndex + 1).padStart(2, '0')}${String(number).padStart(6, '0')}`, mid: `${String(bankIndex + 1).padStart(2, '0')}${String(number).padStart(13, '0')}`,
    date, amount: 350 + ((index * 731) % 24500), network: networks[index % networks.length],
    lastFour: String(1000 + (index * 83) % 9000), stan: String(100000 + number).slice(-6),
    rrn: String(631500000000 + number), approval: String(170000 + number), invoice: String(number).padStart(6, '0'),
    batch: String(100 + bankIndex).padStart(6, '0'), status: index % 12 === 0 ? 'Declined' : 'Approved'
  }
})
const money = value => `৳ ${value.toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const formatDate = date => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', year: 'numeric' }).format(date)
const formatTime = date => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(date)

function Receipt({ transaction, onClose }) {
  const dialog = useRef(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className={s.dialog} onClose={onClose} aria-labelledby="receipt-heading">
    <div className={s.modalHead}><div><span className={s.kicker}>TRANSACTION DETAILS</span><h2 id="receipt-heading">Receipt preview</h2><p>{transaction.id} · Sample transaction</p></div><button className={s.close} onClick={() => dialog.current?.close()} aria-label="Close receipt">×</button></div>
    <div className={s.preview}><article className={s.paper} aria-label={`Receipt for ${transaction.id}`}>
      <div className={s.receiptTop}><span className={s.sample}>SAMPLE RECEIPT</span><h3><span className={s.banglaBank}>{transaction.bankHeading}</span>{transaction.bank.toUpperCase()}</h3><strong>{transaction.merchant.toUpperCase()}</strong><p>{transaction.address.toUpperCase()}</p></div>
      <div className={s.receiptMeta}><div><span>TID: {transaction.tid}</span><b>MID: {transaction.mid}</b></div><div><span>{formatDate(transaction.date)}</span><b>TIME: {formatTime(transaction.date)}</b></div><div><span>BATCH NO: {transaction.batch}</span><b>STAN: {transaction.stan}</b></div></div>
      <div className={s.sale}>SALE</div><div className={s.cardNumber}>******{transaction.lastFour}</div><div className={s.receiptLine}><span>{transaction.network.toUpperCase()}</span><span>CHIP</span></div>
      <dl className={s.receiptDetails}><div><dt>EXP DATE: XX/XX</dt><dd>RRN: {transaction.rrn}</dd></div><div><dt>APPR. CODE:</dt><dd>{transaction.status === 'Approved' ? transaction.approval : '—'}</dd></div><div><dt>INVOICE NO:</dt><dd>{transaction.invoice}</dd></div><div><dt>APP: {transaction.network}</dt></div><div><dt>AID: {transaction.network === 'VISA' ? 'A0000000031010' : 'A0000000041010'}</dt></div></dl>
      <div className={s.amount}><span>AMOUNT</span><strong>{money(transaction.amount)}</strong></div><div className={s.verification}>{transaction.status === 'Approved' ? '*** PIN VERIFIED ***' : '*** DECLINED ***'}</div>
      <p className={s.receiptFoot}><strong>{transaction.cardholder}</strong><br/>I AGREE TO PAY THE ABOVE AMOUNT<br/>ACCORDING TO CARD ISSUER AGREEMENT<br/>(THANKS FOR USING POS)<br/>{transaction.bank === 'Pubali Bank' && <>HELP LINE: 16253<br/></>}</p><strong className={s.copy}>***** MERCHANT COPY *****</strong>
    </article></div>
    <div className={s.modalFoot}><span>Illustrative data · no real payment</span><div><button className={s.secondary} onClick={() => dialog.current?.close()}>Close</button><button className={s.primary} onClick={() => window.print()}>Print receipt</button></div></div>
  </dialog>
}

export default function ReceiptsPage() {
  const user = useAuthStore(state => state.user)
  const [query, setQuery] = useState('')
  const [bank, setBank] = useState('ALL')
  const [selected, setSelected] = useState(null)
  const [page, setPage] = useState(1)
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return transactions.filter(row => (bank === 'ALL' || row.bank === bank) && (!term || [row.id, row.bank, row.merchant, row.tid, row.serial, row.rrn].some(value => value.toLowerCase().includes(term))))
  }, [query, bank])
  const pages = Math.max(1, Math.ceil(filtered.length / 10))
  const currentPage = Math.min(page, pages)
  return <Layout>{user?.userRole === 'ADMIN' ? <div className={s.page}>
    <header className={s.header}><div><span className={s.kicker}>ADMIN / TRANSACTIONS</span><h1>POS receipts</h1><p>Review transactions and open a receipt for each payment.</p></div><span className={s.demoBadge}><span/> SAMPLE DATA</span></header>
    <div className={s.notice}><strong>Presentation data</strong><span>These transactions are illustrative. No live POS connection is configured.</span></div>
    <section className={s.panel}><div className={s.panelHead}><div><h2>Transaction list</h2><p>{filtered.length} transactions {bank !== 'ALL' ? `· ${bank}` : 'across all banks'}</p></div><span className={s.count}>{transactions.length} SAMPLE RECORDS</span></div>
      <div className={s.filters}><label className={s.search}><span aria-hidden="true">⌕</span><input aria-label="Search transactions" placeholder="Search transaction, merchant, TID or serial" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }}/></label><select aria-label="Filter by bank" value={bank} onChange={event => { setBank(event.target.value); setPage(1) }}><option value="ALL">All banks</option>{banks.map(name => <option key={name}>{name}</option>)}</select></div>
      <div className={s.tableScroll}><table className={s.table}><thead><tr><th>Transaction</th><th>Bank & merchant</th><th>Terminal</th><th>Date & time</th><th>Amount</th><th>Status</th><th><span className={s.srOnly}>Receipt</span></th></tr></thead><tbody>{filtered.slice((currentPage - 1) * 10, currentPage * 10).map(row => <tr key={row.id}><td><strong className={s.transactionId}>{row.id}</strong><span>{row.network} · •••• {row.lastFour}</span></td><td><strong>{row.merchant}</strong><span>{row.bank}</span></td><td><strong>{row.tid}</strong><span>{row.serial}</span></td><td><strong>{formatDate(row.date)}</strong><span>{formatTime(row.date)}</span></td><td><strong className={s.tableAmount}>{money(row.amount)}</strong></td><td><span className={`${s.status} ${row.status === 'Approved' ? s.approved : s.declined}`}>{row.status}</span></td><td><button className={s.view} onClick={() => setSelected(row)} aria-label={`View receipt ${row.id}`}>View <span aria-hidden="true">↗</span></button></td></tr>)}</tbody></table>{!filtered.length && <div className={s.empty}>No transactions found. Try a different search or bank.</div>}</div>
      <div className={s.pagination}><span>Page {currentPage} of {pages} · {filtered.length} results</span><div><button disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
    </section>{selected && <Receipt transaction={selected} onClose={() => setSelected(null)}/>}</div> : <div className={s.denied}><h1>Admin access required</h1><p>Only the software administrator can access receipts.</p></div>}</Layout>
}
