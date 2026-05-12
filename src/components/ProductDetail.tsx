import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getOptimizedUrl, getImageSrcSet } from '../utils/image';
import ProductCard from './ProductCard';
import { addToCart } from '../store/cart';
import { redirectToCheckout } from '../utils/checkout';

// Función de normalización robusta para comparar slugs/nombres con acentos
function normalizeAttr(str: any): string {
  if (!str) return '';
  const s = String(str);
  return s.toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
    .replace(/\s+/g, '')             // Quitar espacios
    .replace(/[^a-z0-9]/g, '');      // Quitar todo lo no alfanumérico
}

interface Product {
  id: number;
  name: string;
  description: string;
  short_description: string;
  slug: string;
  permalink: string;
  prices: {
    price: string;
    regular_price: string;
    sale_price: string;
    price_range: any;
    currency_code: string;
    currency_symbol: string;
    currency_minor_unit: number;
    currency_prefix: string;
  };
  images: {
    id: number;
    src: string;
    alt: string;
    name: string;
  }[];
  attributes: {
    id: number;
    name: string;
    slug?: string;
    terms: { id: number; name: string; slug: string }[];
  }[];
  categories: { id: number; name: string; slug: string }[];
  variations?: {
    id: number;
    // WooCommerce v3 usa 'option', Store API puede usar 'value'. Aceptamos ambos.
    attributes: { name: string; value?: string; option?: string; id?: string }[];
    image?: { id: number; src: string; alt: string };
    stock_status?: string;
    manage_stock?: boolean;
    stock_quantity?: number | null;
    price?: string;
    regular_price?: string;
    sale_price?: string;
  }[];
  variation_images_map?: Record<string, any[]>;
  related_products?: any[];
  fbt_products?: any[];
  on_sale?: boolean;
  featured?: boolean;
  type?: string;
  stock_status?: string;
  manage_stock?: boolean;
  stock_quantity?: number | null;
}

interface Props {
  initialProduct: Product;
}

const SIZE_GUIDE_DATA = [
  ['37', '37', '6.5', '5', '39', '24.5'],
  ['38', '38', '7.5', '6', '41.5', '25.5'],
  ['39', '39', '8', '7', '41', '26'],
  ['40', '40', '9', '8', '42', '27'],
  ['41', '41', '9.5', '8.5', '42.5', '27.5'],
  ['42', '42', '10', '9', '43', '28'],
  ['43', '43', '11', '10', '44', '29'],
  ['44', '44', '12', '11', '45', '29.5'],
];

export default function ProductDetail({ initialProduct }: Props) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);
  const product = initialProduct;
  const [selectedFbtIds, setSelectedFbtIds] = useState<number[]>([]);
  const [fbtVariations, setFbtVariations] = useState<Record<number, { color: string | null, size: string | null, variationId?: number | null }>>({});
  const [failedSyntheticColors, setFailedSyntheticColors] = useState<string[]>([]);
  const [enrichedProduct, setEnrichedProduct] = useState<Product | null>(null);
  const [isFetchingVariations, setIsFetchingVariations] = useState(false);

  // Re-hidratar el producto con datos frescos si es un producto variable
  useEffect(() => {
    if (product.type !== 'variable' || enrichedProduct || isFetchingVariations) return;

    const fetchFullProduct = async () => {
      setIsFetchingVariations(true);
      try {
        const res = await fetch(`/api/products?slug=${product.slug}&t=${Date.now()}`);
        if (res.ok) {
          const fullData = await res.json();
          if (fullData && fullData.variations) {
            setEnrichedProduct(fullData);
          }
        }
      } catch (e) {
        console.error("[ProductDetail] Error fetching enriched data:", e);
      } finally {
        setIsFetchingVariations(false);
      }
    };

    fetchFullProduct();
  }, [product.slug, product.type]);

  const currentProduct = enrichedProduct || product;

  const handleFbtVariationChange = useCallback((productId: number, color: string | null, size: string | null, variationId?: number | null) => {
    // Sincronizar con el estado principal si es el mismo producto
    if (productId === product.id) {
      if (color) setSelectedColor(prev => (color !== prev) ? color : prev);
      if (size) setSelectedSize(prev => (size !== prev) ? size : prev);
    }

    setFbtVariations(prev => {
      const current = prev[productId];
      if (current?.color === color && current?.size === size && current?.variationId === variationId) return prev;

      return {
        ...prev,
        [productId]: { color, size, variationId }
      };
    });
  }, [product.id]);

  useEffect(() => {
    if (product.fbt_products) {
      setSelectedFbtIds([product.id, ...product.fbt_products.map((p: any) => p.id)]);
    } else {
      setSelectedFbtIds([product.id]);
    }
  }, [product.id, product.fbt_products]);

  const toggleFbtSelection = useCallback((id: number) => {
    setSelectedFbtIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const sizeAttribute = useMemo(() =>
    currentProduct.attributes?.find(attr =>
      attr.name.toLowerCase().includes('talla') ||
      attr.name.toLowerCase().includes('tamano') ||
      attr.name.toLowerCase().includes('tamaño') ||
      attr.name.toLowerCase().includes('size') ||
      attr.name.toLowerCase().includes('selecciona-una-talla') ||
      attr.terms.some(t => !isNaN(Number(t.name)))
    ), [currentProduct]);

  // Ordenar las tallas numéricamente o por orden de ropa (XS, S, M, L, XL, XXL)
  const sortedSizeTerms = useMemo(() => {
    if (!sizeAttribute) return [];

    const sizeOrder: Record<string, number> = {
      'xs': 1, 's': 2, 'm': 3, 'l': 4, 'xl': 5, 'xxl': 6, '2xl': 6, 'xxxl': 7, '3xl': 7
    };

    return [...sizeAttribute.terms].sort((a, b) => {
      const nameA = a.name.toLowerCase().trim();
      const nameB = b.name.toLowerCase().trim();

      if (sizeOrder[nameA] && sizeOrder[nameB]) return sizeOrder[nameA] - sizeOrder[nameB];

      const valA = parseFloat(nameA.replace(',', '.'));
      const valB = parseFloat(nameB.replace(',', '.'));

      if (!isNaN(valA) && !isNaN(valB)) return valA - valB;
      return nameA.localeCompare(nameB);
    });
  }, [sizeAttribute]);

  const hasSize = !!sizeAttribute;

  const colorAttribute = useMemo(() =>
    currentProduct.attributes?.find(attr =>
      attr.name.toLowerCase().includes('color') ||
      attr.name.toLowerCase().includes('selecciona-el-color') ||
      attr.slug?.includes('color')
    ), [currentProduct]);

  const currentSizeInfo = useMemo(() => {
    if (!selectedSize || !sizeAttribute) return null;
    const sizeName = sortedSizeTerms.find(t => t.slug === selectedSize)?.name;
    const found = SIZE_GUIDE_DATA.find(s => s[1] === sizeName);
    if (!found) return null;
    return {
      wh: found[1],
      us: found[2],
      eu: found[4],
      cm: found[5]
    };
  }, [selectedSize, sizeAttribute]);

  useEffect(() => {
    const favorites = JSON.parse(localStorage.getItem('wh_favorites') || '[]');
    setIsFavorite(favorites.some((fav: any) => fav.id === product.id));
  }, [product.id]);

  const toggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    const favorites = JSON.parse(localStorage.getItem('wh_favorites') || '[]');
    let newFavorites;

    if (isFavorite) {
      newFavorites = favorites.filter((fav: any) => fav.id !== product.id);
    } else {
      newFavorites = [...favorites, product];
    }

    localStorage.setItem('wh_favorites', JSON.stringify(newFavorites));
    setIsFavorite(!isFavorite);
    window.dispatchEvent(new Event('storage'));
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const colorParam = params.get('color');
    const tallaParam = params.get('talla');

    if (colorParam) setSelectedColor(colorParam);
    if (tallaParam) setSelectedSize(tallaParam);
  }, []);

  const colorSynonyms = useMemo(() => {
    if (!selectedColor) return [];
    const colorLower = normalizeAttr(selectedColor);
    const synonyms: Record<string, string[]> = {
      'negro': ['black', 'dark'],
      'blanco': ['white', 'light'],
      'azul': ['blue', 'navy', 'celeste', 'ocean'],
      'rojo': ['red'],
      'cafe': ['brown', 'marron', 'marrón', 'coffee', 'tan', 'camel', 'tabaco', 'tabac', 'cognac', 'chocolate'],
      'miel': ['tan', 'honey', 'camel', 'arena', 'sand'],
      'verde': ['green', 'oliva', 'olive'],
      'gris': ['grey', 'gray', 'plata', 'silver'],
      'vino': ['vinotinto', 'burgundy', 'wine', 'rojo', 'granate'],
      'vinotinto': ['vino', 'burgundy', 'wine', 'rojo', 'granate'],
      'beige': ['arena', 'sand', 'cream', 'crema', 'hueso'],
      'camel': ['tan', 'miel', 'cafe', 'brown', 'cognac'],
      'piel': ['cuero', 'leather', 'tan']
    };

    // El set original incluye el slug completo
    const results = new Set([colorLower]);

    // Intentar descomponer colores compuestos (ej: 'suede-tan' -> 'suede', 'tan')
    const parts = selectedColor.split(/[-_\s]+/).map(p => normalizeAttr(p)).filter(p => p.length > 2);
    parts.forEach(p => {
      results.add(p);
      if (synonyms[p]) synonyms[p].forEach(s => results.add(s));
    });

    if (synonyms[colorLower]) synonyms[colorLower].forEach(s => results.add(s));
    return Array.from(results).filter(s => s.length > 2);
  }, [selectedColor]);

  const mainCategory = useMemo(() => {
    if (!product.categories || product.categories.length === 0) return null;
    const cat = product.categories.find(c =>
      !c.name.includes('$') &&
      !c.name.toLowerCase().includes('regalo') &&
      !c.name.toLowerCase().includes('grande')
    );
    return cat;
  }, [product.categories]);

  const selectedVariation = useMemo(() => {
    const variations = currentProduct.variations;
    if (!variations || variations.length === 0) return null;
    if (!selectedColor && !selectedSize) return null;

    const targetColor = normalizeAttr(selectedColor);
    const targetSize = normalizeAttr(selectedSize);

    return variations.find((v: any) => {
      const vColorAttr = v.attributes?.find((a: any) => {
        const n = (a.name || "").toLowerCase();
        const sid = (a.id || "").toString().toLowerCase();
        return n.includes('color') || n.includes('pa_color') ||
          n.includes('selecciona-el-color') || sid.includes('color');
      });
      const vSizeAttr = v.attributes?.find((a: any) => {
        const n = (a.name || "").toLowerCase();
        const sid = (a.id || "").toString().toLowerCase();
        return n.includes('talla') || n.includes('size') || n.includes('tamano') ||
          n.includes('tamaño') || n.includes('pa_talla') ||
          n.includes('selecciona-una-talla') || sid.includes('talla') || sid.includes('size');
      });

      const vColorRaw = vColorAttr?.value || vColorAttr?.option || vColorAttr?.text || '';
      const vSizeRaw = vSizeAttr?.value || vSizeAttr?.option || vSizeAttr?.text || '';

      const vColor = normalizeAttr(vColorRaw);
      const vSize = normalizeAttr(vSizeRaw);

      // Match exacto o inteligente (fuzzy/synonyms)
      const matchesColor = !selectedColor || vColor === targetColor || vColorRaw === '' ||
        vColor.includes(targetColor) || targetColor.includes(vColor) ||
        (targetColor === 'vinotinto' && vColor === 'vino') ||
        (targetColor === 'vino' && vColor === 'vinotinto');

      const matchesSize = !selectedSize || vSize === targetSize || vSizeRaw === '';

      return matchesColor && matchesSize;
    });
  }, [currentProduct.variations, selectedColor, selectedSize]);


  /* Restaurando lógica de filtrado de imágenes por color */
  const filteredImages = useMemo(() => {
    // Si NO hay color seleccionado, mostrar todo
    if (!selectedColor) return currentProduct.images;

    const colorSlug = selectedColor.toLowerCase().trim();
    const colorTerm = colorAttribute?.terms.find(t => t.slug === selectedColor);
    const colorName = colorTerm?.name.toLowerCase().trim() || "";

    // --- 1. Obtener imágenes de la Variación (API + Mapas) ---
    let varImages: any[] = [];
    if (currentProduct.variation_images_map) {
      const colorSlugNormalized = normalizeAttr(selectedColor);
      const colorNameNormalized = normalizeAttr(colorName);
      const searchTerms = new Set([
        colorSlugNormalized,
        colorNameNormalized,
        ...colorSynonyms.map(s => normalizeAttr(s))
      ].filter(s => s && s.length > 2));

      Object.keys(currentProduct.variation_images_map).forEach(key => {
        const k = normalizeAttr(key);
        const isMatch = Array.from(searchTerms).some(term =>
          k === term || k.includes(term) || term.includes(k)
        );

        if (isMatch) {
          const imagesForKey = currentProduct.variation_images_map![key];
          if (imagesForKey && Array.isArray(imagesForKey)) {
            varImages = [...varImages, ...imagesForKey];
          }
        }
      });
    }

    const allColorTerms = colorAttribute?.terms.map(t => ({
      slug: t.slug,
      name: t.name,
      nSlug: normalizeAttr(t.slug),
      nName: normalizeAttr(t.name)
    })) || [];

    const galleryMatches = currentProduct.images.filter((img: { src: string; alt: string; name: string }) => {
      const src = (img.src || "").toLowerCase();
      const alt = (img.alt || "").toLowerCase();
      const name = (img.name || "").toLowerCase();

      const isMatch = (text: string, target: string) => {
        if (!target || target.length < 3) return false;
        const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(^|[-_\\s/])${escaped}([-_\\s.]|$)`, 'i');
        return regex.test(text);
      };

      // 1. Verificar si el término seleccionado hace match
      const selectedMatches = isMatch(src, colorSlug) || isMatch(alt, colorSlug) ||
        (colorName && (isMatch(src, colorName) || isMatch(alt, colorName))) ||
        colorSynonyms.some(s => isMatch(src, s) || isMatch(alt, s));

      if (!selectedMatches) return false;

      // 2. EXCLUSIÓN: Si el término seleccionado hace match, pero existe OTRO término del producto 
      // que es más largo/específico y TAMBIÉN hace match, descartamos esta imagen por ser de otro color.
      const hasBetterMatch = allColorTerms.some(term => {
        if (term.slug === selectedColor) return false;
        const termMatches = isMatch(src, term.slug) || isMatch(alt, term.slug) ||
          (term.name && (isMatch(src, term.name) || isMatch(alt, term.name)));

        if (termMatches) {
          return term.slug.length > colorSlug.length || (term.name && term.name.length > colorName.length);
        }
        return false;
      });

      return !hasBetterMatch;
    });

    // --- COMBINACIÓN FINAL ---
    const combined: any[] = [];

    // 1. PRIORIDAD MÁXIMA: Imagen principal de la variación seleccionada
    if (selectedVariation?.image?.src) {
      combined.push({
        id: selectedVariation.image.id,
        src: selectedVariation.image.src,
        alt: selectedVariation.image.alt || currentProduct.name
      });
    }

    // 2. PRIORIDAD MEDIA: Todas las fotos confirmadas de esa variante (Mapas + Galería)
    [...varImages, ...galleryMatches].forEach((img: any) => {
      if (!combined.some(c => c.src === img.src)) combined.push(img);
    });

    // 3. PRIORIDAD BAJA: Predicción Sintética (Solo si no hay NADA real)
    if (combined.length === 0 && currentProduct.images.length > 0 && colorAttribute && !failedSyntheticColors.includes(selectedColor)) {
      const baseImg = currentProduct.images[0];
      const baseSrc = baseImg.src;

      const getSynonyms = (c: string) => {
        const ns = normalizeAttr(c);
        const dict: Record<string, string[]> = {
          'negro': ['black', 'dark'],
          'blanco': ['white', 'light'],
          'azul': ['blue', 'navy', 'celeste', 'ocean'],
          'rojo': ['red'],
          'cafe': ['brown', 'marron', 'marrón', 'coffee', 'miel', 'tan', 'camel', 'tabaco', 'tabac', 'cognac', 'chocolate'],
          'miel': ['tan', 'honey', 'camel', 'arena', 'sand'],
          'verde': ['green', 'oliva', 'olive'],
          'gris': ['grey', 'gray', 'plata', 'silver'],
          'vino': ['vinotinto', 'burgundy', 'wine', 'rojo', 'granate'],
          'vinotinto': ['vino', 'burgundy', 'wine', 'rojo', 'granate'],
          'beige': ['arena', 'sand', 'cream', 'crema', 'hueso'],
          'camel': ['tan', 'miel', 'cafe', 'brown', 'cognac'],
          'piel': ['cuero', 'leather', 'tan']
        };
        return [ns, ...(dict[ns] || [])].filter(x => x.length > 2);
      };

      // Detectar qué color tiene la imagen base
      let colorInUrl = colorAttribute.terms.find((t: any) => {
        const targetSyns = getSynonyms(t.slug);
        const targetNames = getSynonyms(t.name);
        const s = normalizeAttr(baseSrc);
        return targetSyns.some(syn => s.includes(syn)) || targetNames.some(syn => s.includes(syn));
      });

      if (!colorInUrl) {
        for (const img of currentProduct.images) {
          const found = colorAttribute.terms.find((t: any) => {
            const targetSyns = getSynonyms(t.slug);
            const targetNames = getSynonyms(t.name);
            const s = normalizeAttr(img.src);
            return targetSyns.some(syn => s.includes(syn)) || targetNames.some(syn => s.includes(syn));
          });
          if (found) { colorInUrl = found; break; }
        }
      }

      if (colorInUrl) {
        const targetSyns = getSynonyms(colorInUrl.slug);
        const targetNames = getSynonyms(colorInUrl.name);
        let match = null;
        for (const syn of [...targetSyns, ...targetNames]) {
          const m = baseSrc.match(new RegExp(`[-_]${syn}`, 'i')) || baseSrc.match(new RegExp(syn, 'i'));
          if (m) { match = m; break; }
        }

        if (match) {
          const matchedText = match[0];
          const cleanMatchedText = matchedText.replace(/^[-_]/, '');
          const isCapitalized = cleanMatchedText[0] && cleanMatchedText[0] === cleanMatchedText[0].toUpperCase();

          let replacementCore = selectedColor;
          if (selectedColor === 'vinotinto' && cleanMatchedText.toLowerCase() === 'vino') {
            replacementCore = isCapitalized ? 'Vino' : 'vino';
          } else if (isCapitalized) {
            replacementCore = selectedColor.charAt(0).toUpperCase() + selectedColor.slice(1).toLowerCase();
          }
          const replacement = matchedText.replace(cleanMatchedText, replacementCore);

          try {
            const regex = new RegExp(matchedText, 'g');
            currentProduct.images.forEach((img: any) => {
              const newSrc = img.src.replace(regex, replacement);
              if (newSrc !== img.src) {
                combined.push({ ...img, id: -999 - img.id, isSynthetic: true, src: newSrc, alt: `${currentProduct.name} ${selectedColor}` });
              }
            });
            if (combined.length === 0) {
              const newSrc = baseSrc.replace(regex, replacement);
              if (newSrc !== baseSrc) combined.push({ ...baseImg, id: -999, isSynthetic: true, src: newSrc, alt: `${currentProduct.name} ${selectedColor}` });
            }
          } catch (e) { }
        }
      }
    }

    // 4. FALLBACK FINAL: Si el filtro de color no devolvió NADA (ni real ni sintético),
    // mostramos la foto principal del producto para no dejar la galería vacía.
    if (combined.length === 0 && currentProduct.images.length > 0) {
      return [currentProduct.images[0]];
    }

    return combined;
  }, [selectedColor, selectedVariation, currentProduct.images, currentProduct.variation_images_map, colorAttribute, failedSyntheticColors, currentProduct.name, colorSynonyms]);




  /* State for Lightbox Gallery */
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomPosition, setZoomPosition] = useState({ x: 50, y: 50 });
  const [verifiedGuessedImages, setVerifiedGuessedImages] = useState<string[]>([]);

  // Reset verified images when color changes
  useEffect(() => {
    setVerifiedGuessedImages([]);
  }, [selectedColor, product.name]);

  const handleGuessedImageLoad = (src: string) => {
    setVerifiedGuessedImages(prev => {
      if (prev.includes(src)) return prev;
      return [...prev, src];
    });
  };

  // Rango máximo de fotos adicionales que intentaremos adivinar de WooCommerce
  const GUESSED_PHOTO_RANGE = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  const galleryDOMImages = useMemo(() => {
    // Base images
    const images = filteredImages.map(img => ({ src: img.src, alt: img.alt || currentProduct.name }));

    // Append Verified Guessed images IN ORDER
    GUESSED_PHOTO_RANGE.forEach(num => {
      const match = verifiedGuessedImages.find(src => {
        const m = src.match(/[-_](\d+)(?:-e\d+)?\.(jpg|jpeg|png|webp)$/i);
        return m && parseInt(m[1], 10) === num;
      });

      if (match) {
        const exists = images.some(img => img.src === match);
        if (!exists) {
          images.push({ src: match, alt: `${currentProduct.name} vista ${num}` });
        }
      }
    });

    return images;
  }, [filteredImages, verifiedGuessedImages, currentProduct.name]);

  // Reset index when color changes
  useEffect(() => {
    setActiveImageIndex(0);
  }, [selectedColor]);

  // Función dinámica encargada de contar las fotos disponibles (WooCommerce + Cargadas)
  // Esta es la función que solicitaste para calcular dinámicamente cuántos puntos mostrar.
  const getGalleryCount = () => {
    return galleryDOMImages.length;
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
    document.body.style.overflow = 'hidden';
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setIsZoomed(false); // Reset zoom on close
    document.body.style.overflow = '';
  };

  const nextImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isZoomed) {
      setIsZoomed(false); // Reset zoom on slide change
    }
    setLightboxIndex((prev) => (prev + 1) % galleryDOMImages.length);
  };

  const prevImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isZoomed) {
      setIsZoomed(false); // Reset zoom on slide change
    }
    setLightboxIndex((prev) => (prev - 1 + galleryDOMImages.length) % galleryDOMImages.length);
  };

  const toggleZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsZoomed(!isZoomed);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isZoomed) return;
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setZoomPosition({ x, y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isZoomed) return;
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const x = ((touch.clientX - left) / width) * 100;
    const y = ((touch.clientY - top) / height) * 100;
    setZoomPosition({ x, y });
  };



  const galleryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveImageIndex(0);
    if (galleryRef.current) {
      galleryRef.current.scrollLeft = 0;
      galleryRef.current.scrollTop = 0; // Fix para desktop (scroll vertical)
    }
  }, [filteredImages]);

  const slideTo = (index: number) => {
    if (galleryRef.current) {
      const width = galleryRef.current.offsetWidth;
      galleryRef.current.scrollTo({
        left: index * width,
        behavior: 'smooth'
      });
      setActiveImageIndex(index);
    }
  };

  const nextSlide = () => {
    const nextIndex = (activeImageIndex + 1) % galleryDOMImages.length;
    slideTo(nextIndex);
  };

  const prevSlide = () => {
    const prevIndex = (activeImageIndex - 1 + galleryDOMImages.length) % galleryDOMImages.length;
    slideTo(prevIndex);
  };



  const isCombinationAvailable = (color: string | null, size: string | null) => {
    const variations = currentProduct.variations;
    if (!variations || variations.length === 0) {
      return currentProduct.stock_status !== 'outofstock';
    }

    const targetColor = normalizeAttr(color);
    const targetSize = normalizeAttr(size);

    return variations.some(variation => {
      const vColorAttr = variation.attributes.find(a => {
        const n = (a.name || "").toLowerCase();
        const sid = (a.id || "").toString().toLowerCase();
        return n.includes('color') || n.includes('pa_color') ||
          n.includes('selecciona-el-color') || sid.includes('color');
      });
      const vSizeAttr = variation.attributes.find(a => {
        const n = (a.name || "").toLowerCase();
        const sid = (a.id || "").toString().toLowerCase();
        return n.includes('talla') || n.includes('size') || n.includes('tamano') ||
          n.includes('tamaño') || n.includes('pa_talla') ||
          n.includes('selecciona-una-talla') || sid.includes('talla') || sid.includes('size');
      });

      const vColorRaw = vColorAttr?.value || vColorAttr?.option || '';
      const vSizeRaw = vSizeAttr?.value || vSizeAttr?.option || '';

      const vColor = normalizeAttr(vColorRaw);
      const vSize = normalizeAttr(vSizeRaw);

      // Si la variación tiene el atributo vacío, significa que aplica a "Cualquiera"
      const matchesColor = !color || vColor === targetColor || vColorRaw === '';
      const matchesSize = !size || vSize === targetSize || vSizeRaw === '';

      // Crucial: También verificar stock_status de la variación
      // Aceptamos 'instock' o si tiene cantidad positiva si manage_stock es true
      const isVariationInStock = variation.stock_status === 'instock' ||
        (variation.manage_stock && variation.stock_quantity && variation.stock_quantity > 0);

      return matchesColor && matchesSize && isVariationInStock;
    });
  };

  useEffect(() => {
    if (selectedVariation) {
      console.log("[ProductDetail] Variation Selected:", {
        id: selectedVariation.id,
        price: selectedVariation.price,
        reg: selectedVariation.regular_price,
        attrs: selectedVariation.attributes
      });
    }
  }, [selectedVariation]);

  const isOutOfStock = useMemo(() => {
    if (product.type === 'simple') {
      return product.stock_status === 'outofstock';
    }
    if (product.type === 'variable') {
      // Si no hay variación seleccionada todavía, solo es outofstock si TODAS las variaciones lo están
      if (!selectedColor || (hasSize && !selectedSize)) {
        return product.variations?.every((v: any) => v.stock_status === 'outofstock') || false;
      }
      return selectedVariation?.stock_status === 'outofstock';
    }
    return product.stock_status === 'outofstock';
  }, [product, selectedVariation, selectedColor, selectedSize, hasSize]);

  const formatPrice = (price: string | number | undefined) => {
    if (price === undefined || price === null) return "$ 0";
    const pStr = price.toString();
    const pInt = parseInt(pStr.replace(/[^0-9]/g, ''));
    if (isNaN(pInt)) return "$ 0";

    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: product.prices.currency_code,
      minimumFractionDigits: 0
    }).format(pInt / (10 ** product.prices.currency_minor_unit));
  };

  const isSelectionComplete = selectedColor && (!hasSize || selectedSize);

  const handleAddToCart = () => {
    if (product.type === 'variable' || (currentProduct.variations && currentProduct.variations.length > 0)) {
      if (!selectedColor) {
        alert('Por favor, selecciona un color.');
        return false;
      }
      if (hasSize && !selectedSize) {
        alert('Por favor, selecciona una talla.');
        return false;
      }
    }

    // Usar la variación ya encontrada por selectVariation
    let productIdToCart = product.id;
    if (selectedVariation) {
      productIdToCart = selectedVariation.id;
      console.log('[Cart Debug] ✅ Usando variación seleccionada:', productIdToCart);
    } else if (product.type === 'variable') {
      console.warn('[Cart Debug] ❌ No se encontró variación para:', { selectedColor, selectedSize });
      alert('No se pudo identificar la variación exacta. Por favor, intenta de nuevo.');
      return false;
    }

    addToCart(
      { ...currentProduct, id: productIdToCart },
      quantity,
      selectedColor,
      selectedSize,
      filteredImages[0]?.src || product.images[0]?.src
    );

    // GA4 + Meta add_to_cart
    const price = parseFloat(String(currentProduct?.prices?.price || currentProduct?.price || '0')) || 0;
    if (typeof window !== 'undefined') {
      if (typeof (window as any).gtag === 'function') {
        (window as any).gtag('event', 'add_to_cart', {
          currency: 'COP', value: price,
          items: [{ item_id: String(currentProduct.id), item_name: currentProduct.name, price, quantity: 1 }]
        });
      }
      if (typeof (window as any).fbq === 'function') {
        (window as any).fbq('track', 'AddToCart', {
          content_ids: [String(currentProduct.id)], content_type: 'product', value: price, currency: 'COP'
        });
      }
    }

    return true;
  };

  const handleAddBothToCart = () => {
    // 1. Añadir el producto principal (usando la misma lógica de handleAddToCart)
    if (selectedFbtIds.includes(product.id)) {
      let mainProductId = product.id;
      if (selectedVariation) {
        mainProductId = selectedVariation.id;
      }
      addToCart({ ...currentProduct, id: mainProductId }, 1, selectedColor, selectedSize, filteredImages[0]?.src || product.images[0]?.src);
    }

    // 2. Añadir productos FBT (ya usan variationId de ProductCard)
    if (product.fbt_products) {
      for (const p of product.fbt_products) {
        if (selectedFbtIds.includes(p.id)) {
          const pVar = fbtVariations[p.id];
          const finalId = pVar?.variationId || p.id;
          addToCart({ ...p, id: finalId }, 1, pVar?.color || null, pVar?.size || null, p.images[0]?.src);
        }
      }
    }
  };


  const fbtTotalPrice = useMemo(() => {
    let total = 0;
    if (selectedFbtIds.includes(product.id)) {
      total += parseInt(product.prices.price);
    }
    if (product.fbt_products) {
      product.fbt_products.forEach((p) => {
        if (selectedFbtIds.includes(p.id)) {
          total += parseInt(p.prices.price);
        }
      });
    }
    return total;
  }, [product, product.fbt_products, selectedFbtIds]);

  // Se elimina toggleFbtStatus ya que usaremos ProductCard directamente
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollLeft = e.currentTarget.scrollLeft;
    const width = e.currentTarget.offsetWidth;
    const newIndex = Math.round(scrollLeft / width);
    if (newIndex !== activeImageIndex) setActiveImageIndex(newIndex);
  };

  return (
    <div className="product-detail">
      <div className="product-detail-split">
        <div className="product-gallery-container" id="main-gallery">
          <div className="product-gallery" onScroll={handleScroll} ref={galleryRef}>
            {/* 1. Main Carousel: Renders confirmed images from filteredImages */}
            {filteredImages.map((img, index) => (
              <div key={img.id || index} className="gallery-item">
                <picture>
                  <img
                    src={getOptimizedUrl(img.src, { width: 1200 })}
                    srcSet={getImageSrcSet(img.src, [600, 900, 1200])}
                    sizes="(max-width: 768px) 100vw, 50vw"
                    alt={img.alt || product.name}
                    className="reveal-on-scroll is-visible cursor-zoom"
                    loading={index === 0 ? "eager" : "lazy"}
                    decoding={index === 0 ? "sync" : "async"}
                    onClick={() => openLightbox(index)}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.onerror = null;
                      const currentSrc = target.getAttribute('src') || '';

                      // Si falló el optimizado, intentar con el original
                      if (currentSrc.includes('/_image')) {
                        target.src = img.src;
                        target.removeAttribute('srcset');
                        return;
                      }

                      // 1. Si es .webp, quitar .webp para volver al formato original (ej: .jpg.webp → .jpg)
                      if (currentSrc.toLowerCase().endsWith('.webp')) {
                        const originalSrc = currentSrc.replace(/\.webp$/i, '');
                        target.onerror = () => {
                          target.onerror = null;
                          target.src = 'https://via.placeholder.com/1200x1200?text=Winston+%26+Harry';
                        };
                        target.src = originalSrc;
                        return;
                      }

                      // 2. Limpiar sufijo de edición WordPress (-e123...)
                      const cleanSrc = currentSrc.replace(/-e\d+(?=\.(jpg|jpeg|png))/i, '');
                      if (cleanSrc !== currentSrc) {
                        target.src = cleanSrc;
                        return;
                      }

                      // 2.5 Si es una imagen sintética (predicha), marcar como fallida
                      if ((img as any).isSynthetic && selectedColor) {
                        setFailedSyntheticColors(prev => [...prev, selectedColor]);
                        target.src = product.images[0]?.src || '';
                        return;
                      }

                      // 3. Último recurso: placeholder
                      target.src = 'https://via.placeholder.com/1200x1200?text=Winston+%26+Harry';
                    }}
                  />
                </picture>
              </div>
            ))}

            {/* Smart Gallery Expansion: Intentamos completar la galería dinámicamente */}
            {GUESSED_PHOTO_RANGE.map(num => {
              const firstImg = filteredImages[0];
              if (!firstImg?.src) return null;

              // 2. Intento de adivinar el nombre de la foto (WooCommerce suele usar sufijos numéricos)
              const match1 = firstImg.src.match(/([-_])1(?:-e\d+)?(\.(?:jpg|jpeg|png|webp))$/i);
              let guessedSrc = "";

              if (match1) {
                // Si la primera imagen termina en -1, reemplazamos por -num
                guessedSrc = firstImg.src.replace(/([-_])1(?:-e\d+)?(\.(?:jpg|jpeg|png|webp))$/i, `$1${num}$2`);
              } else {
                // Si no tiene el sufijo -1, intentamos inyectar el número antes de la extensión (ej: camisa.jpg -> camisa-2.jpg)
                guessedSrc = firstImg.src.replace(/(\.(?:jpg|jpeg|png|webp))$/i, `-${num}$1`);
              }

              // Evitamos duplicados si la imagen ya está en las iniciales de WooCommerce
              const alreadyExists = filteredImages.some(img => img.src && (img.src === guessedSrc || img.src.includes(guessedSrc.split('/').pop() || '')));
              if (alreadyExists) return null;

              return (
                <div key={`guessed-${num}`} className="gallery-item">
                  <picture>
                    <img
                      src={getOptimizedUrl(guessedSrc, { width: 1200 })}
                      srcSet={getImageSrcSet(guessedSrc, [600, 900, 1200])}
                      sizes="(max-width: 768px) 100vw, 50vw"
                      alt={`${product.name} vista ${num}`}
                      className="reveal-on-scroll is-visible cursor-zoom"
                      loading="lazy"
                      decoding="async"
                      onClick={() => {
                        const verifiedIndex = verifiedGuessedImages.indexOf(guessedSrc);
                        if (verifiedIndex !== -1) {
                          openLightbox(filteredImages.length + verifiedIndex);
                        }
                      }}
                      onLoad={() => handleGuessedImageLoad(guessedSrc)}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        const currentSrc = target.getAttribute('src') || '';

                        // Si falló el optimizado, intentar con el original (para que onLoad/onError funcione)
                        if (currentSrc.includes('/_image')) {
                          target.src = guessedSrc;
                          target.removeAttribute('srcset');
                          return;
                        }

                        // Si la foto no existe en WooCommerce, ocultamos este slide
                        const container = target.closest('.gallery-item') as HTMLElement;
                        if (container) container.style.display = 'none';
                      }}
                    />
                  </picture>
                </div>
              );
            })}
          </div>

          {getGalleryCount() > 1 && (
            <div className="gallery-dots">
              {Array.from({ length: getGalleryCount() }).map((_, i) => (
                <button
                  key={`dot-${i}`}
                  className={`dot ${i === activeImageIndex ? 'active' : ''}`}
                  onClick={() => slideTo(i)}
                  aria-label={`Ir a imagen ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="product-info-sidebar">
          <div className="sidebar-inner">
            <div className="sidebar-content">
              <div className="breadcrumb-wrapper">
                <div className="product-breadcrumbs">
                  <a href="/">Inicio</a>
                  <span className="separator">/</span>
                  {mainCategory && (
                    <>
                      <a href={`/categoria/${mainCategory.slug}`}>{mainCategory.name}</a>
                      <span className="separator">/</span>
                    </>
                  )}
                  <span className="current">{product.name}</span>
                </div>
                <button
                  className={`detail-favorite-btn ${isFavorite ? 'active' : ''}`}
                  onClick={toggleFavorite}
                  aria-label={isFavorite ? "Eliminar de favoritos" : "Añadir a favoritos"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill={isFavorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                </button>
              </div>


              <div className="product-title-row">
                <h1 className="product-title">{product.name}</h1>
                <div className="detail-badges">
                  {product.featured && <span className="badge hot-badge">HOT</span>}
                  {product.on_sale && Number(product.prices.regular_price || 0) > Number(product.prices.price || 0) && (
                    <span className="badge discount-badge">
                      -{Math.round(((Number(product.prices.regular_price) - Number(product.prices.price)) / Number(product.prices.regular_price)) * 100)}%
                    </span>
                  )}
                </div>
              </div>

              <div className="product-price-container">
                {selectedVariation ? (
                  <div className="price-wrapper">
                    {Number(selectedVariation.regular_price || 0) > Number(selectedVariation.price || 0) && (
                      <span className="old-price">{formatPrice(selectedVariation.regular_price)}</span>
                    )}
                    <span className="sale-price highlight">
                      {selectedVariation.price && Number(selectedVariation.price) > 0
                        ? formatPrice(selectedVariation.price)
                        : formatPrice(product.prices.price)}
                    </span>
                  </div>
                ) : product.on_sale ? (
                  <div className="price-wrapper">
                    {Number(product.prices.regular_price || 0) > Number(product.prices.price || 0) && (
                      <span className="old-price">{formatPrice(product.prices.regular_price)}</span>
                    )}
                    <span className="sale-price highlight">{formatPrice(product.prices.price)}</span>
                  </div>
                ) : (
                  <p className="product-price">{formatPrice(product.prices.price)}</p>
                )}
              </div>

              <div className="product-short-description" dangerouslySetInnerHTML={{ __html: product.short_description }} />

              <div className="product-selectors">
                {colorAttribute && (() => {
                  const terms = colorAttribute.terms;
                  if (terms.length === 0) return null;

                  return (
                    <div className="selector-group">
                      <label>Color: <strong>{colorAttribute.terms.find(t => normalizeAttr(t.slug) === normalizeAttr(selectedColor) || normalizeAttr(t.name) === normalizeAttr(selectedColor))?.name || ''}</strong></label>
                      <div className="color-options">
                        {terms.map((term: any) => {
                          const isAvailable = isCombinationAvailable(term.slug, null);
                          const isSelected = selectedColor && normalizeAttr(selectedColor) === normalizeAttr(term.slug);
                          return (
                            <button
                              key={term.id}
                              className={`color-dot-btn ${isSelected ? 'active' : ''} ${!isAvailable ? 'out-of-stock' : ''}`}
                              onClick={() => setSelectedColor(term.slug)}
                            >
                              <span className="color-dot" style={{ backgroundColor: getColorCode(term.slug) }}></span>
                              {!isAvailable && <span className="x-mark">✕</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {hasSize && (
                  <div className="selector-group">
                    <div className="label-row-between">
                      <label>Talla: <strong>{sizeAttribute?.terms.find(t => normalizeAttr(t.slug) === normalizeAttr(selectedSize) || normalizeAttr(t.name) === normalizeAttr(selectedSize))?.name || ''}</strong></label>
                      <button className="size-guide-dark" onClick={() => setShowSizeGuide(true)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"></path>
                          <path d="m14.5 12.5 2-2"></path>
                          <path d="m11.5 9.5 2-2"></path>
                          <path d="m8.5 6.5 2-2"></path>
                          <path d="m17.5 15.5 2-2"></path>
                        </svg>
                        <span>GUÍA DE TALLAS</span>
                      </button>
                    </div>
                    <div className="size-options">
                      {sortedSizeTerms.map((term) => {
                        const isAvailable = isCombinationAvailable(selectedColor, term.slug);
                        const isSelected = selectedSize && normalizeAttr(selectedSize) === normalizeAttr(term.slug);
                        return (
                          <button
                            key={term.id}
                            className={`size-box-btn ${isSelected ? 'active' : ''} ${!isAvailable ? 'out-of-stock' : ''}`}
                            onClick={() => isAvailable && setSelectedSize(term.slug)}
                          >
                            {term.name}
                            {!isAvailable && <span className="x-mark" style={{ fontSize: '12px' }}>✕</span>}
                          </button>
                        );
                      })}
                    </div>
                    {currentSizeInfo && (
                      <div className="selected-size-info-box">
                        <p>
                          El tamaño etiquetado en el artículo es <strong>{currentSizeInfo.wh}</strong>, igual que <strong>US {currentSizeInfo.us}</strong> y <strong>EU {currentSizeInfo.eu}</strong>
                          <span className="size-length-detail"> (Largo del pie: <strong>{currentSizeInfo.cm} cm</strong>)</span>.
                        </p>
                      </div>
                    )}
                    <div className="size-help-link">
                      <span>¿No encuentras tu talla? </span>
                      <a href="https://wa.me/573100000000" target="_blank" rel="noopener noreferrer">Te ayudamos</a>
                    </div>
                  </div>
                )}
              </div>

              <div className="product-purchase-row">
                <div className="quantity-selector-container">
                  <label>Cantidad:</label>
                  <div className="quantity-controls">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
                    <span>{quantity}</span>
                    <button onClick={() => setQuantity(quantity + 1)}>+</button>
                  </div>
                </div>

                <div className="product-actions-grid">
                  <button
                    className={`btn-action btn-fill ${isOutOfStock ? 'disabled' : ''}`}
                    onClick={handleAddToCart}
                    disabled={isOutOfStock}
                  >
                    {isOutOfStock ? 'Producto Agotado' :
                      (!selectedColor || (hasSize && !selectedSize)) ? 'Selecciona Opciones' :
                        'Añadir al Carrito'}
                  </button>
                  <button
                    className={`btn-action btn-outline-thick ${isOutOfStock ? 'disabled' : ''}`}
                    onClick={() => {
                      if (!isOutOfStock && handleAddToCart()) {
                        // After adding, redirect using our unified utility
                        redirectToCheckout('/checkout/');
                      }
                    }}
                    disabled={isOutOfStock}
                  >
                    {isOutOfStock ? 'Sin Stock' :
                      (!selectedColor || (hasSize && !selectedSize)) ? 'Selecciona Opciones' :
                        'Comprar Ahora'}
                  </button>
                </div>
              </div>

              <div className="addi-container">
                <div className="addi-content">
                  <img src="https://framerusercontent.com/images/z1k7Q8vHsCRiRHF6UqTSfumiSHU.svg" alt="Addi" className="addi-icon" />
                  <span className="addi-text">
                    Paga con <span className="addi-brand">Addi</span> en <strong>hasta 6 cuotas</strong>.
                    <a href="https://co.addi.com/" target="_blank" rel="noopener noreferrer" className="addi-link">Pide un cupo</a>
                  </span>
                </div>
              </div>

              <div className="product-details-dropdowns">
                <details open>
                  <summary>Descripción y Detalles</summary>
                  <div className="dropdown-inner" dangerouslySetInnerHTML={{ __html: product.description }} />
                </details>
                <details>
                  <summary>Información adicional</summary>
                  <div className="dropdown-inner">
                    <div className="additional-info-container">
                      {product.attributes && product.attributes.length > 0 ? (
                        product.attributes.map((attr) => {
                          let displayName = attr.name;
                          if (displayName.toLowerCase().includes('selecciona el color')) displayName = 'Color';
                          if (displayName.toLowerCase().includes('selecciona una talla')) displayName = 'Tallas';

                          return (
                            <div key={attr.id} className="additional-info-row">
                              <span className="info-label">{displayName}</span>
                              <span className="info-value">
                                {attr.terms.map(t => t.name).join(' , ')}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <p className="no-info">No hay información adicional disponible.</p>
                      )}
                    </div>
                  </div>
                </details>
                <details>
                  <summary>Envío y Cambios</summary>
                  <div className="dropdown-inner">
                    <p>Entrega estándar gratuita en todos los pedidos. Cambios disponibles dentro de los 15 días.</p>
                  </div>
                </details>
              </div>
              <div className="store-locator-container">
                <a href="#" className="store-locator-link">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  Clic AQUÍ para buscar una tienda cerca de ti
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SECCIÓN COMPRADOS JUNTOS HABITUALMENTE (Uso de ProductCard para consistencia) */}
      {product.fbt_products && product.fbt_products.length > 0 && (
        <section className="fbt-new-section">
          <div className="fbt-fullwidth-container">
            <h2 className="fbt-title-premium">Combínalo con:</h2>
            <div className="fbt-bundle-grid">
              <div className="fbt-visual-row">
                <div className="fbt-bundle-step">
                  <div className="fbt-card-isla">
                    <ProductCard
                      product={product}
                      isSelected={selectedFbtIds.includes(product.id)}
                      onSelectionToggle={toggleFbtSelection}
                      onVariationChange={handleFbtVariationChange}
                      initialColor={selectedColor}
                      initialSize={selectedSize}
                    />
                  </div>
                </div>

                {product.fbt_products.map((p, idx) => (
                  <div key={p.id} className="fbt-bundle-step">
                    <span className="fbt-math-plus">+</span>
                    <div className="fbt-card-isla">
                      <ProductCard
                        product={p}
                        isSelected={selectedFbtIds.includes(p.id)}
                        onSelectionToggle={toggleFbtSelection}
                        onVariationChange={handleFbtVariationChange}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="fbt-action-card">
                <div className="fbt-total-row">
                  <span className="label">Total por los seleccionados:</span>
                  <span className="value">{formatPrice(fbtTotalPrice.toString())}</span>
                </div>
                <button
                  className="fbt-submit-btn"
                  onClick={handleAddBothToCart}
                >
                  Añadir seleccionados al carrito
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECCIÓN COMPLETA TU LOOK (Premium Related Products) */}
      {product.related_products && product.related_products.length > 0 && (
        <section className="related-products-section">
          <div className="related-section-header">
            <h2 className="fbt-title-premium">COMPLETA TU LOOK</h2>
          </div>
          <div className="related-grid">
            {product.related_products.map((item: any) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}

      {lightboxOpen && (
        <div className="lightbox-overlay" onClick={closeLightbox}>
          <button className="lightbox-close" onClick={closeLightbox}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>

          <button className="lightbox-nav prev" onClick={prevImage}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
          </button>

          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <div
              className="lightbox-slider"
              style={{ transform: `translateX(-${lightboxIndex * 100}%)` }}
            >
              {galleryDOMImages.map((img, i) => (
                <div key={i} className="lightbox-slide">
                  <div className="lightbox-image-wrapper" onMouseMove={handleMouseMove} onTouchMove={handleTouchMove}>
                    <img
                      src={img.src}
                      alt={img.alt}
                      className={`lightbox-img ${isZoomed && lightboxIndex === i ? 'zoomed' : ''}`}
                      style={isZoomed && lightboxIndex === i ? { transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`, transform: 'scale(2)' } : {}}
                      onDragStart={(e) => e.preventDefault()}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button className="lightbox-nav next" onClick={nextImage}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </button>

          <button className="lightbox-zoom-indicator" onClick={toggleZoom}>
            {isZoomed ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M8 11h6" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6" /><path d="M8 11h6" /></svg>
            )}
          </button>
        </div>
      )}

      {showSizeGuide && (
        <div className="size-guide-modal-overlay" onClick={() => setShowSizeGuide(false)}>
          <div className="size-guide-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSizeGuide(false)}>✕</button>
            <h2>Guía de Tallas</h2>
            <div className="table-responsive">
              <table className="size-guide-table">
                <thead>
                  <tr>
                    <th>COLOMBIA</th>
                    <th>WINSTON & HARRY</th>
                    <th>US</th>
                    <th>UK</th>
                    <th>EUROPA</th>
                    <th>PIE (CM)</th>
                  </tr>
                </thead>
                <tbody>
                  {SIZE_GUIDE_DATA.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => <td key={j}>{cell}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .product-detail { background: #fff; width: 100%; }

        .product-breadcrumbs {
            margin-bottom: 2rem;
            font-size: 0.8rem;
            color: #777;
            font-family: var(--font-paragraphs);
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
            margin-bottom: 0;
        }
        .breadcrumb-wrapper {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0rem;
            gap: 1rem;
        }
        .detail-favorite-btn {
            background: none;
            border: none;
            cursor: pointer;
            padding: 8px;
            color: #999;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .detail-favorite-btn:hover {
            color: #d62828;
            transform: scale(1.1);
        }
        .detail-favorite-btn.active {
            color: #d62828;
        }
        .product-breadcrumbs a {
            color: #708090;
            transition: color 0.2s;
        }
        .product-breadcrumbs a:hover {
            color: var(--color-beige);
        }
        .product-breadcrumbs .separator {
            color: #ddd;
        }
        .product-breadcrumbs .current {
            color: #121212;
            font-weight: 500;
        }

        .product-detail-split { display: flex; flex-direction: row; align-items: stretch; }
        .product-gallery-container { width: 50%; position: relative; }
        .product-gallery { display: flex; flex-direction: column; background: #f8f8f8; }
        .gallery-item img { width: 100%; height: auto; display: block; object-fit: cover; }
        .gallery-nav { display: none; }

        .gallery-dots {
            display: none;
            justify-content: center;
            gap: 8px;
            position: absolute;
            bottom: 20px;
            left: 0;
            right: 0;
            z-index: 50;
            pointer-events: none;
        }
        .dot {
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.5);
            padding: 0;
            cursor: pointer;
            transition: all 0.3s;
            pointer-events: auto;
        }
        .dot.active { background: #000; transform: scale(1); border-color: #000; }

        .product-info-sidebar { width: 50%; background: #fff; position: relative; }

        .sidebar-inner { padding: 2rem 10% 5rem; height: 100%; }
        .sidebar-content {
            position: sticky;
            top: 20px;
            max-height: calc(100vh - 40px);
            overflow-y: auto;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE/Edge */
            padding-right: 5px; /* Prevent content jump */
        }
        .sidebar-content::-webkit-scrollbar { display: none; }
        .product-category { display: block; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-bottom: 0rem; }
        .product-title-row {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 0.5rem;
            flex-wrap: wrap;
        }

        .product-title { 
            font-family: var(--font-products); 
            font-size: 1.25rem; 
            color: #000; 
            margin: 0; 
            text-transform: uppercase; 
            letter-spacing: 1.5px; 
            font-weight: 500; 
        }

        .detail-badges {
            display: flex;
            gap: 8px;
        }

        .product-price-container {
            margin-bottom: 1rem;
        }

        .price-wrapper {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .old-price {
            text-decoration: line-through;
            color: #b5b5b5;
            font-size: 1.2rem;
            font-weight: 300;
        }

        .sale-price.highlight {
            color: #A98B68;
            font-weight: 500;
            font-size: 1.8rem;
        }

        .product-price { 
            font-size: 1.8rem; 
            color: #A98B68; 
            margin: 0; 
            font-weight: 400;
        }

        .badge {
            font-size: 0.65rem;
            font-weight: 700;
            padding: 4px 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            border-radius: 2px;
            color: #fff;
        }

        .hot-badge { background-color: #E63946; }
        .discount-badge { background-color: #A98B68; }

        .product-purchase-row {
            display: flex;
            align-items: flex-end;
            gap: 1rem;
            margin: 1rem 0 0rem;
        }
        .quantity-selector-container {
            display: flex;
            align-items: center;
            gap: 0.8rem;
        }
        .quantity-selector-container label {
            font-size: 0.65rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #888;
            white-space: nowrap;
        }
        .quantity-controls {
            display: flex;
            align-items: center;
            border: 1px solid #eee;
            border-radius: 2px;
            overflow: hidden;
            background: #fff;
        }
        .quantity-controls button {
            background: none;
            border: none;
            width: 32px;
            height: 32px;
            cursor: pointer;
            font-size: 1.1rem;
            color: #121212;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        .quantity-controls button:hover {
            background: #f9f9f9;
        }
        .quantity-controls span {
            width: 40px;
            text-align: center;
            font-size: 0.9rem;
            font-weight: 600;
        }

        .product-actions-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          flex: 1;
        }
        .btn-action { padding: 0.8rem 0.5rem; font-size: 0.66rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; transition: all 0.3s; border-radius: 2px; font-family: var(--font-paragraphs); border: 1.5px solid var(--color-green); }
        .btn-fill { background-color: var(--color-green); color: #fff; }
        .btn-outline-thick { background-color: #fff; color: var(--color-green); border: 1px solid var(--color-green) !important; }
        .btn-action:hover:not(.disabled) { opacity: 0.8; transform: translateY(-2px); }
        .btn-action.disabled { background-color: #eee; border-color: #eee; color: #999; cursor: not-allowed; }
        .product-short-description { font-size: 0.85rem; color: #555; line-height: 1.7; margin-bottom: 0.5rem; }
        .selector-group { margin-bottom: 0.5rem; }
        .selector-group label { display: block; font-size: 0.75rem; text-transform: uppercase; color: #888; margin-bottom: 0px; letter-spacing: 1px; }
        .label-row-between { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0rem; }
        .color-dot-btn { background: none; border: none; padding: 4px; cursor: pointer; border: 1px solid transparent; border-radius: 50%; transition: all 0.2s; position: relative; }
        .color-dot-btn.active { border-color: #000; }
        .color-dot-btn.out-of-stock { opacity: 0.6; }
        .color-dot { display: block; width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.1); }
        .x-mark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #d62828;
            font-size: 16px;
            font-weight: bold;
            pointer-events: none;
            z-index: 2;
            text-shadow: 0 0 3px #fff;
            line-height: 1;
        }
        .size-options { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .size-box-btn { min-width: 30px; height: 30px; border: 1px solid #eee; background: #fff; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; border-radius: 2px; position: relative; color: #121212; }
        .size-box-btn.active { background: #000; color: #fff; border-color: #000; }
        .size-box-btn.out-of-stock { background-color: #fcfcfc; color: #ddd; border-color: #f1f1f1; }
        .size-guide-dark { background: none; border: none; color: #000; font-weight: 700; cursor: pointer; font-size: 0.7rem; letter-spacing: 1px; text-transform: uppercase; padding: 0; display: flex; align-items: center; gap: 6px; }
        .size-guide-dark span { text-decoration: underline; }
        .dropdown-inner{padding: 5px;}
        .selected-size-info-box {
            margin-top: 0.5rem;
            padding: 1rem;
            background-color: #f8f8f8;
            border-radius: 4px;
            font-size: 0.85rem;
            line-height: 1.6;
            color: #333;
            animation: fadeIn 0.3s ease-out;
        }
        .selected-size-info-box p { margin: 0; }
        .selected-size-info-box strong { color: #A98B68; }
        .size-length-detail { color: #666; font-size: 0.8rem; }
        .size-help-link { margin-top: 0.8rem; font-size: 0.8rem; color: #555; }
        .size-help-link a { color: var(--color-green); text-decoration: underline; font-weight: 600; }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .size-guide-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); backdrop-filter: blur(5px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .size-guide-modal-content { background: #fff; padding: 3rem; max-width: 850px; width: 100%; position: relative; border-radius: 4px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; }
        .modal-close { position: absolute; top: 15px; right: 15px; background: #f5f5f5; border: none; font-size: 1.2rem; cursor: pointer; color: #333; width: 35px; height: 35px; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 10; transition: background 0.2s; }
        .modal-close:hover { background: #eee; }
        .size-guide-modal-content h2 { font-family: var(--font-products); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 2rem; text-align: center; color: var(--color-green); font-size: 1.5rem; }

        .table-responsive {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            border: 1px solid #eee;
            border-radius: 4px;
        }

        .size-guide-table { width: 100%; border-collapse: collapse; font-size: 0.8rem; min-width: 500px; }
        .size-guide-table th { background: #f9f9f9; padding: 1rem 0.5rem; text-align: center; font-weight: 700; color: var(--color-green); font-family: var(--font-products); border-bottom: 2px solid #eee; white-space: nowrap; }
        .size-guide-table td { padding: 1rem 0.5rem; text-align: center; border-bottom: 1px solid #eee; color: #666; }

        @media (max-width: 768px) {
            .size-guide-modal-content { padding: 2.5rem 1rem 1.5rem; }
            .size-guide-modal-content h2 { font-size: 1.2rem; margin-bottom: 1.5rem; }
            .size-guide-table { font-size: 0.75rem; }
            .size-guide-table th, .size-guide-table td { padding: 0.8rem 1rem; }
        }
        .product-details-dropdowns { margin-top: 0.5rem;}
        .product-details-dropdowns details{ border-top: 1px solid #eee; border-bottom: 1px solid #eee;}
        summary { list-style: none; padding: 0.5rem 0; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
        summary::after { content: '+'; color: #999; font-size: 1.2rem; font-weight: 300; }
        details[open] summary::after { content: '−'; }

        .additional-info-container {
            display: flex;
            flex-direction: column;
            width: 100%;
        }
        .additional-info-row {
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            padding: 1rem 0;
            border-bottom: 1px dotted #e5e5e5;
            gap: 2rem;
        }
        .additional-info-row:last-child {
            border-bottom: none;
        }
        .info-label {
            color: #000; /* Cambiado de verde a negro */
            font-size: 0.85rem;
            font-weight: 500;
            white-space: nowrap;
        }
        .info-value {
            color: #777;
            font-size: 0.85rem;
            text-align: right;
            line-height: 1.4;
        }
        .no-info {
            font-size: 0.8rem;
            color: #999;
            font-style: italic;
        }

        @media (max-width: 992px) {
          .product-breadcrumbs { margin-top: 0; margin-bottom: 1.5rem; font-size: 0.75rem; }
          .product-detail-split { display: block; position: relative; }
          .product-gallery-container {
            width: 100%;
            position: sticky !important;
            top: 65px !important;
            aspect-ratio: 1 / 1;
            z-index: 1;
            background: #f8f8f8;
          }
          .gallery-dots {
             display: flex;
             bottom: 50px; /* Lift dots above the overlapping sidebar on mobile */
          }
          .product-gallery {
            flex-direction: row;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            scrollbar-width: none;
            height: 100%;
            -webkit-overflow-scrolling: touch;
          }
          .gallery-item {
            flex: 0 0 100%;
            scroll-snap-align: center;
            height: 100%;
          }
          .gallery-item img {
            height: 100%;
            width: 100%;
            object-fit: cover;
          }
          .gallery-nav {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: rgba(255, 255, 255, 0.8);
            border: none;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 5;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          .gallery-nav.prev { left: 15px; }
          .gallery-nav.next { right: 15px; }

          .product-info-sidebar {
            width: 100%;
            position: relative !important;
            z-index: 10;
            background: #fff;
            margin-top: -30px;
            border-radius: 0px;
            box-shadow: 0 -15px 30px rgba(0,0,0,0.08);
          }
          .sidebar-inner { padding: 2.5rem 1.5rem 5rem; }
          .sidebar-content {
            position: static !important;
            max-height: none !important;
            overflow: visible !important;
          }

          .product-actions-grid { grid-template-columns: 1fr 1fr; }
          .product-purchase-row {
            flex-direction: column;
            align-items: stretch;
            gap: 1.5rem;
          }
          .quantity-selector-container {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
          }
        }


        .addi-container {
            margin-top: 0.5rem;
            margin-bottom: 0rem;
            padding: 8px 0px;
            display: flex;
            align-items: center;
            background-color: #fff;
            transition: all 0.3s;
        }
        .addi-container:hover {
            border-color: #0068ff;
            box-shadow: 0 2px 8px rgba(0, 104, 255, 0.1);
        }
        .addi-content {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 0.8rem;
            color: #333;
            width: 100%;
            flex-wrap: wrap;
        }
        .addi-icon {
            width: 24px;
            height: 24px;
            flex-shrink: 0;
            border-radius: 6px;
        }
        .addi-brand {
            color: #0068ff;
            font-weight: 800;
        }
        .addi-text {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-wrap: wrap;
        }
        .addi-text strong {
            font-weight: 700;
        }
        .addi-link {
            color: #0068ff;
            text-decoration: underline;
            margin-left: 2px;
            white-space: nowrap;
             font-weight: 600;
             cursor: pointer;
        }
        @media (max-width: 480px) {
            .addi-content { gap: 8px; font-size: 0.75rem; }
            .addi-icon { width: 20px; height: 20px; }
        }

        @media (max-width: 992px) {
            .addi-container { margin-top: 0.5rem; }
        }

        .store-locator-container {
            margin-top: 0.5rem;
            padding-top: 0.5rem;        }
        .store-locator-link {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #121212;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            font-weight: 600;
            text-decoration: none;
            transition: color 0.2s;
        }
        .store-locator-link svg {
            color: var(--color-green);
        }
        .store-locator-link:hover {
            color: var(--color-green);
            text-decoration: underline;
        }

        /* Lightbox Styles (Global) */
        .cursor-zoom { cursor: zoom-in; }
        .lightbox-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.9); /* Gris claro semitransparente como referencia */
          backdrop-filter: blur(2px);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.3s ease-out;
        }

        /* Botones Flotantes Circulares */
        .lightbox-close,
        .lightbox-nav,
        .lightbox-zoom-indicator {
          background: #fff;
          border: none;
          border-radius: 50%;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: #121212;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          transition: transform 0.2s, box-shadow 0.2s;
          position: absolute;
          z-index: 10002;
        }

        .lightbox-close {
          top: 25px;
          right: 25px;
        }

        .lightbox-nav.prev {
          left: 25px;
          top: 50%;
          transform: translateY(-50%);
        }

        .lightbox-nav.next {
          right: 25px;
          top: 50%;
          transform: translateY(-50%);
        }

        .lightbox-zoom-indicator {
          bottom: 25px;
          left: 25px;
          pointer-events: auto; /* Ensure clickable */
        }

        .lightbox-close:hover,
        .lightbox-nav:hover {
          transform: translateY(-50%) scale(1.1);
          box-shadow: 0 6px 16px rgba(0,0,0,0.15);
        }
        .lightbox-close:hover {
           transform: scale(1.1); /* Close button doesn't have translateY center */
        }

        .lightbox-content {
          width: 100%;
          height: 100%;
          overflow: hidden;
          position: relative;
          pointer-events: none;
        }

        .lightbox-slider {
          display: flex;
          height: 100%;
          width: 100%;
          transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
          will-change: transform;
          pointer-events: none;
        }

        .lightbox-slide {
          flex: 0 0 100%;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .lightbox-image-wrapper {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
        }

        .lightbox-img {
          max-width: 100vw;
          max-height: 100vh;
          object-fit: contain;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
          background: #fff;
          transition: transform 0.2s ease-out;
        }

        .lightbox-img.zoomed {
            cursor: zoom-out;
            max-width: none;
            max-height: none;
            /* width: 100%; height: 100%; controlled by transform */
        }

        @media (max-width: 768px) {
            .lightbox-img {
                max-width: 100vw;
                max-height: 80vh;
            }
            .lightbox-nav, .lightbox-zoom-indicator {
                width: 25px;
                height: 25px;
            }
            .lightbox-nav.prev { left: 10px; }
            .lightbox-nav.next { right: 10px; }
            .lightbox-close { top: 15px; right: 15px; width: 36px; height: 36px; }
            .lightbox-zoom-indicator { bottom: 15px; left: 15px; }
        }

        /* --- FBT PREMIUM NEW SECTION --- */
        .fbt-new-section {
          padding: 2rem 0;
          background-color: #f9f9f9;
          border-top: 1px solid #12121208;
          width: 100vw;
          margin-left: calc(50% - 50vw);
          position: relative;
        }
        .fbt-fullwidth-container {
          width: 100%;
          max-width: 1440px;
          margin: 0 auto;
          padding: 0 4rem;
        }
        .fbt-title-premium {
          font-family: var(--font-products);
          font-size: 1.1rem;
          font-weight: 500;
          color: var(--color-green);
          margin-bottom: 2rem;
          text-transform: uppercase;
          letter-spacing: 2px;
          text-align: center;
        }
        .fbt-bundle-grid {
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 4rem;
          width: 100%;
        }
        .fbt-visual-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2rem;
        }
        .fbt-bundle-step {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 2rem;
        }
        .fbt-math-plus {
          font-size: 2.5rem;
          color: #155338;
          font-weight: 300;
          margin-top: -60px; /* Centrado respecto a las cards */
        }
        .fbt-card-isla {
          width: 320px;
          background: #fff;
          transition: transform 0.4s ease;
        }
        .fbt-card-isla:hover {
          transform: translateY(-5px);
        }

        .fbt-action-card {
          background: #fbfbfb;
          padding: 2.5rem;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          gap: 1.2rem;
          min-width: 300px;
          border: 1px solid #f0f0f0;
        }
        .fbt-total-row {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .fbt-total-row .label { font-size: 0.8rem; color: #777; text-transform: uppercase; letter-spacing: 1px; }
        .fbt-total-row .value { font-size: 1.6rem; color: var(--color-green); font-family: var(--font-paragraph); font-weight: 500; }
        
        .fbt-submit-btn {
          background: var(--color-green);
          color: #fff;
          border: none;
          padding: 1.2rem;
          font-family: var(--font-headings);
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .fbt-submit-btn:hover:not(:disabled) {
          background: var(--color-beige);
          transform: translateY(-2px);
        }
        .fbt-submit-btn:disabled {
          background: #eee;
          color: #aaa;
          cursor: not-allowed;
        }
        .fbt-note {
          font-size: 0.75rem;
          color: #999;
          margin: 0;
          font-style: italic;
        }

        @media (max-width: 1100px) {
          .fbt-bundle-grid { flex-direction: column; gap: 3rem; }
          .fbt-action-card { width: 100%; max-width: 500px; min-width: 0; padding: 2rem; }
        }

        @media (max-width: 600px) {
            .fbt-new-section { padding: 2rem 0; }
            .fbt-fullwidth-container { padding: 0 1.5rem; }
            .fbt-visual-row { gap: 1rem; width: 100%; }
            .fbt-bundle-step { gap: 1rem; }
            .fbt-card-isla { width: 100%; min-width: 0; }
            .fbt-math-plus { font-size: 1.2rem; margin-top: -30px; display: none;}
            .fbt-item-name { font-size: 0.7rem; }
            .fbt-action-card { padding: 1.5rem; }
            .fbt-title-premium { margin-bottom: 2rem; }
        }

        /* --- STYLES FOR RELATED PRODUCTS (PREMIUM) --- */
        .related-products-section {
          padding: 2rem 0;
          background-color: #fcfcfc;
          border-top: 1px solid #eee;
          margin-top: 0rem;
        }
        .related-section-header {
          text-align: center;
          margin: 0rem 0rem;
        }
        .related-title {
          font-size: 1.5rem;
          color: var(--color-green);
          font-family: var(--font-headings);
          font-weight: 500;
        }
        .related-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0rem;
          width: 100%;
          margin: 0 auto;
        }

        @media (max-width: 992px) {
          .related-grid { grid-template-columns: repeat(2, 1fr); }
          .related-products-section { padding: 2rem 0; }
        }
      `}</style>
    </div>
  );
}

function getColorCode(slug: string): string {
  const colors: Record<string, string> = {
    'negro': '#121212',
    'cafe': '#6F4E37',
    'miel': '#D4A373',
    'azul': '#1B3F8B',
    'azul-oscuro': '#0B1B32',
    'azuloscuro': '#0B1B32',
    'navy': '#0B1B32',
    'marino': '#151E3D',
    'azul-marino': '#151E3D',
    'verde': '#155338',
    'vino': '#722F37',
    'vinotinto': '#722F37',
    'vino-tinto': '#722F37',
    'burgundy': '#722F37',
    'tabaco': '#8B5A2B',
    'cognac': '#9A463D',
    'rojo': '#C41E3A',
    'blanco': '#FFFFFF',
    'gris': '#888888',
    'plata': '#C0C0C0',
    'silver': '#C0C0C0',
    'oro': '#D4AF37',
    'gold': '#D4AF37',
    'beige': '#F5F5DC',
    'arena': '#E2CBA4',
    'tabac': '#8B5A2B',
    'mostaza': '#E1AD01',
    'azul-claro': '#ADD8E6',
    'light-blue': '#ADD8E6',
    'morado': '#800080',
    'purple': '#800080',
    'cafe-claro': '#A67B5B',
    'rosa': '#FFC0CB',
    'rosado': '#FFC0CB',
    'rosada': '#FFC0CB',
    'pink': '#FFC0CB',
    'camel': '#C19A6B',
    'marron': '#6F4E37',
    'marrón': '#6F4E37'
  };
  return colors[slug.toLowerCase()] ||
    colors[slug.toLowerCase().replace(/-/g, '')] ||
    colors[normalizeAttr(slug)] ||
    '#ddd';
}
