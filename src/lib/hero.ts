import { wcFetch, PUBLIC_WP_URL } from "./woocommerce";

/**
 * Obtiene las diapositivas del Banner Hero desde el CPT 'home_banner_hero'
 * El usuario ha expuesto una salida personalizada en 'banner_data'
 */
export async function getHeroSlides() {
    try {
        const data = await wcFetch('wp/v2/home_banner_hero?per_page=5');
        
        if (data && Array.isArray(data) && data.length > 0) {
            const heroPost = data[0];
            if (heroPost.banner_data) {
                return {
                    slides: heroPost.banner_data.slides || [],
                    slots: parseInt(heroPost.banner_data.slots) || 1
                };
            }
        }
    } catch (e) {
        console.warn("[Hero API] Error con wcFetch home_banner_hero:", e);
    }

    try {
        const publicRes = await fetch(`${PUBLIC_WP_URL}/wp-json/wp/v2/home_banner_hero?per_page=1`);
        if (publicRes.ok) {
            const data = await publicRes.json();
            if (data && Array.isArray(data) && data.length > 0) {
                const heroPost = data[0];
                if (heroPost.banner_data) {
                    return {
                        slides: heroPost.banner_data.slides || [],
                        slots: parseInt(heroPost.banner_data.slots) || 1
                    };
                }
            }
        }
    } catch (e) {}

    return { slides: [], slots: 0 };
}
