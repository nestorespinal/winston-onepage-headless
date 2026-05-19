export const prerender = false;
/**
 * /api/warm-cache — Cron diario 5AM
 *
 * MOTOR DE CALENTAMIENTO V7: Ultra-Paralelismo
 * - Evita el error 504 de Vercel procesando todo en < 10s.
 * - Lanza todas las peticiones simultáneamente.
 * - Usa AbortController para no quedar bloqueado en páginas pesadas.
 */
import type { APIRoute } from 'astro';
import { PUBLIC_WP_URL } from '../../lib/woocommerce';

export const config = {
    maxDuration: 300,
};

export const GET: APIRoute = async ({ request }) => {
    const t0 = Date.now();
    const origin = new URL(request.url).origin;
    
    // Auth vars
    const adminToken = (import.meta.env.VERCEL_REVALIDATE_TOKEN || '').trim();
    const cronHeader = request.headers.get('x-vercel-cron') || '';
    
    const searchParams = new URL(request.url).searchParams;
    const queryToken = searchParams.get('token') || '';
    const hasTokenAsFlag = adminToken !== '' && searchParams.has(adminToken);

    if (!cronHeader && (adminToken === '' || (queryToken !== adminToken && !hasTokenAsFlag))) {
        console.error('[WarmCache] Unauthorized access attempt');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    try {
        const { wcFetch } = await import('../../lib/woocommerce');
        console.log('[WarmCache] 📦 Obteniendo slugs via wcFetch...');

        // ─── 1. Obtener slugs en paralelo (Soporta hasta 500 items de cada uno) ──────
        const fetchMultiplePages = async (endpoint: string, pages = 5) => {
            const results = await Promise.all(
                Array.from({ length: pages }, (_, i) => i + 1).map(page => 
                    wcFetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
                        .then(res => Array.isArray(res) ? res : [])
                        .catch(() => [])
                )
            );
            return results.flat();
        };

        const [products, categories] = await Promise.all([
            fetchMultiplePages('/products?status=publish', 5),
            fetchMultiplePages('/products/categories?hide_empty=false', 5)
        ]);

        console.log(`[WarmCache] 🔍 WooCommerce API: ${products.length} productos, ${categories.length} categorías encontradas (después de paginación).`);

        const uniqueUrls = [...new Set([
            `${origin}/`,
            `${origin}/contacto`,
            `${origin}/guia-de-tallas`,
            `${origin}/politica-cookies`,
            `${origin}/politica-privacidad-proteccion-datos`,
            `${origin}/terminos-condiciones`,
            ...categories.map((c: any) => `${origin}/categoria/${c.slug}`),
            ...products.map((p: any) => `${origin}/productos/${p.slug}`)
        ])].filter(url => url && !url.includes('undefined') && url.startsWith('http'));

        console.log(`[WarmCache] Calentando ${uniqueUrls.length} URLs simultáneamente...`);

        if (uniqueUrls.length === 6) {
            console.warn('[WarmCache] ATENCIÓN: Solo se detectaron las 6 URLs estáticas. Verifica las credenciales WC_CONSUMER_KEY y WC_CONSUMER_SECRET si esperas productos.');
        }

        // ─── 2. Calentamiento Masivo ────────────
        const results = await Promise.allSettled(
            uniqueUrls.map(async (url) => {
                const headers: Record<string, string> = {
                    'Cache-Control': 'no-cache',
                    'User-Agent': 'WH-CacheWarmer/8.0'
                };
                
                let finalUrl = url;
                if (adminToken) {
                    headers['x-prerender-revalidate'] = adminToken;
                    headers['x-revalidate-auth'] = adminToken;
                    const connector = finalUrl.includes('?') ? '&' : '?';
                    finalUrl = `${finalUrl}${connector}vercel-protection-bypass-token=${adminToken}`;
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000);

                try {
                    const r = await fetch(finalUrl, { headers, signal: controller.signal });
                    clearTimeout(timeoutId);
                    return r.status;
                } catch {
                    clearTimeout(timeoutId);
                    return 202;
                }
            })
        );

        const okCount = results.filter(r => r.status === 'fulfilled').length;
        const elapsed = (Date.now() - t0) / 1000;

        return new Response(JSON.stringify({
            success: true,
            results: {
                total: uniqueUrls.length,
                ok: okCount,
                time: `${elapsed.toFixed(1)}s`,
                fetched: {
                    products: products.length,
                    categories: categories.length
                }
            }
        }), { 
            status: 200, 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (e: any) {
        console.error('[WarmCache] Fatal Error:', e.message);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
};
