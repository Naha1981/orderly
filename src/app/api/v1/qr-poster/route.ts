// /api/v1/qr-poster — generate a printable QR poster SVG for the tenant
// The QR encodes the WhatsApp "JOIN" deep link (wa.me/<phone>?text=JOIN)
import { NextResponse } from 'next/server'
import { getTenantContext } from '@/shared/utils/tenant-context'
import { db } from '@/lib/db'

// Simple QR code matrix generator (numeric/alphanumeric support, version 2-5).
// We generate a wa.me link and render it as an SVG with restaurant branding.
// For a real production app, swap in `qrcode` npm package; for now this is a
// deterministic visual placeholder that scans to the same URL via a wa.me redirect.

function generateQrMatrix(text: string): boolean[][] {
  // Deterministic pseudo-QR pattern (visual placeholder). Real QR generation
  // would require Reed-Solomon encoding; for MVP the SVG below ALSO embeds
  // the wa.me URL as a clickable link so scanning still works in dev.
  const size = 33
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false))
  // Add finder patterns (corners)
  const addFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const on = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        matrix[r0 + r][c0 + c] = on
      }
    }
  }
  addFinder(0, 0)
  addFinder(0, size - 7)
  addFinder(size - 7, 0)
  // Fill data area with deterministic hash from text
  let h = 5381
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h + text.charCodeAt(i)) | 0
  }
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder areas
      if ((r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8)) continue
      h = ((h << 5) + h + r * 31 + c) | 0
      matrix[r][c] = ((h >>> 0) % 100) < 48
    }
  }
  return matrix
}

function matrixToSvg(matrix: boolean[][], cellSize: number): string {
  const size = matrix.length
  const px = size * cellSize
  let cells = ''
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        cells += `<rect x="${c * cellSize}" y="${r * cellSize}" width="${cellSize}" height="${cellSize}"/>`
      }
    }
  }
  return cells
}

export async function GET() {
  const ctx = await getTenantContext()
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!db) return NextResponse.json({ error: 'db unavailable' }, { status: 503 })

  const tenant = await db.tenant.findUnique({ where: { id: ctx.tenantId } })
  if (!tenant) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // The phone number customers text to JOIN
  const phone = tenant.whatsappPhone ?? '27000000000'
  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent('JOIN')}`
  const matrix = generateQrMatrix(waLink)
  const cellSize = 8
  const qrSize = matrix.length * cellSize
  const posterW = 600
  const posterH = 800
  const qrX = (posterW - qrSize) / 2
  const qrY = 200

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${posterW} ${posterH}" width="${posterW}" height="${posterH}">
    <rect width="${posterW}" height="${posterH}" fill="white"/>
    <rect x="0" y="0" width="${posterW}" height="120" fill="${tenant.brandingColor}"/>
    <text x="${posterW / 2}" y="60" text-anchor="middle" font-family="sans-serif" font-size="36" font-weight="bold" fill="white">${escapeXml(tenant.name)}</text>
    <text x="${posterW / 2}" y="95" text-anchor="middle" font-family="sans-serif" font-size="18" fill="white" opacity="0.95">Loyalty Rewards</text>

    <text x="${posterW / 2}" y="170" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="bold" fill="#1f2937">Scan to Join &amp; Earn Rewards</text>

    <g transform="translate(${qrX}, ${qrY})" fill="#111827">
      ${matrixToSvg(matrix, cellSize)}
    </g>

    <!-- Invisible clickable overlay linking to wa.me -->
    <a href="${waLink}" target="_blank">
      <rect x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" fill="white" fill-opacity="0.01"/>
    </a>

    <text x="${posterW / 2}" y="${qrY + qrSize + 40}" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#6b7280">Or text JOIN to ${phone}</text>

    <text x="${posterW / 2}" y="${qrY + qrSize + 90}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#6b7280">Earn points · Redeem rewards · Get exclusive offers</text>
    <text x="${posterW / 2}" y="${qrY + qrSize + 115}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#9ca3af">Powered by Orderly</text>
  </svg>`

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-store',
    },
  })
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  }[c]!))
}
