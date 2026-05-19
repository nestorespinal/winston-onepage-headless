import { useState, useEffect } from 'react';
import ProductCard from './ProductCard';

interface Product {
  id: number;
  name: string;
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
    src: string;
    alt: string;
  }[];
  attributes: {
    id: number;
    name: string;
    terms: { id: number; name: string; slug: string }[];
  }[];
  variations: {
    id: number;
    attributes: { name: string; value: string }[];
  }[];
  variation_images_map?: Record<string, any[]>;
}

const CATEGORIES = [
  { id: '63', name: 'Zapatos', slug: 'zapatos' },
  { id: '249', name: 'Ropa', slug: 'ropa' },
  { id: '190', name: 'Maletas', slug: 'maletas' }
];

export default function ProductGrid({ initialProducts = [] }: { initialProducts?: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [categoryCache, setCategoryCache] = useState<Record<string | number, Product[]>>({
    '63': initialProducts
  });
  const [activeCategory, setActiveCategory] = useState(CATEGORIES[0]);
  const [visibleCount, setVisibleCount] = useState(12);
  const [loading, setLoading] = useState(initialProducts.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [categorySlugs, setCategorySlugs] = useState<Record<string, string>>({
    '63': 'zapatos',
    '249': 'ropa',
    '190': 'maletas'
  });
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);

  // Precarga inicial de todas las categorías para eliminar el loader al cambiar pestañas
  useEffect(() => {
    const prefetchCategories = async () => {
      try {
        if (initialProducts.length === 0) setLoading(true);
        setError(null);

        // 1. Obtener la información real de las categorías (para los slugs actualizados)
        try {
          const catRes = await fetch('/api/categories'); // Usar un endpoint que devuelva categorías
          if (catRes.ok) {
            const allCats = await catRes.json();
            const newSlugs: Record<string, string> = { ...categorySlugs };
            CATEGORIES.forEach(c => {
                const found = allCats.find((ac: any) => String(ac.id) === String(c.id));
                if (found) newSlugs[c.id] = found.slug;
            });
            setCategorySlugs(newSlugs);
          }
        } catch (e) {
          console.error("Error fetching dynamic slugs:", e);
        }

        // 2. Cargar productos
        const results = await Promise.all(
          CATEGORIES.map(async (cat) => {
            if (String(cat.id) === '63' && initialProducts.length > 0) {
              return { id: cat.id, data: initialProducts };
            }
            const res = await fetch(`/api/products?category=${cat.id}&orderby=modified&per_page=24`);
            if (!res.ok) return { id: cat.id, data: [] };
            const data: Product[] = await res.json();

            // De-duplicación de seguridad
            const seenIds = new Set<number>();
            const filteredData = data.filter(p => {
              if (seenIds.has(p.id)) return false;
              seenIds.add(p.id);
              return true;
            });

            return { id: cat.id, data: filteredData };
          })
        );

        // Guardamos todo en el cache local
        const newCache: Record<string | number, Product[]> = {};
        results.forEach(res => {
          newCache[res.id] = res.data;
        });

        setCategoryCache(newCache);

        // Establecemos los productos iniciales (Zapatos)
        if (newCache[activeCategory.id]) {
          setProducts(newCache[activeCategory.id]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al precargar colecciones');
      } finally {
        setLoading(false);
      }
    };

    prefetchCategories();
  }, []);

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setIsHeaderHidden(true);
      } else {
        setIsHeaderHidden(false);
      }
      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const fetchProducts = async (categoryId: string | number) => {
    // Esta función ahora solo se usa para reintentos o refrescos manuales
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/products?category=${categoryId}&orderby=popularity`);
      if (!response.ok) throw new Error('Error al cargar productos');

      const data: Product[] = await response.json();
      const seenIds = new Set<number>();
      const filteredData = data.filter(p => {
        if (seenIds.has(p.id)) return false;
        seenIds.add(p.id);
        return true;
      });

      setProducts(filteredData);
      setCategoryCache(prev => ({ ...prev, [categoryId]: filteredData }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (category: typeof CATEGORIES[0]) => {
    if (category.id === activeCategory.id) return;

    setActiveCategory(category);
    setVisibleCount(12);

    // Si ya lo tenemos en cache, lo mostramos de inmediato (Sin loader)
    if (categoryCache[category.id]) {
      setProducts(categoryCache[category.id]);
    } else {
      // Si por algún motivo no se precargó, lo traemos
      fetchProducts(category.id);
    }
  };

  const displayedProducts = products.slice(0, visibleCount);

  if (error) {
    return (
      <div className="error-container">
        <p>{error}</p>
        <button onClick={() => fetchProducts(activeCategory.id)} className="btn">Reintentar</button>
      </div>
    );
  }

  return (
    <section id="tienda" className="tienda">
      <div className="container-full">
        <div className="section-title">
          <span className="subtitle">ACCESORIOS Y ZAPATOS DE CUERO PARA HOMBRE</span>
          <h2>LOS FAVORITOS</h2>
          <p className="description">
            Ropa, zapatos 100 % cuero y accesorios diseñados para hombres contemporáneos que valoran la calidad, el detalle y el carácter.
          </p>
        </div>

        <div className={`category-filters-wrapper ${isHeaderHidden ? 'is-hidden-top' : ''}`}>
          <div className="category-filters">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`filter-btn ${activeCategory.id === cat.id ? 'active' : ''}`}
                onClick={() => handleCategoryChange(cat)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-4x3">
          {displayedProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>

        {!loading && products.length === 0 && (
          <div className="empty-state">
            <p>No se encontraron productos en esta colección.</p>
            <button onClick={() => fetchProducts(activeCategory.id)} className="btn btn-outline">Actualizar</button>
          </div>
        )}

        {loading && (
          <div className="loading-spinner">
            <div className="spinner"></div>
          </div>
        )}

        {!loading && products.length > 0 && (
          <div className="load-more-container">
            {visibleCount < 24 && products.length > 12 ? (
              <button
                onClick={() => setVisibleCount(24)}
                className="btn btn-outline"
              >
                Ver más {activeCategory.name.toLowerCase()}
              </button>
            ) : (
              <a href={`/categoria/${categorySlugs[activeCategory.id] || activeCategory.slug}`} className="btn btn-outline">
                Ver toda la colección de {activeCategory.name.toLowerCase()}
              </a>
            )}
          </div>
        )}
      </div>

      <style>{`
        .tienda { background-color: #fff; padding: 4rem 0; width: 100%; }
        .container-full { width: 100%; padding: 0; }
        .section-title { text-align: center; margin-bottom: 2rem; max-width: 800px; margin-left: auto; margin-right: auto; padding: 0 1rem; }
        .subtitle { font-size: 0.8rem; color: #999; letter-spacing: 2px; text-transform: uppercase; display: block; margin-bottom: 0.5rem; font-family: var(--font-paragraphs); }
        .section-title h2 { font-size: 1.5rem; margin-bottom: 1.5rem; color: var(--color-green); line-height: 1; letter-spacing: 4px; font-weight: 700; }
        .description { font-size: 0.85rem; color: #333; line-height: 1.6; font-family: var(--font-paragraphs); max-width: 600px; margin: 0 auto; }

        .category-filters-wrapper {
          position: sticky;
          top: 80px; 
          z-index: 90;
          background-color: #fff;
          padding: 1.5rem 0;
          margin-bottom: 2rem;
          transition: top 0.3s ease-in-out;
        }

        .category-filters-wrapper.is-hidden-top {
          top: 0;
        }

        .category-filters {
          display: flex;
          justify-content: center;
          gap: 1rem;
          max-width: 1600px;
          margin: 0 auto;
          padding: 0 1rem;
        }

        .filter-btn {
          flex: 1;
          max-width: 250px;
          padding: 1rem 2rem;
          border: none;
          background-color: #e0e0e0;
          color: #155338;
          font-family: var(--font-paragraphs);
          font-size: 0.8rem;
          font-weight: 600;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .filter-btn.active {
          background-color: #155338;
          color: #fff;
        }

        .filter-btn:hover:not(.active) {
          background-color: #d0d0d0;
        }

        @media (max-width: 768px) {
          .section-title h2 { font-size: 1.25rem; }
          .description { font-size: 0.75rem; }
          .category-filters { 
            align-items: center;
            gap: 1rem;
            transform: scale(0.8);
          }
          .filter-btn { 
            width: 100%;
            max-width: 100%;
          }
          .category-filters-wrapper { top: 64px; } 
        }

        .grid-4x3 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0rem;
          width: 100%;
        }

        @media (max-width: 1200px) { .grid-4x3 { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 768px) { .grid-4x3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 480px) { .grid-4x3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } }

        .load-more-container { margin-top: 4rem; display: flex; justify-content: center; }
        .error-container { text-align: center; padding: 4rem 0; }
        .loading-spinner { display: flex; justify-content: center; margin: 4rem 0; }
        .spinner { width: 40px; height: 40px; border: 4px solid rgba(21, 83, 56, 0.1); border-left-color: var(--color-green); border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .btn-outline {
          border: 1px solid var(--color-green);
          background: transparent;
          color: var(--color-green);
          padding: 0.8rem 2.5rem;
          text-decoration: none;
          text-transform: uppercase;
          font-size: 0.8rem;
          letter-spacing: 2px;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .btn-outline:hover {
          background: var(--color-green);
          color: #fff;
        }
      `}</style>
    </section>
  );
}
