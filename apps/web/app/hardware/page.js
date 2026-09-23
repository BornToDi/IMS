import InventoryApp from '../../components/inventory/InventoryApp'
export default async function HardwarePage({ searchParams }) {
  const params = await searchParams
  const query = (typeof params?.q === 'string' ? params.q : '').trim()
  return <InventoryApp key={query} initialQuery={query}/>
}
