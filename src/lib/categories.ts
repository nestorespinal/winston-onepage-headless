import { wcFetch, PUBLIC_WP_URL } from "./woocommerce";

/**
 * Obtiene los datos de la sección de categorías del Home
 * CPT: 'home_categories_sec'
 */
export async function getHomeCategories() {
    try {
        const data = await wcFetch('wp/v2/home_categories_sec?per_page=1&_embed');
        
        if (data && Array.isArray(data) && data.length > 0) {
            const post = data[0];
            
            // Log the keys to debug
            console.log("[Categories API] Post found:", post.id);
            console.log("[Categories API] Available keys:", Object.keys(post));
            
            const secData = post.categories_section_data || {};
            const acf = post.acf || {};
            
            const title = secData.titulo || (typeof acf.titulo_de_la_seccion === 'string' ? acf.titulo_de_la_seccion : null) || post.title?.rendered;
            const subtitle = secData.subtitulo || (typeof acf.subtitulo_de_la_seccion === 'string' ? acf.subtitulo_de_la_seccion : null) || post.content?.rendered;
            
            let categories = [];
            // Prioritize secData.categories if it exists and is an array
            if (secData.categories && Array.isArray(secData.categories) && secData.categories.length > 0) {
                console.log("[Categories API] Using secData.categories");
                categories = secData.categories.map((c: any) => ({
                    id: c.id,
                    name: c.name,
                    slug: c.slug,
                    image: c.image || ""
                }));
            } else {
                console.log("[Categories API] Using ACF fallback");
                const rawCats = acf.categorias_y_fotos || [];
                categories = rawCats
                    .filter((item: any) => item.categoria)
                    .map((item: any) => {
                        const cat = item.categoria;
                        let imageUrl = "";
                        if (typeof item.imagen_personalizada === 'string') {
                            imageUrl = item.imagen_personalizada;
                        } else if (item.imagen_personalizada && typeof item.imagen_personalizada === 'object') {
                            imageUrl = item.imagen_personalizada.url || item.imagen_personalizada.source_url;
                        }
                        return {
                            id: cat?.term_id || 0,
                            name: cat?.name || "Sin Nombre",
                            slug: cat?.slug || "",
                            image: imageUrl || ""
                        };
                    });
            }

            console.log("[Categories API] Final categories count:", categories.length);

            return {
                title: title || "ROPA Y ZAPATOS PARA HOMBRE",
                subtitle: subtitle || "",
                categories: categories
            };
        } else {
            console.warn("[Categories API] No data returned from API");
        }
    } catch (e) {
        console.error("[Categories API] Error fetching home categories:", e);
    }

    // Bypass final: Intento directo si wcFetch falla o devuelve 0 categorías
    try {
        const res = await fetch(`${PUBLIC_WP_URL}/wp-json/wp/v2/home_categories_sec?per_page=1`);
        if (res.ok) {
            const raw = await res.json();
            if (raw && raw.length > 0) {
                const post = raw[0];
                const secData = post.categories_section_data || {};
                if (secData.categories) {
                    return {
                        title: secData.titulo || post.title?.rendered,
                        subtitle: secData.subtitulo || "",
                        categories: secData.categories.map((c: any) => ({
                            id: c.id,
                            name: c.name,
                            slug: c.slug,
                            image: c.image || ""
                        }))
                    };
                }
            }
        }
    } catch (err) {}

    return null;
}
