export const prerender = false;
import type { APIRoute } from 'astro';
import { PUBLIC_WP_URL, wcFetch } from '../../lib/woocommerce';

export const GET: APIRoute = async ({ url }) => {
    const query = (url.searchParams.get('q') || '').trim();
    const perPage = parseInt(url.searchParams.get('per_page') || '20');

    if (!query || query.length < 2) {
        return new Response(JSON.stringify([]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    try {
        // Búsqueda principal via WC REST API v3 (autenticada) — mucho más completa que Store API
        // porque Store API /search solo busca en títulos (campo name), mientras que v3 también
        // busca en sku, descripción y permite `search_columns`.
        const encoded = encodeURIComponent(query);

        // 1. Intentamos primero con Store API (más rápida, sin auth)
        let products: any[] = [];
        try {
            const storeRes = await fetch(
                `${PUBLIC_WP_URL}/wp-json/wc/store/v1/products?search=${encoded}&per_page=${perPage}`
            );
            if (storeRes.ok) {
                const storeData = await storeRes.json();
                if (Array.isArray(storeData) && storeData.length > 0) {
                    products = storeData;
                }
            }
        } catch (_) { /* silent fallback */ }


        // 2. Si Store API no devuelve muchos resultados, intentamos v3 y taxonomías
        if (products.length < perPage) {
            const [v3Data, categories, tags] = await Promise.all([
                wcFetch(`/products?search=${encoded}&per_page=${perPage}&status=publish`),
                wcFetch(`/products/categories?search=${encoded}&per_page=5`),
                wcFetch(`/products/tags?search=${encoded}&per_page=5`)
            ]);

            // Agregar productos de v3
            if (Array.isArray(v3Data)) {
                const seenIds = new Set(products.map(p => p.id));
                v3Data.forEach((p: any) => {
                    if (!seenIds.has(p.id)) {
                        products.push(p);
                        seenIds.add(p.id);
                    }
                });
            }

            // Si aún hay espacio, buscar productos por categoría o tag coincidentes
            if (products.length < perPage) {
                const extraTasks = [];
                
                if (Array.isArray(categories) && categories.length > 0) {
                    extraTasks.push(wcFetch(`/products?category=${categories[0].id}&per_page=10&status=publish&stock_status=instock`));
                }
                
                if (Array.isArray(tags) && tags.length > 0) {
                    extraTasks.push(wcFetch(`/products?tag=${tags[0].id}&per_page=10&status=publish&stock_status=instock`));
                }

                if (extraTasks.length > 0) {
                    const extraData = await Promise.all(extraTasks);
                    const seenIds = new Set(products.map(p => p.id));
                    extraData.forEach((list: any) => {
                        if (Array.isArray(list)) {
                            list.forEach((p: any) => {
                                if (!seenIds.has(p.id)) {
                                    products.push(p);
                                    seenIds.add(p.id);
                                }
                            });
                        }
                    });
                }
            }
        }


        // Normalizar la respuesta para el frontend
        const normalized = products.map((p: any) => {
            // Detectar si ya viene de Store API (tiene p.prices.currency_code)
            const isStoreApi = !!(p.prices?.currency_code);

            const minorUnit = isStoreApi ? (p.prices?.currency_minor_unit ?? 0) : 0;
            const divisor = Math.pow(10, minorUnit);

            let price = '0';
            let regularPrice = '0';

            if (isStoreApi) {
                // Store API devuelve precios en unidades menores (centavos)
                const rawPrice = p.prices?.price || p.prices?.regular_price || '0';
                price = Math.round(Number(rawPrice) / divisor).toString();
                regularPrice = Math.round(Number(p.prices?.regular_price || rawPrice) / divisor).toString();
            } else {
                // v3 devuelve precios normales
                const hasTax = p.tax_status === 'taxable';
                const mult = hasTax ? 1.19 : 1;
                price = Math.round(parseFloat(p.price || p.regular_price || '0') * mult).toString();
                regularPrice = Math.round(parseFloat(p.regular_price || p.price || '0') * mult).toString();
            }

            const firstImage = isStoreApi
                ? (p.images?.[0]?.src || '')
                : (p.images?.[0]?.src || '');

            return {
                id: p.id,
                name: p.name,
                slug: p.slug,
                price,
                regular_price: regularPrice,
                on_sale: isStoreApi ? (p.prices?.sale_price && p.prices.sale_price !== p.prices.price) : (p.on_sale || false),
                image: firstImage,
                categories: (p.categories || []).map((c: any) => ({ id: c.id, name: c.name, slug: c.slug })),
            };
        }).filter((p: any) => p.id && p.name);

        return new Response(JSON.stringify(normalized), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
            }
        });

    } catch (e: any) {
        console.error('[API Search] Error:', e.message);
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
