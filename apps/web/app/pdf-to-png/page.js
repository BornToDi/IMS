"use client"

import React, { useRef, useState } from 'react'
import Layout from '../../components/Layout'

const OUTPUT_SIZE = 500
const CONTENT_PADDING = 16
const QR_FRAME_PADDING = 8
const QR_FRAME_WIDTH = 2
const QR_FRAME_COLOR = '#0C6F3A'
const PRINT_DPI = 300
const QR_SIZE_INCHES = 1.2
const QR_TARGET_SIZE = Math.round(PRINT_DPI * QR_SIZE_INCHES)

function safeName(name) {
  return String(name || 'document').replace(/\.pdf$/i, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'document'
}

function makeBackgroundTransparent(context, width, height) {
  const image = context.getImageData(0, 0, width, height)
  const pixels = image.data
  const sampleSize = Math.max(2, Math.round(Math.min(width, height) * 0.015))
  const corners = [[0, 0], [width - sampleSize, 0], [0, height - sampleSize], [width - sampleSize, height - sampleSize]]
  let red = 0
  let green = 0
  let blue = 0
  let samples = 0

  for (const [startX, startY] of corners) {
    for (let y = startY; y < startY + sampleSize; y += 1) {
      for (let x = startX; x < startX + sampleSize; x += 1) {
        const index = (y * width + x) * 4
        red += pixels[index]
        green += pixels[index + 1]
        blue += pixels[index + 2]
        samples += 1
      }
    }
  }

  const background = [red / samples, green / samples, blue / samples]
  let left = width
  let top = height
  let right = -1
  let bottom = -1
  for (let index = 0; index < pixels.length; index += 4) {
    const distance = Math.sqrt(
      (pixels[index] - background[0]) ** 2 +
      (pixels[index + 1] - background[1]) ** 2 +
      (pixels[index + 2] - background[2]) ** 2
    )
    pixels[index + 3] = distance <= 16 ? 0 : distance < 52 ? Math.round(255 * (distance - 16) / 36) : 255
    if (pixels[index + 3] > 12) {
      const pixel = index / 4
      const x = pixel % width
      const y = Math.floor(pixel / width)
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  context.putImageData(image, 0, 0)
  return right >= left ? { x: left, y: top, width: right - left + 1, height: bottom - top + 1 } : null
}

function findQrBounds(context, content) {
  const { data } = context.getImageData(content.x, content.y, content.width, content.height)
  const occupiedRows = new Array(content.height).fill(false)

  for (let y = 0; y < content.height; y += 1) {
    for (let x = 0; x < content.width; x += 1) {
      if (data[(y * content.width + x) * 4 + 3] > 12) {
        occupiedRows[y] = true
        break
      }
    }
  }

  const bands = []
  let start = -1
  for (let y = 0; y <= content.height; y += 1) {
    if (y < content.height && occupiedRows[y]) {
      if (start < 0) start = y
    } else if (start >= 0) {
      bands.push({ top: start, bottom: y - 1 })
      start = -1
    }
  }

  const candidates = bands.map(({ top, bottom }) => {
    let left = content.width
    let right = -1
    for (let y = top; y <= bottom; y += 1) {
      for (let x = 0; x < content.width; x += 1) {
        if (data[(y * content.width + x) * 4 + 3] > 12) {
          left = Math.min(left, x)
          right = Math.max(right, x)
        }
      }
    }
    const width = right - left + 1
    const height = bottom - top + 1
    const ratio = width / height
    return { x: content.x + left, y: content.y + top, width, height, ratio }
  }).filter((candidate) => candidate.width > 0 && candidate.ratio >= 0.75 && candidate.ratio <= 1.33)

  return candidates.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0] || null
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function addPngDpi(blob, dpi) {
  const png = new Uint8Array(await blob.arrayBuffer())
  const pixelsPerMeter = Math.round(dpi / 0.0254)
  const chunk = new Uint8Array(21)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, 9)
  chunk.set([112, 72, 89, 115], 4)
  view.setUint32(8, pixelsPerMeter)
  view.setUint32(12, pixelsPerMeter)
  chunk[16] = 1
  view.setUint32(17, crc32(chunk.slice(4, 17)))

  const output = new Uint8Array(png.length + chunk.length)
  output.set(png.slice(0, 33), 0)
  output.set(chunk, 33)
  output.set(png.slice(33), 33 + chunk.length)
  return new Blob([output], { type: 'image/png' })
}

export default function PdfToPngPage() {
  const inputRef = useRef(null)
  const canvasRef = useRef(null)
  const pdfRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [pageNumber, setPageNumber] = useState(1)
  const [pageCount, setPageCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  async function renderPage(pdf, requestedPage) {
    setBusy(true)
    setError('')
    setReady(false)
    try {
      const page = await pdf.getPage(requestedPage)
      const baseViewport = page.getViewport({ scale: 1 })
      const renderScale = Math.max(3, 2200 / Math.max(baseViewport.width, baseViewport.height))
      const viewport = page.getViewport({ scale: renderScale })
      const sourceCanvas = document.createElement('canvas')
      sourceCanvas.width = Math.ceil(viewport.width)
      sourceCanvas.height = Math.ceil(viewport.height)
      const sourceContext = sourceCanvas.getContext('2d', { alpha: true })
      await page.render({ canvasContext: sourceContext, viewport, background: 'rgb(255,255,255)' }).promise
      const content = makeBackgroundTransparent(sourceContext, sourceCanvas.width, sourceCanvas.height)
      if (!content) throw new Error('No visible QR code or text was found on this page.')
      const qrBounds = findQrBounds(sourceContext, content)

      const canvas = canvasRef.current
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true })
      context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      const frameSpace = (QR_FRAME_PADDING + QR_FRAME_WIDTH) * 2
      const availableSize = OUTPUT_SIZE - CONTENT_PADDING * 2 - frameSpace
      const fitScale = Math.min(availableSize / content.width, availableSize / content.height)
      const qrScale = qrBounds ? Math.min(QR_TARGET_SIZE / qrBounds.width, QR_TARGET_SIZE / qrBounds.height) : fitScale
      const scale = qrScale
      const width = content.width * scale
      const height = content.height * scale
      const drawX = (OUTPUT_SIZE - width) / 2
      const drawY = (OUTPUT_SIZE - height) / 2
      context.drawImage(sourceCanvas, content.x, content.y, content.width, content.height, drawX, drawY, width, height)

      if (qrBounds) {
        const qrX = drawX + (qrBounds.x - content.x) * scale
        const qrY = drawY + (qrBounds.y - content.y) * scale
        const qrWidth = qrBounds.width * scale
        const qrHeight = qrBounds.height * scale
        context.strokeStyle = QR_FRAME_COLOR
        context.lineWidth = QR_FRAME_WIDTH
        context.strokeRect(
          qrX - QR_FRAME_PADDING - QR_FRAME_WIDTH / 2,
          qrY - QR_FRAME_PADDING - QR_FRAME_WIDTH / 2,
          qrWidth + (QR_FRAME_PADDING * 2) + QR_FRAME_WIDTH,
          qrHeight + (QR_FRAME_PADDING * 2) + QR_FRAME_WIDTH
        )
      }
      setPageNumber(requestedPage)
      setReady(true)
      page.cleanup()
    } catch (renderError) {
      console.error(renderError)
      setError('This PDF page could not be converted. Please try another PDF file.')
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a PDF file.')
      return
    }
    setBusy(true)
    setError('')
    setReady(false)
    try {
      const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
      pdfRef.current = pdf
      setFileName(file.name)
      setPageCount(pdf.numPages)
      await renderPage(pdf, 1)
    } catch (loadError) {
      console.error(loadError)
      setError('The PDF could not be opened. It may be damaged or password protected.')
      setBusy(false)
    }
  }

  function downloadPng() {
    if (!ready || !canvasRef.current) return
    canvasRef.current.toBlob(async (blob) => {
      if (!blob) return
      const printReadyBlob = await addPngDpi(blob, PRINT_DPI)
      const url = URL.createObjectURL(printReadyBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${safeName(fileName)}-page-${pageNumber}-500x500.png`
      link.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <Layout>
      <section className="mx-auto max-w-5xl space-y-6">
        <div className="shell-panel overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-900 px-6 py-6 text-white sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">Image utility</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">PDF to transparent PNG</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">Import a PDF containing a QR code and text. The background is detected automatically, removed, and the visible content is tightly fitted into an exact 500 × 500 PNG.</p>
          </div>

          <div className="grid gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_500px]">
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-800">PDF file</label>
                <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={handleFile} className="hidden" />
                <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="btn w-full disabled:cursor-wait disabled:opacity-60 sm:w-auto">
                  {busy ? 'Converting…' : fileName ? 'Choose another PDF' : 'Import PDF'}
                </button>
                {fileName && <p className="mt-3 break-all text-sm text-slate-600">{fileName}</p>}
              </div>

              {pageCount > 1 && (
                <div>
                  <label htmlFor="pdf-page" className="mb-2 block text-sm font-bold text-slate-800">PDF page</label>
                  <div className="flex items-center gap-3">
                    <select id="pdf-page" className="input max-w-40" value={pageNumber} disabled={busy} onChange={(event) => renderPage(pdfRef.current, Number(event.target.value))}>
                      {Array.from({ length: pageCount }, (_, index) => <option key={index + 1} value={index + 1}>Page {index + 1}</option>)}
                    </select>
                    <span className="text-sm text-slate-500">{pageCount} pages</span>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                <p className="font-bold">Your PDF stays private</p>
                <p className="mt-1 text-sky-800">Conversion happens only in this browser. The file is not saved or sent to the server.</p>
              </div>
              {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">{error}</div>}
              <button type="button" onClick={downloadPng} disabled={!ready || busy} className="btn w-full py-3 disabled:cursor-not-allowed disabled:bg-slate-300">Download transparent PNG</button>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between text-sm"><span className="font-bold text-slate-800">Preview</span><span className="text-slate-500">500 × 500 px</span></div>
              <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-slate-300 bg-[linear-gradient(45deg,#e2e8f0_25%,transparent_25%),linear-gradient(-45deg,#e2e8f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e2e8f0_75%),linear-gradient(-45deg,transparent_75%,#e2e8f0_75%)] bg-[length:24px_24px] bg-[position:0_0,0_12px,12px_-12px,-12px_0px] shadow-inner">
                <canvas ref={canvasRef} width={OUTPUT_SIZE} height={OUTPUT_SIZE} className={`h-full w-full ${ready ? 'opacity-100' : 'opacity-0'}`} aria-label="Transparent PNG preview" />
                {!ready && <div className="absolute inset-0 grid place-items-center p-8 text-center text-sm font-medium text-slate-500">{busy ? 'Creating preview…' : 'Import a PDF to see the transparent result'}</div>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  )
}
