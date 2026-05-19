export const prerender = false;
import type { APIRoute } from 'astro';
import { getProductBySlug, getProductsByCategory, getAllProducts, searchProducts } from '../../lib/woocommerce';

export const GET: APIRoute = async ({ url }) => {
    const pageStr = url.searchParams.get('p') || url.searchParams.get('page') || '1';
    const page = parseInt(pageStr);
    const slug = url.searchParams.get('slug');
    const search = url.searchParams.get('search');

    try {
        console.log(`[API Products] Request: category=${url.searchParams.get('category')}, slug=${url.searchParams.get('slug')}, search=${search}`);

        // 0. BÚSQUEDA
        if (search) {
            const results = await searchProducts(search, parseInt(url.searchParams.get('per_page') || '20'));
            return new Response(JSON.stringify(results), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400'
                }
            });
        }
        // 1. DETALLE DEL PRODUCTO INDIVIDUAL
        if (slug) {
            let product = await getProductBySlug(slug);

            if (!product) {
                console.warn(`[API Products] Slug not found: ${slug}`);
                return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
            }

            return new Response(JSON.stringify(product), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400'
                }
            });
        }

        // 2. LISTADO POR CATEGORÍA O TODOS
        const categoryParam = url.searchParams.get('category');
        const perPage = parseInt(url.searchParams.get('per_page') || '16');
        const orderBy = url.searchParams.get('orderby') || 'date';
        const order = url.searchParams.get('order') || 'desc';
        const onSale = url.searchParams.get('on_sale') === 'true';
        const attribute = url.searchParams.get('attribute') || undefined;
        const attributeTerm = url.searchParams.get('attribute_term') || undefined;

        let allProducts = [];
        if (!categoryParam || categoryParam === 'all') {
            allProducts = await getAllProducts(perPage, page, orderBy, order, onSale);
        } else {
            allProducts = await getProductsByCategory(categoryParam, perPage, page, orderBy, order, onSale, attribute, attributeTerm);
        }
        console.log(`[API Products] Returning ${allProducts?.length || 0} products (Page: ${page}, PerPage: ${perPage})`);

        return new Response(JSON.stringify(allProducts), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400'
            }
        });

    } catch (error: any) {
        console.error('[API Products] Server Error:', error.message);
        return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), { status: 500 });
    }
};
