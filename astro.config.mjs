// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';
import { loadEnv } from 'vite';

// Cargamos variables del .env (sin hardcoding)
const { WC_CONSUMER_KEY, WC_CONSUMER_SECRET, WC_URL } = loadEnv(process.env.NODE_ENV || 'development', process.cwd(), '');

/** Función para obtener todas las URLs de productos dinámicamente */
async function getDynamicProductPages() {
  if (!WC_CONSUMER_KEY || !WC_CONSUMER_SECRET) return [];

  const baseUrl = (WC_URL || "https://tienda.winstonandharrystore.com").replace(/\/$/, "");
  let allUrls = [];
  let page = 1;

  try {
    while (true) {
      const res = await fetch(`${baseUrl}/wp-json/wc/v3/products?page=${page}&per_page=100&consumer_key=${WC_CONSUMER_KEY}&consumer_secret=${WC_CONSUMER_SECRET}&status=publish&_fields=slug`);
      const products = await res.json();

      if (!Array.isArray(products) || products.length === 0) break;

      products.forEach(p => {
        allUrls.push(`https://www.winstonandharrystore.com/productos/${p.slug}`);
      });
      page++;
    }
  } catch (e) {
    console.warn("[Sitemap] Error cargando productos:", e.message);
  }
  return allUrls;
}

const productPages = await getDynamicProductPages();

export default defineConfig({
  site: 'https://www.winstonandharrystore.com',
  integrations: [
    react(),
    sitemap({
      customPages: productPages
    })
  ],
  redirects: {
    '/review-unicentro': 'https://g.page/r/CUpXPMxMDYUWEBM/review',
    '/review-palatino': 'https://g.page/r/CVqAdcaz3jkUEBM/review',
    '/review-santabarbara': 'https://g.page/r/CfogiOsEUdgVEBM/review',
    '/review-retiro': 'https://g.page/r/CSKXwQ5l5zSpEBM/review',
  },
  output: 'static',
  adapter: vercel({
    maxDuration: 60
  }),
  security: {
    checkOrigin: false
  },
  trailingSlash: 'ignore',
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover'
  },
  image: {
    domains: ["winstonandharrystore.com", "staging.winstonandharrystore.com", "tienda.winstonandharrystore.com"],
  },
});