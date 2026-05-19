import { persistentMap } from '@nanostores/persistent';
import { atom } from 'nanostores';

export interface CartItem {
    id: number;
    name: string;
    price: number;
    color: string | null;
    size: string | null;
    quantity: number;
    image: string;
    slug: string;
    // Metadata for variable products
    attributes?: any[];
    variations?: any[];
}

export const cartItems = persistentMap<Record<string, string>>('wh_cart_v2', {});
export const isCartOpen = atom(false);
export const isSearchOpen = atom(false);

// Función de normalización para comparar slugs/nombres de forma robusta
function normalizeAttr(str: any): string {
    if (!str) return '';
    const s = String(str);
    return s.toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/[^a-z0-9]/g, '');      // Quitar todo lo que no sea alfanumérico
}

// Función auxiliar robusta para encontrar variaciones de WooCommerce
function findVariation(variations: any[], color: string | null, size: string | null): any | null {
    if (!variations || variations.length === 0) return null;
    
    const targetColor = normalizeAttr(color || '');
    const targetSize = normalizeAttr(size || '');

    console.log(`[Cart Store] Buscando variación para: color="${targetColor}", talla="${targetSize}"`);

    // Prioridad 1: Coincidencia exacta de ambos (si están presentes)
    const found = variations.find((v: any) => {
        const vColorAttr = v.attributes?.find((a: any) => {
            const name = String(a.name || '').toLowerCase();
            const id = String(a.id || '').toLowerCase();
            return name.includes('color') || id.includes('color') || name.includes('selecciona-el-color');
        });

        const vSizeAttr = v.attributes?.find((a: any) => {
            const name = String(a.name || '').toLowerCase();
            const id = String(a.id || '').toLowerCase();
            return name.includes('talla') || id.includes('talla') || 
                   name.includes('size') || id.includes('size') ||
                   name.includes('tamano') || name.includes('tamaño') ||
                   name.includes('numero') || name.includes('nmero') ||
                   name.includes('selecciona-una-talla');
        });

        const vColorValue = normalizeAttr(vColorAttr?.value || vColorAttr?.option || '');
        const vSizeValue = normalizeAttr(vSizeAttr?.value || vSizeAttr?.option || '');

        // Si la variación no tiene el atributo, lo tratamos como "cualquier" (any)
        const matchesColor = !color || !vColorValue || vColorValue === targetColor;
        const matchesSize = !size || !vSizeValue || vSizeValue === targetSize;

        return matchesColor && matchesSize;
    });

    if (found) {
        console.log(`[Cart Store] ✅ Variación encontrada: ${found.id}`);
    } else {
        console.warn(`[Cart Store] ❌ No se encontró variación para los atributos seleccionados.`);
    }

    return found;
}

export function addToCart(product: any, quantity: number, color: string | null, size: string | null, image: string) {
    try {
        const cart = cartItems.get();

        if (!product || !product.prices) {
            console.error('[Cart Store] Producto inválido:', product);
            return;
        }

        // Si es un producto variable, intentamos encontrar el ID de la variación específica
        let finalId = product.id;
        if (product.variations && product.variations.length > 0 && (color || size)) {
            const found = findVariation(product.variations, color, size);
            if (found) {
                finalId = found.id;
                console.log(`[Cart Store] Variación detectada: ${finalId} para ${color}/${size}`);
            } else {
                console.warn(`[Cart Store] No se encontró variación para ${color}/${size} en el producto ${product.id}`);
            }
        }

        const itemId = `${product.id}-${String(color || 'no-color').toLowerCase()}-${String(size || 'no-size').toLowerCase()}`;

        const rawPrice = product.prices.price || '0';
        const currencyMinorUnit = product.prices.currency_minor_unit || 0;
        const processedPrice = (typeof rawPrice === 'string' ? parseFloat(rawPrice) : rawPrice) / (10 ** currencyMinorUnit);

        if (cart[itemId]) {
            try {
                const item = JSON.parse(cart[itemId]) as CartItem;
                item.quantity += quantity;
                // Actualizamos el ID por si acaso
                item.id = finalId;
                cartItems.setKey(itemId, JSON.stringify(item));
            } catch (e) {
                const newItem = createCartItem(finalId, product, processedPrice, color, size, quantity, image);
                cartItems.setKey(itemId, JSON.stringify(newItem));
            }
        } else {
            const newItem = createCartItem(finalId, product, processedPrice, color, size, quantity, image);
            cartItems.setKey(itemId, JSON.stringify(newItem));
        }

        isCartOpen.set(true);

        // Disparar evento de Meta Pixel
        if (typeof window !== 'undefined' && typeof (window as any).fbq === 'function') {
            (window as any).fbq('track', 'AddToCart', {
                content_name: product.name,
                content_ids: [finalId.toString()],
                content_type: 'product',
                value: processedPrice * quantity,
                currency: product?.prices?.currency_code || 'COP'
            });
        }
    } catch (error) {
        console.error('[Cart Store] Error fatal en addToCart:', error);
    }
}

function createCartItem(id: number, product: any, price: number, color: string | null, size: string | null, quantity: number, image: string): CartItem {
    return {
        id,
        name: product.name,
        price,
        color,
        size,
        quantity,
        image,
        slug: product.slug,
        attributes: product.attributes,
        variations: product.variations
    };
}

export function removeFromCart(itemId: string) {
    cartItems.setKey(itemId, undefined as any);
}

export function updateQuantity(itemId: string, quantity: number) {
    if (quantity < 1) {
        removeFromCart(itemId);
        return;
    }
    const cart = cartItems.get();
    if (cart[itemId]) {
        try {
            const item = JSON.parse(cart[itemId]) as CartItem;
            item.quantity = quantity;
            cartItems.setKey(itemId, JSON.stringify(item));
        } catch(e) {}
    }
}

export function updateCartItemVariation(oldKey: string, newColor: string | null, newSize: string | null) {
    const cart = cartItems.get();
    if (!cart[oldKey]) return;

    try {
        const item = JSON.parse(cart[oldKey]) as CartItem;
        const baseProductId = oldKey.split('-')[0];
        const newKey = `${baseProductId}-${String(newColor || 'no-color').toLowerCase()}-${String(newSize || 'no-size').toLowerCase()}`;

        // Si la nueva combinación ya existe, sumamos las cantidades
        if (cart[newKey] && newKey !== oldKey) {
            const existingItem = JSON.parse(cart[newKey]) as CartItem;
            existingItem.quantity += item.quantity;
            cartItems.setKey(newKey, JSON.stringify(existingItem));
            cartItems.setKey(oldKey, undefined as any);
        } else {
            item.color = newColor;
            item.size = newSize;

            if (item.variations && item.variations.length > 0 && (newColor || newSize)) {
                const found = findVariation(item.variations, newColor, newSize);
                if (found) item.id = found.id;
            }

            if (newKey !== oldKey) {
                cartItems.setKey(oldKey, undefined as any);
            }
            cartItems.setKey(newKey, JSON.stringify(item));
        }
    } catch(e) {}
}

export function clearCart() {
    const keys = Object.keys(cartItems.get());
    keys.forEach(key => cartItems.setKey(key, undefined as any));
}

export function getCartTotal() {
    const cart = cartItems.get();
    return Object.values(cart).reduce((total, itemStr) => {
        try {
            const item = JSON.parse(itemStr) as CartItem;
            return total + (item.price * item.quantity);
        } catch(e) { return total; }
    }, 0);
}

export function getCartCount() {
    const cart = cartItems.get();
    return Object.values(cart).reduce((total, itemStr) => {
        try {
            const item = JSON.parse(itemStr) as CartItem;
            return total + item.quantity;
        } catch(e) { return total; }
    }, 0);
}
