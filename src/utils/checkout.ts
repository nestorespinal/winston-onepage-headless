import { cartItems } from '../store/cart';
import { PUBLIC_WP_URL } from '../lib/woocommerce';

/**
 * Redirecciona al usuario a una página de WordPress (WooCommerce) 
 * pasando todos los items actuales del carrito para sincronizar la sesión.
 * @param path - La ruta de destino (ej: '/checkout/' o '/cart/')
 */
export async function redirectToCheckout(path: string = '/', coupon: string = '') {
    const $cartItems = cartItems.get();
    const items = Object.values($cartItems).map(value => JSON.parse(value));

    // Dominio de WordPress donde está el WooCommerce real
    const wpDomain = PUBLIC_WP_URL;

    // Obtener token de sesión para autologin si existe
    const { userSession } = await import('../store/user');
    const token = userSession.get().token;

    if (path === '/cart/') {
        window.location.href = '/carrito';
        return;
    }

    if (items.length === 0) {
        let finalUrl = path;
        if (token) {
            const separator = finalUrl.includes('?') ? '&' : '?';
            finalUrl += `${separator}autologin=${token}`;
        }
        window.location.href = finalUrl;
        return;
    }

    // Generamos la cadena ID:QTY para el plugin bridge de WooCommerce
    // Usamos un Map para evitar IDs duplicados y consolidar cantidades
    const itemsMap = new Map<number, number>();
    items.forEach((item: any) => {
        if (item.id && item.id > 0) {
            const currentQty = itemsMap.get(item.id) || 0;
            itemsMap.set(item.id, currentQty + item.quantity);
        }
    });

    const itemsQuery = Array.from(itemsMap.entries())
        .map(([id, qty]) => `${id}:${qty}`)
        .join(',');

    // Redirección con el parámetro fill_cart que sincroniza el carrito en WP
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const baseUrl = `${wpDomain.replace(/\/$/, '')}${cleanPath}`;
    const separator = baseUrl.includes('?') ? '&' : '?';
    let finalUrl = `${baseUrl}${separator}fill_cart=${itemsQuery}`;

    // Añadir cupón si existe
    if (coupon) {
        finalUrl += `&coupon_code=${encodeURIComponent(coupon)}`;
    }

    // Añadir autologin si hay token
    if (token) {
        finalUrl += `&autologin=${token}`;
    }

    // Disparar evento de Meta Pixel: InitiateCheckout
    if (typeof window !== 'undefined' && typeof (window as any).fbq === 'function') {
        const cartValue = items.reduce((acc: number, item: any) => acc + (item.price * item.quantity), 0);
        const itemIds = items.map((item: any) => item.id.toString());
        
        (window as any).fbq('track', 'InitiateCheckout', {
            content_ids: itemIds,
            content_type: 'product',
            value: cartValue,
            currency: 'COP',
            num_items: items.reduce((acc: number, item: any) => acc + item.quantity, 0)
        });
    }

    window.location.href = finalUrl;
}
