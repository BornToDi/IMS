import { useRef, useState } from 'react'

const POSTER_WIDTH = 895
const POSTER_HEIGHT = 1197
// The reference crop includes the QR quiet zone and all five merchant rows.
const CROP = { x: 3, y: 208, width: 735, height: 789 }
const QR_PANEL = { x: 173, y: 220, width: 552, height: 552 }

async function renderPdfPoster(file) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const pdf = await task.promise
    const page = await pdf.getPage(1)
    const original = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: POSTER_HEIGHT / original.height })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    return canvas
  } finally {
    await task.destroy()
  }
}

function restoreBackground(context, x, top, bottom) {
  const width = context.canvas.width - x
  const height = bottom - top + 1
  const patch = context.createImageData(width, height)
  const upper = context.getImageData(x, top, width, 1).data
  const lower = context.getImageData(x, bottom, width, 1).data

  // Match the original red on both edges, including the JPEG halo around the panel.
  for (let row = 0; row < height; row += 1) {
    const blend = row / (height - 1)
    for (let channel = 0; channel < upper.length; channel += 1) {
      patch.data[row * upper.length + channel] = upper[channel] * (1 - blend) + lower[channel] * blend
    }
  }
  context.putImageData(patch, x, top)
}

function removeRedBackground(context, qrX, qrY, qrWidth, qrHeight) {
  const { width, height } = context.canvas
  const image = context.getImageData(0, 0, width, height)
  const { data } = image

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= qrX && x < qrX + qrWidth && y >= qrY && y < qrY + qrHeight) continue
      const index = (y * width + x) * 4
      const redStrength = data[index] - Math.max(data[index + 1], data[index + 2])
      const opacity = Math.max(0, Math.min(1, (100 - redStrength) / 75))
      data[index + 3] *= opacity
    }
  }

  context.putImageData(image, 0, 0)
}

export default function QrImageCrop() {
  const canvasRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function cropImage(event) {
    const file = event.target.files?.[0]
    if (!file) return

    event.target.value = ''
    setFileName('')
    setError('')
    setBusy(true)
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
    const url = isPdf ? null : URL.createObjectURL(file)
    try {
      let image
      if (isPdf) {
        image = await renderPdfPoster(file)
      } else {
        image = new Image()
        image.src = url
        await image.decode()
      }
      const scaleX = (image.naturalWidth ?? image.width) / POSTER_WIDTH
      const scaleY = (image.naturalHeight ?? image.height) / POSTER_HEIGHT
      if (Math.abs(scaleX / scaleY - 1) > 0.05) {
        setError('Choose a full portrait UCB QR poster with the original layout, including the header and footer.')
        return
      }

      const left = Math.round(CROP.x * scaleX)
      const top = Math.round(CROP.y * scaleY)
      const width = Math.round((CROP.x + CROP.width) * scaleX) - left
      const height = Math.round((CROP.y + CROP.height) * scaleY) - top
      if (width < 1 || height < 1) throw new Error('Image is too small')

      const canvas = canvasRef.current
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, left, top, width, height, 0, 0, width, height)

      const qrLeft = Math.round(QR_PANEL.x * scaleX)
      const qrTop = Math.round(QR_PANEL.y * scaleY)
      const qrRight = Math.round((QR_PANEL.x + QR_PANEL.width) * scaleX)
      const qrWidth = qrRight - qrLeft
      const qrHeight = Math.round((QR_PANEL.y + QR_PANEL.height) * scaleY) - qrTop
      const alignedLeft = left + Math.round((width - qrWidth) / 2)
      const alignedRight = alignedLeft + qrWidth
      if (qrWidth > 0 && qrHeight > 0 && alignedLeft < qrLeft && alignedRight - left < width) {
        context.imageSmoothingEnabled = false
        const margin = Math.max(1, Math.round(6 * scaleY))
        const patchTop = Math.max(0, qrTop - top - margin)
        const patchBottom = Math.min(height - 1, qrTop - top + qrHeight + margin)
        if (patchBottom > patchTop) restoreBackground(context, alignedRight - left, patchTop, patchBottom)
        context.drawImage(image, qrLeft, qrTop, qrWidth, qrHeight, alignedLeft - left, qrTop - top, qrWidth, qrHeight)
      }
      removeRedBackground(context, alignedLeft - left, qrTop - top, qrWidth, qrHeight)
      setFileName(file.name)
    } catch {
      setError('This file could not be converted. Choose a readable PDF or image file.')
    } finally {
      if (url) URL.revokeObjectURL(url)
      setBusy(false)
    }
  }

  function downloadImage() {
    canvasRef.current.toBlob((blob) => {
      if (!blob) {
        setError('The PNG could not be created. Please retry the download.')
        return
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${fileName.replace(/\.[^.]+$/, '') || 'ucb-qr'}-cropped.png`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    }, 'image/png')
  }

  return (
    <section className="shell-panel overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-900 px-6 py-6 text-white sm:px-8">
        <h1 className="text-2xl font-black sm:text-3xl">UCB QR image to PNG</h1>
        <p className="mt-2 text-sm text-slate-300">Import a full UCB QR poster as an image or PDF to export it on a transparent background. For PDFs, the first page is used.</p>
      </div>
      <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_500px]">
        <div className="space-y-4">
          <label htmlFor="ucb-qr-image" className="block text-sm font-bold text-slate-800">Poster PDF or image</label>
          <input id="ucb-qr-image" type="file" accept="application/pdf,.pdf,image/*" disabled={busy} onChange={cropImage} className="input w-full" />
          {fileName && <p className="break-all text-sm text-slate-600">{fileName}</p>}
          {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
          <button type="button" onClick={downloadImage} disabled={!fileName || busy} className="btn w-full py-3 disabled:cursor-not-allowed disabled:bg-slate-300">Download transparent PNG</button>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-bold text-slate-800">Preview</h2>
          <div className={`overflow-hidden rounded-2xl border border-slate-300 ${fileName ? 'bg-slate-800 bg-[conic-gradient(#334155_25%,transparent_0_50%,#334155_0_75%,transparent_0)] bg-[length:24px_24px]' : 'bg-slate-50'}`}>
            <canvas ref={canvasRef} hidden={!fileName} className={fileName ? 'h-auto w-full' : 'hidden'} aria-label="Cropped UCB QR poster preview" />
            {!fileName && <p className="grid aspect-[735/789] place-items-center p-8 text-center text-sm text-slate-500" role="status">{busy ? 'Creating preview…' : 'Import a poster to see the cropped result'}</p>}
          </div>
        </div>
      </div>
    </section>
  )
}
