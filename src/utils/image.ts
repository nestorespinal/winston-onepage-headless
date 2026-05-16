/**
 * Utility to optimize images using Astro's image service.
 * Since we are in a headless environment, we can use the /_image endpoint
 * which is standard in Astro for dynamic image optimization.
 */

export type ImageFormat = 'webp' | 'avif' | 'jpeg' | 'png';

interface OptimizeOptions {
  width?: number;
  height?: number;
  quality?: number | string;
  format?: ImageFormat;
}

/**
 * Generates an optimized URL for a remote image.
 */
export function getOptimizedUrl(src: string, options: OptimizeOptions = {}): string {
  // If it's a placeholder, already optimized, or an invalid URL, return as is
  if (!src || src.includes('placeholder.com') || src.startsWith('/_image') || src.includes('undefined')) return src;

  const { width, quality = 80, format = 'webp' } = options;
  
  // In static mode, runtime optimization via /_image is not available on Vercel
  // unless explicitly configured via edge functions. For now, we return the direct URL.
  // If the user wants build-time optimization, they should use Astro's <Image /> component.
  return src;
}

/**
 * Generates a srcset for responsive images.
 */
export function getImageSrcSet(src: string, widths: number[] = [300, 600, 900, 1200]): string {
  if (!src || src.includes('placeholder.com')) return '';
  
  return widths
    .map(w => `${getOptimizedUrl(src, { width: w })} ${w}w`)
    .join(', ');
}
