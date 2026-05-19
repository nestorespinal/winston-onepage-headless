/**
 * WooCommerce REST API Client for Winston & Harry
 * Using ck/cs credentials for full access and better data processing.
 */

const getEnv = (key: string) => {
    return import.meta.env[key] || 
           import.meta.env[`PUBLIC_${key}`] || 
           (typeof process !== 'undefined' ? process.env[key] : undefined) || 
           (typeof process !== 'undefined' ? process.env[`PUBLIC_${key}`] : undefined);
};

let WC_URL_ENV = (getEnv('WC_URL') || getEnv('WP_URL') || "https://tienda.winstonandharrystore.com").trim();

// Asegurar que use el subdominio tienda. si es el dominio principal para los llamados a la API
if (WC_URL_ENV.includes("winstonandharrystore.com") && !WC_URL_ENV.includes("tienda.")) {
    WC_URL_ENV = WC_URL_ENV.replace("winstonandharrystore.com", "tienda.winstonandharrystore.com");
}

export const PUBLIC_WP_URL = WC_URL_ENV.replace(/\/$/, "");
const WP_JSON_BASE = `${PUBLIC_WP_URL}/wp-json`;

// SSR Safe base64 helper
const safeBtoa = (str: string) => {
    try {
        if (typeof (globalThis as any).Buffer !== 'undefined') {
            return (globalThis as any).Buffer.from(str).toString('base64');
        }
        if (typeof btoa !== 'undefined') return btoa(str);
        return "";
    } catch (e) {
        return "";
    }
};

/**
 * Configuración de Caché (Nivel 2 - On Demand ISR)
 */
export const CACHE_TAGS = {
    all: 'products-all',
    product: (slug: string) => `product-${slug}`,
    category: (slug: string) => `category-${slug}`,
    home: 'home'
};

// ─── CACHÉ ESTÁTICA (Menús, Atributos, Categorías) ─────────────────────────
// TTL de 5 minutos para evitar saturar WC en ráfagas de tráfico
const STATIC_CACHE: Record<string, { data: any, timestamp: number }> = {};
const STATIC_TTL = 1000 * 60 * 5;

function getStaticCached(key: string) {
    const entry = STATIC_CACHE[key];
    if (entry && (Date.now() - entry.timestamp < STATIC_TTL)) return entry.data;
    return null;
}

function setStaticCached(key: string, data: any) {
    if (data) STATIC_CACHE[key] = { data, timestamp: Date.now() };
}
// ───────────────────────────────────────────────────────────────────────────

/**
 * Normaliza un texto para generar un slug válido (sin acentos, espacios -> guiones)
 */
function normalizeSlug(text: string): string {
    if (!text) return "";
    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/\s+/g, '-')           // Espacios a guiones
        .replace(/[^\w-]+/g, '');       // Quitar caracteres especiales
}

function normalizeQuery(text: string): string {
    if (!text) return "";
    return text.trim().toLowerCase();
}

export async function wcFetch(path: string, options: RequestInit = {}, retries = 3, delay = 500, timeoutMs = 4000) {
    // Leemos las claves en RUNTIME
    const CK = (getEnv('WC_CONSUMER_KEY') || getEnv('WP_CONSUMER_KEY') || "").trim();
    const CS = (getEnv('WC_CONSUMER_SECRET') || getEnv('WP_CONSUMER_SECRET') || "").trim();

    if (import.meta.env.SSR) {
        if (!CK.startsWith('ck_')) console.error(`[WC API] ALERTA: La Key no empieza por 'ck_' (actual: ${CK.substring(0, 4)}...)`);
        if (!CS.startsWith('cs_')) console.error(`[WC API] ALERTA: El Secret no empieza por 'cs_' (actual: ${CS.substring(0, 4)}...)`);
    }

    if (!CK || !CS) {
        console.error("[WC API] ERROR: Claves no encontradas en el request.");
    }
    // 1. Normalizar el path: quitar barras iniciales y el texto 'wp-json/' si viene incluido
    let cleanPath = path.replace(/^\/+/, '').replace('wp-json/', '');
    
    // 2. Determinar la URL final con el Namespace correcto
    let url = "";
    if (path.startsWith('http')) {
        url = path;
    } else {
        const namespaces = ['wc/', 'wp/', 'wh/'];
        const hasNamespace = namespaces.some(ns => cleanPath.startsWith(ns));
        
        if (hasNamespace) {
            // Ya tiene namespace (ej: wh/v1/menu)
            url = `${PUBLIC_WP_URL}/wp-json/${cleanPath}`;
        } else {
            // Es una ruta de WooCommerce puro (ej: products), añadimos wc/v3/
            url = `${PUBLIC_WP_URL}/wp-json/wc/v3/${cleanPath}`;
        }
    }

    // Limpieza de dobles barras (excepto las de http://)
    url = url.replace(/([^:]\/)\/+/g, "$1");

    // 3. Determinar si requiere Auth
    const finalCleanPath = url.split('wp-json/')[1] || "";
    const isWcNamespace = finalCleanPath.startsWith('wc/');
    const isWpNamespace = finalCleanPath.startsWith('wp/');
    const isStore = finalCleanPath.includes('wc/store/');
    
    // WooCommerce requiere Auth para casi todo excepto Store API
    const needsWcAuth = isWcNamespace && !isStore;
    
    // 4. Headers base
    const headers: any = {
        'Accept': 'application/json',
        ...(options.headers || {})
    };

    if (needsWcAuth && CK && CS) {
        // Auth para WooCommerce vía Query Params (más compatible)
        const connector = url.includes('?') ? '&' : '?';
        url += `${connector}consumer_key=${CK}&consumer_secret=${CS}`;

        // Redundancia vía Basic Auth
        headers['Authorization'] = `Basic ${safeBtoa(`${CK}:${CS}`)}`;
    } else if (isWpNamespace) {
        // Para wp/v2 usamos Application Passwords SOLO si están disponibles
        const WP_USER = getEnv('WP_APP_USER') || "";
        const WP_PASS = getEnv('WP_APP_PASS') || "";
        if (WP_USER && WP_PASS) {
            headers['Authorization'] = `Basic ${safeBtoa(`${WP_USER}:${WP_PASS}`)}`;
        }
        // Si no hay WP_APP_USER, la petición va sin auth (pública), 
        // que es lo ideal para la mayoría de wp/v2/pages o posts.
    }

    for (let i = 0; i < retries; i++) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            let res: Response;
            try {
                res = await fetch(url, { ...options, headers, signal: controller.signal });
            } finally {
                clearTimeout(timeoutId);
            }
            const endTime = Date.now();
            
            // Log removed for production

            if (res.status === 401) {
                console.error(`[WC API] 401 Unauthorized en ${url.split('?')[0]}. Revisa las claves WC_CONSUMER_KEY/SECRET.`);
                const text = await res.text();
                console.error(`[WC API] Detalle error: ${text.substring(0, 500)}`);
                return null;
            }
            
            if (res.status === 404) throw new Error(`WC API 404 en: ${url.split('?')[0]}`);
            
            if (!res.ok) {
                if ([500, 502, 503, 429].includes(res.status) && i < retries - 1) {
                    await new Promise(r => setTimeout(r, delay));
                    delay *= 2;
                    continue;
                }
                throw new Error(`WC API Error: ${res.status}`);
            }

            const text = await res.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                const cleaned = text.substring(text.indexOf('{'));
                return JSON.parse(cleaned);
            }
        } catch (error: any) {
            if (i === retries - 1) throw error;
            console.warn(`[WC API] Intento ${i+1} fallido: ${error.message}`);
            await new Promise(r => setTimeout(r, delay));
            delay *= 2;
        }
    }
}

/**
 * Obtiene un pool de productos para recomendaciones con caché de 10 minutos
 * para evitar saturar el servidor en visitas masivas.
 */
export async function getProductsPool() {
    try {
        // Usamos la Store API para obtener variaciones y precios formateados sin necesidad de auth
        const url = `${PUBLIC_WP_URL}/wp-json/wc/store/v1/products?per_page=60&stock_status=instock`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Store API error: ${res.status}`);
        
        const products = await res.json();
        if (products && Array.isArray(products)) {
            return products
                .map((p: any) => mapV3ToStore(p))
                .filter(p => p && p.prices.price !== "0" && p.prices.price !== "0.00" && p.stock_status !== 'outofstock');
        }
        return [];
    } catch (error) {
        console.error("Error fetching products pool via Store API:", error);
        return [];
    }
}

/**
 * Maps wc/v3 structure to wc/store/v1 structure for frontend compatibility
 * If the input is already from Store API, it will pass through or be slightly adjusted.
 */
function mapV3ToStore(p: any) {
    if (!p) return null;

    // Detect if it's a Store API product (v1 or similar)
    const isStoreApi = !!(p.prices && p.prices.currency_code);
    if (isStoreApi) {
        // Ensure images is an array
        if (!p.images || !Array.isArray(p.images)) p.images = [];

        // Normalize stock status only if coming from Store API raw
        if (p.is_in_stock !== undefined) {
            p.stock_status = p.is_in_stock ? 'instock' : 'outofstock';
        } else if (!p.stock_status) {
            p.stock_status = 'instock';
        }

        // The Store API returns prices in minor units (centavos).
        const minorUnit = p.prices?.currency_minor_unit || 0;
        const divisor = Math.pow(10, minorUnit);

        const normalizePriceStr = (val: string | undefined | null): string => {
            if (!val || val === "0") return "0";
            const num = Number(val);
            if (isNaN(num)) return "0";
            return Math.round(num / divisor).toString();
        };

        // If price is "0", try price_range first
        let rawPrice = p.prices.price;
        if ((!rawPrice || rawPrice === "0") && p.prices.price_range) {
            const min = p.prices.price_range.min_amount;
            if (min && min !== "0") rawPrice = min;
        }

        if (!rawPrice || rawPrice === "0") {
            rawPrice = p.prices.regular_price;
        }

        p.prices.price = normalizePriceStr(rawPrice);
        
        // Final sanity check: if price is still 0, it's invalid for display
        if (p.prices.price === "0" || p.prices.price === "0.00") return null;

        p.prices.regular_price = normalizePriceStr(p.prices.regular_price);
        p.prices.sale_price = normalizePriceStr(p.prices.sale_price);
        p.prices.currency_minor_unit = 0; // Already normalized

        // Deep mapping for variations if they exist in Store API
        if (p.variations && Array.isArray(p.variations)) {
            p.variations = p.variations.map((v: any) => {
                const vPrices = v.prices || {};
                const vDetails = p.variations_data?.find((vd: any) => Number(vd.id) === Number(v.id));
                
                return {
                    ...v,
                    // Usar la imagen de la REST API v3 si existe
                    image: vDetails?.image || v.image || null,
                    stock_status: v.is_in_stock !== undefined 
                        ? (v.is_in_stock ? 'instock' : 'outofstock') 
                        : (v.stock_status || 'instock'),
                    // Normalize variation prices
                    price: (vPrices.price && normalizePriceStr(vPrices.price) !== "0") ? normalizePriceStr(vPrices.price) : p.prices.price,
                    regular_price: (vPrices.regular_price && normalizePriceStr(vPrices.regular_price) !== "0") ? normalizePriceStr(vPrices.regular_price) : (vPrices.price ? normalizePriceStr(vPrices.price) : p.prices.regular_price),
                    sale_price: vPrices.sale_price ? normalizePriceStr(vPrices.sale_price) : "",
                    attributes: (v.attributes || []).map((a: any) => ({
                        ...a,
                        option: a.value || a.option || '',
                        value: a.value || a.option || ''
                    }))
                };
            });

            // Construir variation_images_map para Store API
            const imgMap: Record<string, any[]> = {};

            // 1. Primero cargamos las imágenes principales de las variaciones (para que sean las primeras)
            p.variations.forEach((v: any) => {
                const colorAttr = v.attributes?.find((a: any) => 
                     (a.name || "").toLowerCase().includes('color') || 
                     (a.id || "").toString().includes('color') ||
                     a.name === 'Pa_selecciona-el-color'
                );
                if (colorAttr && (colorAttr.value || colorAttr.option) && v.image?.src) {
                     const colorKey = String(colorAttr.value || colorAttr.option).toLowerCase().trim();
                     if (!imgMap[colorKey]) imgMap[colorKey] = [];
                     
                     if (!imgMap[colorKey].some(img => img.src === v.image.src)) {
                         imgMap[colorKey].push({ 
                            id: v.image.id || 0,
                            src: v.image.src, 
                            alt: v.image.alt || v.image.name || '',
                            name: v.image.name || ''
                        });
                     }
                }
            });

            // 2. Luego añadimos las de WPC (ordenadas después de la principal)
            if (p.variations_data && Array.isArray(p.variations_data) && p.wpc_resolved_media) {
                p.variations_data.forEach((v: any) => {
                    const wpcMeta = v.meta_data?.find((m: any) => m.key === 'wpcvi_images');
                    if (wpcMeta?.value) {
                         const colorAttr = v.attributes?.find((a: any) => 
                             (a.name || "").toLowerCase().includes('color') || 
                             (a.id || "").toString().includes('color') ||
                             a.name === 'Pa_selecciona-el-color'
                         );
                         const colorKey = colorAttr ? String(colorAttr.option || colorAttr.value).toLowerCase().trim() : 'default';
                         if (!imgMap[colorKey]) imgMap[colorKey] = [];
                         
                         const ids = wpcMeta.value.split(',').map((id: string) => id.trim());
                         ids.forEach((id: string) => {
                             const url = p.wpc_resolved_media[id];
                             if (url && !imgMap[colorKey].some(img => img.src === url)) {
                                 imgMap[colorKey].push({ id: parseInt(id), src: url, alt: p.name });
                             }
                         });
                    }
                });
            }

            if (Object.keys(imgMap).length > 0) {
                p.variation_images_map = imgMap;
            }
        }

        return p;
    }

    // Fallback for WooCommerce standard API (v3)
    const hasTax = p.tax_status === 'taxable';
    let rawPrice = parseFloat(p.price || p.regular_price || "0");

    // If still 0, check variations if available
    if (rawPrice === 0 && p.variations_data && p.variations_data.length > 0) {
        const prices = p.variations_data.map((v: any) => parseFloat(v.price || "0")).filter((pr: number) => pr > 0);
        if (prices.length > 0) rawPrice = Math.min(...prices);
    }

    const inclusivePrice = hasTax ? Math.round(rawPrice * 1.19) : Math.round(rawPrice);

    // NUEVO: Soporte para WPC Additional Variation Images
    const wpcImagesMap: Record<string, any[]> = {};
    if (p.variations_data && Array.isArray(p.variations_data)) {
        p.variations_data.forEach((v: any) => {
            const wpcMeta = v.meta_data?.find((m: any) => m.key === 'wpcvi_images');
            if (wpcMeta?.value && p.wpc_resolved_media) {
                const colorAttr = v.attributes?.find((a: any) => 
                    (a.name || "").toLowerCase().includes('color') || 
                    (a.id || "").toString().includes('color') ||
                    a.name === 'Pa_selecciona-el-color'
                );
                const colorKey = colorAttr ? String(colorAttr.option || colorAttr.value).toLowerCase().trim() : 'default';
                
                if (!wpcImagesMap[colorKey]) wpcImagesMap[colorKey] = [];
                
                const ids = wpcMeta.value.split(',').map((id: string) => id.trim());
                ids.forEach((id: string) => {
                    const url = p.wpc_resolved_media[id];
                    if (url && !wpcImagesMap[colorKey].some(img => img.src === url)) {
                        wpcImagesMap[colorKey].push({ 
                            id: parseInt(id),
                            src: url,
                            alt: p.name,
                            name: ""
                        });
                    }
                });
            }
        });
    }

    const mapped = {
        id: p.id,
        name: p.name,
        slug: p.slug,
        permalink: p.permalink,
        type: p.type,
        status: p.status,
        description: p.description,
        short_description: p.short_description,
        prices: {
            price: (inclusivePrice || 0).toString(),
            regular_price: p.regular_price
                ? Math.round(parseFloat(p.regular_price) * (hasTax ? 1.19 : 1)).toString()
                : (p.on_sale ? "" : (inclusivePrice || 0).toString()),
            sale_price: p.sale_price ? Math.round(parseFloat(p.sale_price) * (hasTax ? 1.19 : 1)).toString() : "",
            currency_code: "COP",
            currency_symbol: "$",
            currency_minor_unit: 0,
            currency_prefix: "$",
            price_range: null
        },
        images: (p.images || []).map((img: any) => ({
            id: img.id || 0,
            src: img.src || 'https://via.placeholder.com/600x600?text=Sin+Imagen',
            alt: img.alt || p.name,
            name: img.name || ""
        })),
        attributes: (p.attributes || []).map((attr: any) => ({
            id: attr.id,
            name: attr.name,
            slug: attr.slug,
            terms: attr.options?.map((opt: string, idx: number) => ({
                id: idx,
                name: opt,
                slug: normalizeSlug(opt)
            })) || []
        })),
        categories: p.categories?.map((cat: any) => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug
        })) || [],
        category_ids: p.categories?.map((cat: any) => cat.id) || [],
        tags: p.tags?.map((t: any) => ({
            id: t.id,
            name: t.name,
            slug: t.slug
        })) || [],
        variation_ids: p.variations || [],
        on_sale: p.on_sale || false,
        featured: p.featured || false,
        upsell_ids: p.upsell_ids || [],
        cross_sell_ids: p.cross_sell_ids || [],
        variations: p.variations_data?.map((v: any) => {
            const vRawPrice = parseFloat(v.price || v.regular_price || "0");
            const vIncPrice = hasTax ? Math.round(vRawPrice * 1.19) : Math.round(vRawPrice);
            const vRegRaw = parseFloat(v.regular_price || v.price || "0");
            const vIncRegPrice = hasTax ? Math.round(vRegRaw * 1.19) : Math.round(vRegRaw);

            return {
                ...v,
                price: vIncPrice > 0 ? vIncPrice.toString() : (inclusivePrice || "0").toString(),
                regular_price: vIncRegPrice > 0 ? vIncRegPrice.toString() : (p.regular_price || vIncPrice || "0").toString(),
                stock_status: v.stock_status || 'instock',
                attributes: (v.attributes || []).map((a: any) => ({
                    ...a,
                    option: a.option || a.value || '',
                    value: a.value || a.option || '',
                }))
            };
        }) || null,
        variation_images_map: (() => {
            if (p.variation_images_map) return p.variation_images_map;
            const imgMap: Record<string, any[]> = {};

            if (p.variations_data && Array.isArray(p.variations_data)) {
                const colorsArr = (p.attributes || []).find((a: any) => 
                    (a.name || "").toLowerCase().includes('color') || 
                    (a.slug || "").toLowerCase().includes('color')
                )?.options || [];

                // 1. Primero cargamos las imágenes principales de las variaciones (para que sean las primeras)
                p.variations_data.forEach((v: any) => {
                    const colorAttr = v.attributes?.find((a: any) => {
                        const n = (a.name || "").toLowerCase();
                        const s = (a.slug || "").toLowerCase();
                        return n.includes('color') || s.includes('color') || 
                               n.includes('selecciona-el') || s.includes('selecciona-el') ||
                               (a.id || "").toString().includes('color') ||
                               a.name === 'Pa_selecciona-el-color';
                    });
                    
                    if (colorAttr && (colorAttr.option || colorAttr.value) && v.image?.src) {
                         const colorValue = String(colorAttr.option || colorAttr.value).toLowerCase().trim();
                         // Usamos el slug normalizado si existe en los términos del producto, sino el valor crudo
                         const colorKey = normalizeSlug(colorValue) || colorValue;
                         
                         if (!imgMap[colorKey]) imgMap[colorKey] = [];
                         
                         if (!imgMap[colorKey].some((img: any) => img.src === v.image.src)) {
                             imgMap[colorKey].push({ 
                                id: v.image.id || 0,
                                src: v.image.src, 
                                alt: v.image.alt || v.image.name || '',
                                name: v.image.name || ''
                            });
                         }
                    }
                });

                // 2. Luego añadimos las de WPC (ordenadas después de la principal)
                p.variations_data.forEach((v: any) => {
                    const wpcMeta = v.meta_data?.find((m: any) => m.key === 'wpcvi_images');
                    if (wpcMeta?.value && p.wpc_resolved_media) {
                        const colorAttr = v.attributes?.find((a: any) => {
                            const n = (a.name || "").toLowerCase();
                            const s = (a.slug || "").toLowerCase();
                            return n.includes('color') || s.includes('color') || 
                                   n.includes('selecciona-el') || s.includes('selecciona-el') ||
                                   (a.id || "").toString().includes('color') ||
                                   a.name === 'Pa_selecciona-el-color';
                        });
                        
                        if (colorAttr && (colorAttr.option || colorAttr.value)) {
                            const colorValue = String(colorAttr.option || colorAttr.value).toLowerCase().trim();
                            const colorKey = normalizeSlug(colorValue) || colorValue;

                            if (!imgMap[colorKey]) imgMap[colorKey] = [];
                            
                            const ids = wpcMeta.value.split(',').map((id: string) => id.trim());
                            ids.forEach((id: string) => {
                                const url = p.wpc_resolved_media[id];
                                if (url && !imgMap[colorKey].some(img => img.src === url)) {
                                    imgMap[colorKey].push({ id: parseInt(id), src: url, alt: p.name });
                                }
                            });
                        }
                    }
                });
            }
            return Object.keys(imgMap).length > 0 ? imgMap : null;
        })(),
        stock_status: p.stock_status || 'instock',
        manage_stock: p.manage_stock || false,
        stock_quantity: p.stock_quantity || null,
        // Mantener intacta la metadata SEO de RankMath / Yoast
        yoast_head_json: p.yoast_head_json || p.rank_math_seo || null,
        rank_math_seo: p.rank_math_seo || null
    };

    // Para productos variables, si tenemos datos de variaciones, intentamos extraer los precios reales
    if (p.type === 'variable' && p.variations_data && p.variations_data.length > 0) {
        let maxRegular = 0;
        let minPrice = Infinity;

        p.variations_data.forEach((v: any) => {
            const vPrice = parseFloat(v.price || "0");
            const vRegular = parseFloat(v.regular_price || v.price || "0");
            if (vRegular > maxRegular) maxRegular = vRegular;
            if (vPrice > 0 && vPrice < minPrice) minPrice = vPrice;
        });

        if (maxRegular > 0) {
            mapped.prices.regular_price = Math.round(maxRegular * (hasTax ? 1.19 : 1)).toString();
        }
        if (minPrice !== Infinity) {
            mapped.prices.price = Math.round(minPrice * (hasTax ? 1.19 : 1)).toString();
        }
    }

    return mapped;
}

/**
 * Fetch Product by ID with all its variations
 */
export async function getProductById(id: number | string) {

    try {
        // Use v3 API instead of Store API to get correct variable product prices
        const product = await wcFetch(`/products/${id}`);
        if (!product) return null;

        // For variable products, fetch variations to get real prices + images
        if (product.type === 'variable' && product.id) {
            const variations = await getProductVariations(product.id);
            product.variations_data = variations;

            // NUEVO: Resolver imágenes de WPC si existen
            const allWpcIds = new Set<string>();
            variations.forEach((v: any) => {
                const meta = v.meta_data?.find((m: any) => m.key === 'wpcvi_images');
                if (meta?.value) meta.value.split(',').forEach((id: string) => allWpcIds.add(id.trim()));
            });

            if (allWpcIds.size > 0) {
                const idsArr = Array.from(allWpcIds);
                const mediaMap: Record<string, string> = {};
                for (let i = 0; i < idsArr.length; i += 50) {
                    const chunk = idsArr.slice(i, i + 50).join(',');
                    try {
                        const res = await fetch(`${PUBLIC_WP_URL}/wp-json/wp/v2/media?include=${chunk}&per_page=100`);
                        if (res.ok) {
                            const media = await res.json();
                            if (Array.isArray(media)) {
                                media.forEach((m: any) => { mediaMap[m.id.toString()] = m.source_url; });
                            }
                        }
                    } catch (e) {
                         console.error("[WC API] Error resolving WPC media:", e);
                    }
                }
                product.wpc_resolved_media = mediaMap;
            }

            // Variaciones procesadas en mapV3ToStore
        }

        const result = mapV3ToStore(product);
        return result;
    } catch (error) {
        console.error(`Error fetching product by ID ${id}:`, error);
        return null;
    }
}

export async function getCategoryBySlug(slug: string) {
    const cacheKey = `cat_slug_${slug}`;
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const categories = await wcFetch(`/products/categories?slug=${slug}`);
        if (!categories || categories.length === 0) return null;
        
        const result = categories[0];
        setStaticCached(cacheKey, result);
        return result;
    } catch (error: any) {
        console.error(`Error fetching category by slug ${slug}:`, error.message);
        return null;
    }
}

export async function getCategoryById(id: number) {
    const cacheKey = `cat_id_${id}`;
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const category = await wcFetch(`/products/categories/${id}`);
        if (!category) return null;
        
        setStaticCached(cacheKey, category);
        return category;
    } catch (error: any) {
        console.error(`Error fetching category by id ${id}:`, error.message);
        return null;
    }
}

/**
 * Fetch child categories of a parent category
 */
export async function getChildCategories(parentId: number) {

    try {
        // Use v3 authenticated API — public Store API was not returning subcategories reliably
        const categories = await wcFetch(`/products/categories?parent=${parentId}&per_page=50`);
        if (!categories || !Array.isArray(categories)) return [];

        // Normalize: map v3 fields to the shape the components expect (name, slug, id, image)
        const normalized = categories.map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            count: c.count,
            image: c.image ? { src: c.image.src, alt: c.image.alt || c.name } : null,
        }));

        return normalized;
    } catch (error) {
        console.error(`Error fetching child categories for parent ${parentId}:`, error);
        return [];
    }
}

/**
 * Fetch hierarchical categories (parents and their direct children)
 */
export async function getCategoryTree() {
    const cacheKey = "wc_category_tree";
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const categories = await wcFetch("/products/categories?per_page=100&hide_empty=true");
        if (!Array.isArray(categories)) return [];

        const roots = categories.filter((c: any) => c.parent === 0);
        const tree = roots.map((root: any) => ({
            id: root.id,
            name: root.name,
            slug: root.slug,
            children: categories
                .filter((c: any) => c.parent === root.id)
                .map((child: any) => ({
                    id: child.id,
                    name: child.name,
                    slug: child.slug
                }))
        }));

        setStaticCached(cacheKey, tree);
        return tree;
    } catch (error) {
        console.error("Error fetching category tree:", error);
        return [];
    }
}

/**
 * Fetch Product by Slug with all its variations in one go!
 */
/**
 * Fetch variations for a variable product (v3 API, authenticated)
 */
async function getProductVariations(productId: number) {
    try {
        const vars = await wcFetch(`/products/${productId}/variations?per_page=100`);
        return Array.isArray(vars) ? vars : [];
    } catch (e) {
        return [];
    }
}

export async function getProductBySlug(slug: string) {

    try {
        // Fetching product by slug...
        
        // 1. Intento vía Public WP API (para obtener el ID desde el slug sin auth)
        let productId = null;
        try {
            const wpRes = await fetch(`${PUBLIC_WP_URL}/wp-json/wp/v2/product?slug=${slug}`);
            if (wpRes.ok) {
                const wpData = await wpRes.json();
                if (Array.isArray(wpData) && wpData.length > 0) {
                    productId = wpData[0].id;
                }
            }
        } catch (e) {
            console.warn(`[WC API] WP API lookup failed for slug ${slug}, falling back.`);
        }

        // 2. Si tenemos ID, usamos Store API (pública y completa con variaciones)
        if (productId) {
            try {
                const storeRes = await fetch(`${PUBLIC_WP_URL}/wp-json/wc/store/v1/products/${productId}`);
                if (storeRes.ok) {
                    const storeProduct = await storeRes.json();
                    
                    if (storeProduct.type === 'variable' && productId) {
                        const variations = await getProductVariations(productId);
                        storeProduct.variations_data = variations;
                        
                        // NUEVO: Resolver imágenes de WPC si existen
                        const allWpcIds = new Set<string>();
                        variations.forEach((v: any) => {
                            const meta = v.meta_data?.find((m: any) => m.key === 'wpcvi_images');
                            if (meta?.value) meta.value.split(',').forEach((id: string) => allWpcIds.add(id.trim()));
                        });

                        if (allWpcIds.size > 0) {
                            const idsArr = Array.from(allWpcIds);
                            const mediaMap: Record<string, string> = {};
                            for (let i = 0; i < idsArr.length; i += 50) {
                                const chunk = idsArr.slice(i, i + 50).join(',');
                                try {
                                    const res = await fetch(`${PUBLIC_WP_URL}/wp-json/wp/v2/media?include=${chunk}&per_page=100`);
                                    if (res.ok) {
                                        const media = await res.json();
                                        if (Array.isArray(media)) {
                                            media.forEach((m: any) => { mediaMap[m.id.toString()] = m.source_url; });
                                        }
                                    }
                                } catch (e) {
                                    console.error("[WC API] Error resolving WPC media (StoreAPI):", e);
                                }
                            }
                            storeProduct.wpc_resolved_media = mediaMap;
                        }
                    }

                    const result = mapV3ToStore(storeProduct);
                    return result;
                }
            } catch (e) {
                console.warn(`[WC API] Store API fetch failed for ID ${productId}, falling back to v3.`);
            }
        }

        // 3. Fallback final: REST API v3 (con Auth)
        const path = `/products?slug=${slug}&status=publish`;
        const products = await wcFetch(path);
        
        if (!products || products.length === 0) {
            console.warn(`[WC API] No products found for slug: ${slug} in all APIs.`);
            return null;
        }

        const product = products[0];
        if (product.type === 'variable' && product.id) {
            const variations = await getProductVariations(product.id);
            product.variations_data = variations;
            
            // NUEVO: Resolver imágenes de WPC si existen
            const allWpcIds = new Set<string>();
            variations.forEach((v: any) => {
                const meta = v.meta_data?.find((m: any) => m.key === 'wpcvi_images');
                if (meta?.value) meta.value.split(',').forEach((id: string) => allWpcIds.add(id.trim()));
            });

            if (allWpcIds.size > 0) {
                const idsArr = Array.from(allWpcIds);
                const mediaMap: Record<string, string> = {};
                for (let i = 0; i < idsArr.length; i += 50) {
                    const chunk = idsArr.slice(i, i + 50).join(',');
                    try {
                        const res = await fetch(`${PUBLIC_WP_URL}/wp-json/wp/v2/media?include=${chunk}&per_page=100`);
                        if (res.ok) {
                            const media = await res.json();
                            if (Array.isArray(media)) {
                                media.forEach((m: any) => { mediaMap[m.id.toString()] = m.source_url; });
                            }
                        }
                    } catch (e) {
                         console.error("[WC API] Error resolving WPC media (slug v3):", e);
                    }
                }
                product.wpc_resolved_media = mediaMap;
            }
            
            // Variaciones procesadas en mapV3ToStore
        }

        const result = mapV3ToStore(product);
        return result;
    } catch (error: any) {
        console.error(`[WC API] Error crítico en getProductBySlug "${slug}":`, error.message);
        return null;
    }
}

/**
 * Fetch all products (Generic Shop Page)
 */
export async function getAllProducts(
    perPage = 16,
    page = 1,
    orderBy = "popularity",
    order = "desc",
    onSale = false
) {
    try {
        // Prioridad: Store API
        const storeParams = new URLSearchParams({
            per_page: perPage.toString(),
            page: page.toString(),
            orderby: orderBy,
            order: order
        });
        if (onSale) storeParams.append('on_sale', 'true');

        const storeUrl = `${PUBLIC_WP_URL}/wp-json/wc/store/v1/products?${storeParams.toString()}&stock_status=instock`;
        const storeRes = await fetch(storeUrl);

        if (storeRes.ok) {
            const data = await storeRes.json();
            return Array.isArray(data) ? data.map(p => mapV3ToStore(p)).filter(p => p !== null) : [];
        }

        // Fallback: v3
        const v3Params = new URLSearchParams({
            per_page: perPage.toString(),
            page: page.toString(),
            orderby: orderBy,
            order: order,
            status: 'publish',
            stock_status: 'instock'
        });
        if (onSale) v3Params.append('on_sale', 'true');

        const data = await wcFetch(`/products?${v3Params.toString()}`);
        return Array.isArray(data) ? data.map(p => mapV3ToStore(p)) : [];
    } catch (error: any) {
        console.error("[getAllProducts] Error:", error.message);
        return [];
    }
}

export async function searchProducts(query: string, perPage = 20) {
    if (!query || query.length < 2) return [];

    // Normalizado de términos comunes y typos
    const normalizeQuery = (q: string) => {
        const lower = q.toLowerCase().trim();
        // Diccionario de "Deseo decir" (Fuzzy simple)
        const commonTypos: Record<string, string> = {
            'roap': 'ropa', 'rospa': 'ropa', 'ropps': 'ropa',
            'zapato': 'zapatos', 'sapato': 'zapatos', 'zapatoz': 'zapatos',
            'mcltas': 'maletas', 'maleta': 'maletas',
            'cinturon': 'cinturones', 'sinturon': 'cinturones',
            'moka': 'mocasines', 'moccasin': 'mocasines',
            'oxford': 'oxford', 'oxfor': 'oxford',
            'bota': 'botas', 'vota': 'botas'
        };
        return commonTypos[lower] || lower;
    };

    const term = normalizeQuery(query);

    try {
        // 1. Intento de búsqueda por texto (Título/Descripción)
        let results: any[] = [];
        const storeUrl = `${PUBLIC_WP_URL}/wp-json/wc/store/v1/products?search=${encodeURIComponent(term)}&per_page=${perPage}&stock_status=instock`;
        const storeRes = await fetch(storeUrl);
        
        if (storeRes.ok) {
            const data = await storeRes.json();
            results = Array.isArray(data) ? data.map(p => mapV3ToStore(p)).filter(p => p !== null) : [];
        } else {
            const data = await wcFetch(`/products?search=${encodeURIComponent(term)}&per_page=${perPage}&status=publish&stock_status=instock`);
            results = Array.isArray(data) ? data.map(p => mapV3ToStore(p)) : [];
        }

        // 2. Inteligencia extra: Buscar por Categorías y Tags
        // Si no hay resultados o si el término es corto/genérico, buscamos coincidencias en taxonomías
        const isCommonTerm = ['ropa', 'zapatos', 'calzado', 'maletas', 'cinturones', 'botas', 'mocasines', 'tenis', 'chaquetas', 'morral', 'maletin', 'billetera'].includes(term);
        
        if (results.length < 5 || isCommonTerm) {
            const [categories, tags] = await Promise.all([
                wcFetch(`/products/categories?search=${encodeURIComponent(term)}&per_page=10`),
                wcFetch(`/products/tags?search=${encodeURIComponent(term)}&per_page=10`)
            ]);
            
            let extraProducts: any[] = [];

            // Procesar Categorías
            if (Array.isArray(categories) && categories.length > 0) {
                const bestCat = categories.find(c => c.slug === term || c.name.toLowerCase() === term) || categories[0];
                if (bestCat) {
                    const catProducts = await getProductsByCategory(bestCat.id, perPage);
                    extraProducts = [...extraProducts, ...catProducts];
                }
            }

            // Procesar Tags
            if (Array.isArray(tags) && tags.length > 0) {
                const bestTag = tags.find(t => t.slug === term || t.name.toLowerCase() === term) || tags[0];
                if (bestTag) {
                    // Obtener productos por tag
                    const tagProductsData = await wcFetch(`/products?tag=${bestTag.id}&per_page=${perPage}&status=publish&stock_status=instock`);
                    if (Array.isArray(tagProductsData)) {
                        const mappedTagProducts = tagProductsData.map(p => mapV3ToStore(p)).filter(p => p !== null);
                        extraProducts = [...extraProducts, ...mappedTagProducts];
                    }
                }
            }

            if (extraProducts.length > 0) {
                // Combinar de forma inteligente:
                // 1. Resultados exactos (si los hay)
                // 2. Resultados de taxonomías
                // 3. Otros resultados
                const seenIds = new Set(results.map(p => p.id));
                for (const p of extraProducts) {
                    if (!seenIds.has(p.id)) {
                        results.push(p);
                        seenIds.add(p.id);
                    }
                }
                
                // Si el término coincide exactamente con el nombre de un producto de extraProducts, ponerlo arriba
                results.sort((a, b) => {
                    const aName = a.name.toLowerCase();
                    const bName = b.name.toLowerCase();
                    if (aName === term) return -1;
                    if (bName === term) return 1;
                    return 0;
                });
            }
        }

        return results.slice(0, perPage);
    } catch (error) {
        console.error("[searchProducts] Error:", error);
        return [];
    }
}

export async function getProductsByCategory(
    categoryIdOrSlug: string | number,
    perPage = 100,
    page = 1,
    orderBy: any = 'date',
    order: any = 'desc',
    onSale = false,
    attribute?: string,
    attributeTerm?: string | number
) {
    let finalId = categoryIdOrSlug;

    // Si recibimos un slug (ej: "zapatos") en lugar de un ID numérico
    if (typeof categoryIdOrSlug === 'string' && isNaN(Number(categoryIdOrSlug))) {
        try {
            const cat = await getCategoryBySlug(categoryIdOrSlug);
            if (cat) finalId = cat.id;
        } catch (e) {
            console.error(`[getProductsByCategory] No se pudo encontrar ID para el slug: ${categoryIdOrSlug}`);
        }
    }


    try {
        const ids = finalId.toString().split(',').map(id => id.trim()).filter(Boolean);

        const fetchCategory = async (id: string) => {
            try {
                // PRIORIDAD: Store API (Pública, mucho más rápida y cacheable en el server de WP)
                const storeUrl = `${PUBLIC_WP_URL}/wp-json/wc/store/v1/products?category=${id}&per_page=${perPage}&page=${page}&orderby=${orderBy}&order=${order}${onSale ? '&on_sale=true' : ''}&stock_status=instock`;
                const storeRes = await fetch(storeUrl);
                
                if (storeRes.ok) {
                    const data = await storeRes.json();
                    return Array.isArray(data) ? data.map((p: any) => mapV3ToStore(p)).filter(p => p !== null) : [];
                }
                
                // Fallback: Si Store API falla, usamos v3 (Autenticada)
                const data = await wcFetch(`/products?category=${id}&per_page=${perPage}&page=${page}&orderby=${orderBy}&order=${order}&status=publish&stock_status=instock${onSale ? '&on_sale=true' : ''}${attribute ? `&attribute=${attribute}` : ''}${attributeTerm ? `&attribute_term=${attributeTerm}` : ''}`);
                return Array.isArray(data) ? data : [];
            } catch (err: any) {
                console.warn(`[getProductsByCategory] Error en fetch para id ${id}:`, err.message);
                return [];
            }
        };

        const results = await Promise.all(ids.map(fetchCategory));

        const combined = [];
        const seenIds = new Set();
        for (const list of results) {
            if (Array.isArray(list)) {
                for (const p of list) {
                    if (p && (p.id || p.id === 0) && !seenIds.has(p.id)) {
                        const mapped = mapV3ToStore(p);
                        if (mapped) {
                            seenIds.add(p.id);
                            combined.push(mapped);
                        }
                    }
                }
            }
        }

        return combined;
    } catch (error: any) {
        console.error("Error fetching products by category:", error.message);
        return [];
    }
}
/**
 * Fetch a WordPress Page by ID
 */
export async function getPageById(id: number | string) {
    try {
        const page = await wcFetch(`/wp/v2/pages/${id}`);
        return page;
    } catch (error) {
        console.error(`Error fetching page by ID ${id}:`, error);
        return null;
    }
}

/**
 * Menús: Lee primero desde archivos JSON estáticos (descargados en build-time).
 * Solo llama a WordPress como fallback si el archivo no existe o viene vacío.
 * Esto garantiza menús consistentes en Vercel serverless (sin caché compartida entre lambdas).
 */

// Mapa de archivos JSON por slug (cargados en build-time vía import() dinámico)
const MENU_JSON_FILES: Record<string, string> = {
    'menu-principal':    '/data/menus/menu-principal.json',
    'atencion-al-cliente': '/data/menus/atencion-al-cliente.json',
    'nosotros':          '/data/menus/nosotros.json',
    'legal':             '/data/menus/legal.json',
};

export async function getMenu(slug: string) {
    const cacheKey = `menu_${slug}`;
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    // ── FUENTE 1: Archivo JSON estático (build-time) ─────────────────────
    // Los archivos viven en public/data/menus/ y se sirven como assets estáticos.
    // En SSR/Vercel leemos desde fetch al propio origen (evita fs en edge).
    try {
        const filePath = MENU_JSON_FILES[slug];
        if (filePath) {
            // Intentamos leer el archivo JSON estático que fue creado en pre-build
            // via scripts/fetch-menus.mjs. En Vercel SSR usamos fetch al asset público.
            const vercelUrl = import.meta.env.VERCEL_URL;
            const siteUrl = import.meta.env.PUBLIC_SITE_URL;
            const origin = vercelUrl
                ? `https://${vercelUrl}`
                : (siteUrl || 'http://localhost:4321');
            
            const jsonUrl = `${origin}${filePath}`;
            
            const jsonRes = await fetch(jsonUrl, {
                signal: AbortSignal.timeout(5000),
                headers: { 'Accept': 'application/json' }
            });
            
            if (jsonRes.ok) {
                const jsonData = await jsonRes.json();
                const items = jsonData?.items;
                if (Array.isArray(items) && items.length > 0) {
                    console.log(`[Menu] ✅ Cargado desde JSON estático: "${slug}" (${items.length} items)`);
                    setStaticCached(cacheKey, items);
                    return items;
                }
            }
        }
    } catch (e: any) {
        console.warn(`[Menu] Archivo estático no disponible para "${slug}": ${e.message}`);
    }

    // ── FUENTE 2: WordPress REST API (fallback) ───────────────────────────
    const WP_USER = import.meta.env.WP_APP_USER || "";
    const WP_PASS = import.meta.env.WP_APP_PASS || "";
    const CK = (import.meta.env.WC_CONSUMER_KEY || import.meta.env.WP_CONSUMER_KEY || "").trim();
    const authString = (WP_USER && WP_PASS) 
        ? safeBtoa(`${WP_USER}:${WP_PASS}`)
        : null;

    async function fetchMenuData(targetSlug: string) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            
            const url = `${PUBLIC_WP_URL}/wp-json/wh/v1/menu/${targetSlug}`;
            console.log(`[Menu] ⚠️ Usando fallback WP API para "${targetSlug}"`);
            
            const reqHeaders: Record<string, string> = {
                'Accept': 'application/json'
            };
            if (authString) {
                reqHeaders['Authorization'] = `Basic ${authString}`;
            }

            const res = await fetch(url, {
                signal: controller.signal,
                headers: reqHeaders
            });
            clearTimeout(timeout);
            
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0) return data;
            }
        } catch (e: any) {
            console.warn(`[Menu] Intento fallido para slug "${targetSlug}":`, e.message);
        }
        return null; // si falla o viene vacío
    }

    try {
        // Intento 1: Slug original
        let menuItems = await fetchMenuData(slug);

        // Fallback para el menú principal si el primero falló
        if (!menuItems && slug === "menu-principal") {
            console.log("[Menu] Reintentando con slug alternativo 'principal'...");
            menuItems = await fetchMenuData("principal");
        }

        if (menuItems && Array.isArray(menuItems) && menuItems.length > 0) {
            setStaticCached(cacheKey, menuItems);
            return menuItems;
        }

        return [];
    } catch (error) {
        console.error(`[Menu] Error crítico al obtener menú "${slug}":`, error);
        return [];
    }
}

export async function getAttributes() {
    const cacheKey = "wc_attributes";
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const attributes = await wcFetch("/products/attributes");
        setStaticCached(cacheKey, attributes);
        return attributes;
    } catch (error) {
        console.error("Error fetching attributes:", error);
        return [];
    }
}

export async function getAttributeTerms(attributeId: number | string) {
    const cacheKey = `wc_attr_terms_${attributeId}`;
    const cached = getStaticCached(cacheKey);
    if (cached) return cached;

    try {
        const terms = await wcFetch(`/products/attributes/${attributeId}/terms?per_page=100`);
        setStaticCached(cacheKey, terms);
        return terms;
    } catch (error) {
        console.error(`Error fetching terms for attribute ${attributeId}:`, error);
        return [];
    }
}

/**
 * Fetch Home SEO tags using WordPress Page ID 83750
 */
export async function getHomeSEO() {
    try {
        const url = `${PUBLIC_WP_URL}/wp-json/wp/v2/pages/83750`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        
        if (res.ok) {
            const data = await res.json();
            // Retorna los datos estructurados tal cual los da RankMath para WP
            if (data.yoast_head_json || data.rank_math_seo) {
                return data.yoast_head_json || data.rank_math_seo;
            }
        }
    } catch (e) {
        console.warn("[WP API] Error fetching Home SEO from page 83750:", e);
    }
    return null;
}

