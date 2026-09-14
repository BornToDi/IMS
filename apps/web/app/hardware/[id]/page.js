import InventoryApp from '../../../components/inventory/InventoryApp'
export default async function HardwareDetailPage({ params }) {
  const { id } = await params
  return <InventoryApp initialId={id}/>
}
