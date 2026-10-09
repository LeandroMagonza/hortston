// Los dibujos de las cartas. Si en public/art/ hay una imagen para una carta (la lista está en
// public/art/index.json, que arma `npm run arte`), se dibuja esa; si no, el ícono (iconos.ts). Los
// retratos de los héroes se llaman heroe_<id>.
const images = new Map<string, HTMLImageElement>();

/** Carga la lista y las imágenes. Sin lista (todavía no se generó ninguna), no hace nada. */
export async function loadArt(): Promise<void> {
  let list: Record<string, string>;
  try {
    const res = await fetch('art/index.json', { cache: 'no-cache' });
    if (!res.ok) return;
    list = await res.json() as Record<string, string>;
  } catch {
    return;
  }
  for (const [id, file] of Object.entries(list)) {
    const img = new Image();
    img.onload = () => images.set(id, img);
    img.src = `art/${file}`;
  }
}

/** La imagen de una carta (o heroe_<id>), si ya está cargada. */
export function artImage(id: string): HTMLImageElement | null {
  return images.get(id) ?? null;
}

/** Dibuja la imagen llenando el rectángulo (recorta lo que sobra, sin deformar). */
export function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void {
  const k = Math.max(w / img.width, h / img.height);
  const sw = w / k, sh = h / k;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}
