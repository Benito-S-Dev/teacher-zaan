import sharp from 'sharp';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get('size'));
  const size = [180, 192, 512].includes(requested) ? requested : 192;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#047857"/><rect x="116" y="132" width="280" height="264" rx="32" fill="#f8fafc"/><path d="M116 212h280" stroke="#cbd5e1" stroke-width="14"/><path d="M188 112v60m136-60v60" stroke="#0f172a" stroke-width="24" stroke-linecap="round"/><path d="m176 284 80-36 80 36-80 36z" fill="#047857"/><path d="M208 308v32q48 32 96 0v-32" fill="none" stroke="#047857" stroke-width="14" stroke-linejoin="round"/></svg>`;
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' } });
}
