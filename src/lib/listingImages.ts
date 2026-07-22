import { getSupabaseClient, isSupabaseConfiguredForClient } from "@/lib/supabase";

export const LISTING_IMAGE_BUCKET = "listing-images";
export const LISTING_IMAGE_MAX_SOURCE_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_EDGE = 1280;

export function validateListingImage(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choose a JPG, PNG, or WebP image.");
  }
  if (file.size > LISTING_IMAGE_MAX_SOURCE_BYTES) {
    throw new Error("Product image must be 5 MB or smaller.");
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image could not be read. Try another file."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Could not prepare the product image.")),
      "image/webp",
      quality,
    );
  });
}

/** Resize large camera images before upload so marketplace cards stay fast. */
export async function prepareListingImage(file: File): Promise<File> {
  validateListingImage(file);
  const image = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is not available on this device.");
  context.drawImage(image, 0, 0, width, height);

  let blob = await canvasBlob(canvas, 0.82);
  if (blob.size > 3 * 1024 * 1024) blob = await canvasBlob(canvas, 0.65);
  if (blob.size > 3 * 1024 * 1024) {
    throw new Error("The processed image is still too large. Try a smaller image.");
  }

  const stem = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 50) || "product";
  return new File([blob], `${stem}.webp`, { type: "image/webp" });
}

export function listingImagePath(sellerAddr: string): string {
  const owner = sellerAddr.toLowerCase().replace(/\s+/g, "");
  const id = typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${owner}/${id}.webp`;
}

export function listingImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("data:") || path.startsWith("blob:")) return path;
  if (!isSupabaseConfiguredForClient()) return null;
  return getSupabaseClient().storage.from(LISTING_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the product image."));
    reader.readAsDataURL(file);
  });
}
