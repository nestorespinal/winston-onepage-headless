import React, { useState, useEffect, useRef, useMemo } from 'react';
import ProductCard from './ProductCard';

interface FilteredProductListProps {
    initialProducts: any[];
    category: any;
    subcategories: any[];
    colorTerms: any[];
    tallaTerms: any[];
    initialSort: any;
    navigationTree?: any[];
}

const SORT_OPTIONS = [
    { key: "destacado", label: "Destacado", orderBy: "popularity", order: "desc", onSale: false },
    { key: "precio_asc", label: "Menor a mayor precio", orderBy: "price", order: "asc", onSale: false },
    { key: "precio_desc", label: "Mayor a menor precio", orderBy: "price", order: "desc", onSale: false },
    { key: "descuentos", label: "Descuentos", orderBy: "popularity", order: "desc", onSale: true },
];

const FilteredProductList: React.FC<FilteredProductListProps> = ({
    initialProducts = [],
    category = {},
    subcategories = [],
    colorTerms: initialColorTerms = [],
    tallaTerms: initialTallaTerms = [],
    initialSort,
    navigationTree = []
}) => {
    const [allFetchedProducts, setAllFetchedProducts] = useState(Array.isArray(initialProducts) ? initialProducts : []);
    const [loading, setLoading] = useState(false);
    const [sort, setSort] = useState(initialSort || SORT_OPTIONS[0]);
    const [selectedColors, setSelectedColors] = useState<string[]>([]);
    const [selectedTallas, setSelectedTallas] = useState<string[]>([]);
    const [selectedSubcats, setSelectedSubcats] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [isHeaderHidden, setIsHeaderHidden] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        categories: (category?.slug || "").toLowerCase().includes('accesorios'),
        color: false,
        talla: false
    });

    const isFirstRender = useRef(true);

    // Deep Extraction from Products AND Variations
    const extractedColors = useMemo(() => {
        const collected = new Map();
        if (Array.isArray(allFetchedProducts)) {
            allFetchedProducts.forEach(p => {
                // Check main attributes
                p.attributes?.forEach((a: any) => {
                    const name = (a.name || "").toLowerCase();
                    const slug = (a.slug || "").toLowerCase();
                    if (name.includes('color') || slug.includes('color')) {
                        const terms = a.terms || (a.options ? a.options.map((o: any) => typeof o === 'string' ? { name: o } : o) : []);
                        terms.forEach((t: any) => {
                            const val = t.name || t;
                            if (typeof val === 'string' && val) collected.set(val.toLowerCase(), { name: val, slug: val.toLowerCase() });
                        });
                    }
                });
                // Check variations attributes (the "hidden" ones)
                p.variations_data?.forEach((v: any) => {
                    v.attributes?.forEach((attr: any) => {
                        if (attr.name.toLowerCase().includes('color')) {
                            const val = attr.value || attr.option;
                            if (val) collected.set(val.toLowerCase(), { name: val, slug: val.toLowerCase() });
                        }
                    });
                });
            });
        }
        return Array.from(collected.values());
    }, [allFetchedProducts]);

    const colorTerms = useMemo(() => {
        const base = Array.isArray(initialColorTerms) ? initialColorTerms : [];
        const combined = new Map();
        // Merge them to avoid duplicates but keep all unique colors
        base.forEach(t => combined.set(t.slug.toLowerCase(), t));
        extractedColors.forEach(t => combined.set(t.slug.toLowerCase(), t));
        return Array.from(combined.values());
    }, [initialColorTerms, extractedColors]);

    const extractedTallas = useMemo(() => {
        const collected = new Map();
        if (Array.isArray(allFetchedProducts)) {
            allFetchedProducts.forEach(p => {
                const checkAttrs = (attrs: any[]) => {
                    attrs?.forEach((a: any) => {
                        const name = (a.name || "").toLowerCase();
                        const slug = (a.slug || "").toLowerCase();
                        if (name.includes('talla') || name.includes('tamaño') || name.includes('size') || slug.includes('talla') || name.includes('numero')) {
                            const terms = a.terms || (a.options ? a.options.map((o: any) => typeof o === 'string' ? { name: o } : o) : []);
                            terms.forEach((t: any) => {
                                const val = t.name || t;
                                if (typeof val === 'string' && val) collected.set(val.toLowerCase(), { name: val, slug: val.toLowerCase() });
                            });
                        }
                    });
                };
                checkAttrs(p.attributes);
                p.variations_data?.forEach((v: any) => checkAttrs(v.attributes));
            });
        }
        return Array.from(collected.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }, [allFetchedProducts]);

    const tallaTerms = useMemo(() => {
        const base = Array.isArray(initialTallaTerms) ? initialTallaTerms : [];
        const combined = new Map();
        base.forEach(t => combined.set(t.slug.toLowerCase(), t));
        extractedTallas.forEach(t => combined.set(t.slug.toLowerCase(), t));
        return Array.from(combined.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    }, [initialTallaTerms, extractedTallas]);

    const tagTerms = useMemo(() => {
        const collected = new Map();
        if (Array.isArray(allFetchedProducts)) {
            allFetchedProducts.forEach(p => {
                // p.tags can be an array of objects {id, name, slug}
                if (Array.isArray(p.tags)) {
                    p.tags.forEach((t: any) => {
                        if (t.name && t.slug) {
                            collected.set(t.slug, { name: t.name, slug: t.slug });
                        }
                    });
                }
            });
        }
        return Array.from(collected.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [allFetchedProducts]);

    const toggleSection = (section: string) => {
        setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Global Scroll Effect
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

    // Initial Params
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const colorParam = params.get('color');
        const tallaParam = params.get('talla');
        const subcatParam = params.get('subcat');
        const tagParam = params.get('tag');
        const sortParam = params.get('sort');

        if (colorParam) setSelectedColors(colorParam.split(',').filter(Boolean));
        if (tallaParam) setSelectedTallas(tallaParam.split(',').filter(Boolean));
        if (subcatParam) setSelectedSubcats(subcatParam.split(',').filter(Boolean));
        if (tagParam) setSelectedTags(tagParam.split(',').filter(Boolean));
        if (sortParam) {
            const found = SORT_OPTIONS.find(o => o.key === sortParam);
            if (found) setSort(found);
        }

        // Auto-fetch if SSR returned no products (e.g. stale cache or timeout)
        const ssrProducts = Array.isArray(initialProducts) ? initialProducts : [];
        if (ssrProducts.length === 0 && category?.id) {
            const activeSort = sortParam ? (SORT_OPTIONS.find(o => o.key === sortParam) || SORT_OPTIONS[0]) : SORT_OPTIONS[0];
            fetchBaseProducts(activeSort, 1);
        } else if (ssrProducts.length > 0) {
            setAllFetchedProducts(ssrProducts);
            setPage(1);
            setLoading(false);
            if (ssrProducts.length < 16) setHasMore(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Si el servidor no envió términos de color o talla (para ahorrar tiempo),
    // los extraemos de los productos o el cliente los gestiona dinámicamente.
    useEffect(() => {
        // This effect runs after the initial products are set and memoized values are calculated.
        // If initialColorTerms or initialTallaTerms were empty from SSR,
        // the useMemo hooks for colorTerms and tallaTerms will have populated them from allFetchedProducts.
        // No explicit fetch is needed here, as the memoized values handle the dynamic extraction.
    }, [allFetchedProducts, initialColorTerms, initialTallaTerms]);


    const fetchBaseProducts = async (currentSort: any, pageNum: number, append = false) => {
        if (!category?.id) return;
        if (append) setLoadingMore(true); else setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            params.append('category', category.id.toString());
            params.append('orderby', currentSort.orderBy);
            params.append('order', currentSort.order);
            params.append('page', pageNum.toString());
            params.append('per_page', '16');
            if (currentSort.onSale) params.append('on_sale', 'true');

            const response = await fetch(`/api/products?${params.toString()}`);
            if (!response.ok) throw new Error('Error al cargar productos');

            const data = await response.json();
            const newProducts = Array.isArray(data) ? data : [];

            if (append) {
                setAllFetchedProducts(prev => [...prev, ...newProducts]);
            } else {
                setAllFetchedProducts(newProducts);
            }

            if (newProducts.length < 16) {
                setHasMore(false);
            } else {
                setHasMore(true);
            }
        } catch (err) {
            console.error("Fetch Error:", err);
            setError('No pudimos actualizar la lista de productos.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const loadMore = () => {
        if (loadingMore || !hasMore) return;
        const nextPage = page + 1;
        setPage(nextPage);
        fetchBaseProducts(sort, nextPage, true);
    };

    // Intersection Observer for Infinite Scroll
    const observerTarget = useRef(null);

    useEffect(() => {
        const target = observerTarget.current;
        if (!target || !hasMore) return;

        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loadingMore) {
                    loadMore();
                }
            },
            { threshold: 0.1 }
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, loadingMore, page, sort]);

    const handleSortChange = (newSort: any) => {
        setSort(newSort);
        setPage(1);
        fetchBaseProducts(newSort, 1, false);
    };

    const toggleColor = (slug: string) => {
        setSelectedColors(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
    };

    const toggleTalla = (slug: string) => {
        setSelectedTallas(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
    };

    const toggleSubcat = (slug: string) => {
        setSelectedSubcats(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
    };

    const toggleTag = (slug: string) => {
        setSelectedTags(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
    };

    const clearFilters = () => {
        setSelectedColors([]);
        setSelectedTallas([]);
        setSelectedSubcats([]);
        setSelectedTags([]);
    };

    // Multi-select Client Filtering Logic
    const filteredProducts = useMemo(() => {
        if (!Array.isArray(allFetchedProducts)) return [];
        let result = [...allFetchedProducts];

        // Filter by Colors
        if (selectedColors.length > 0) {
            result = result.filter(p =>
                p.attributes?.some((a: any) => {
                    const name = (a.name || "").toLowerCase();
                    const slug = (a.slug || "").toLowerCase();
                    if (name.includes('color') || slug.includes('color')) {
                        const terms = a.terms || (a.options ? a.options.map((o: any) => ({ name: o })) : []);
                        return terms.some((t: any) => {
                            const val = typeof t === 'string' ? t : (t.name || "");
                            return val && selectedColors.includes(val.toLowerCase());
                        });
                    }
                    return false;
                })
            );
        }

        // Filter by Tallas
        if (selectedTallas.length > 0) {
            result = result.filter(p =>
                p.attributes?.some((a: any) => {
                    const name = (a.name || "").toLowerCase();
                    const slug = (a.slug || "").toLowerCase();
                    if (name.includes('talla') || name.includes('tamaño') || name.includes('size') || slug.includes('talla') || slug.includes('size') || name.includes('numero') || name.includes('nmero')) {
                        const terms = a.terms || (a.options ? a.options.map((o: any) => ({ name: o })) : []);
                        return terms.some((t: any) => {
                            const val = typeof t === 'string' ? t : (t.name || "");
                            return val && selectedTallas.includes(val.toLowerCase());
                        });
                    }
                    return false;
                })
            );
        }

        // Filter by Subcategories
        if (selectedSubcats.length > 0) {
            result = result.filter(p =>
                p.categories?.some((c: any) => selectedSubcats.includes(c.slug)) ||
                (p.category_slug && selectedSubcats.includes(p.category_slug))
            );
        }

        // Filter by Tags
        if (selectedTags.length > 0) {
            result = result.filter(p =>
                p.tags?.some((t: any) => selectedTags.includes(t.slug))
            );
        }

        return result;
    }, [allFetchedProducts, selectedColors, selectedTallas, selectedSubcats, selectedTags]);

    // Update URL effect
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        const url = new URL(window.location.href);
        url.searchParams.set('sort', sort.key);
        if (selectedColors.length > 0) url.searchParams.set('color', selectedColors.join(',')); else url.searchParams.delete('color');
        if (selectedTallas.length > 0) url.searchParams.set('talla', selectedTallas.join(',')); else url.searchParams.delete('talla');
        if (selectedSubcats.length > 0) url.searchParams.set('subcat', selectedSubcats.join(',')); else url.searchParams.delete('subcat');
        if (selectedTags.length > 0) url.searchParams.set('tag', selectedTags.join(',')); else url.searchParams.delete('tag');
        window.history.pushState({}, '', url.toString());
    }, [selectedColors, selectedTallas, selectedSubcats, selectedTags, sort]);

    const displayCategoryTitle = useMemo(() => {
        if (!category?.slug || category.slug === 'tienda') return 'TODOS LOS PRODUCTOS';
        const slug = category.slug.toLowerCase();
        if (slug === 'zapatos') return 'TODOS LOS ZAPATOS';
        if (slug === 'ropa') return 'TODA LA ROPA';
        if (slug === 'accesorios') return 'TODOS LOS ACCESORIOS';
        if (slug === 'maletas') return 'TODAS LAS MALETAS';
        if (slug === 'mascotas') return 'TODO PARA MASCOTAS';
        return `COLECCIÓN ${category.name?.toUpperCase() || ''}`;
    }, [category]);

    return (
        <>
            {/* Barra Sticky */}
            <div className={`filter-bar-container sticky-filters ${isHeaderHidden ? 'is-hidden-top' : ''}`}>
                <div className="filter-bar">
                    <div className="filter-left">
                        <div className="category-dropdown">
                            <span className="current-category">{displayCategoryTitle}</span>
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1.5" fill="none" className="dropdown-icon">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                            <ul className="dropdown-list">
                                {subcategories.map((cat: any) => (
                                    <li key={cat.slug}>
                                        <a href={`/categoria/${cat.slug}`}>{cat.name}</a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    <div className="filter-right">
                        <div className="sort-dropdown">
                            <span className="sort-label">Ordenar por: {sort.label}</span>
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1.5" fill="none">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                            <ul className="sort-list">
                                {SORT_OPTIONS.map(opt => (
                                    <li key={opt.key}>
                                        <button
                                            onClick={() => handleSortChange(opt)}
                                            className={sort.key === opt.key ? 'active' : ''}
                                        >
                                            {opt.label}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <button className="filter-btn" onClick={() => setIsDrawerOpen(true)}>
                            Filtro {(selectedColors.length + selectedTallas.length + selectedSubcats.length > 0) && `(${selectedColors.length + selectedTallas.length + selectedSubcats.length})`}
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line>
                                <line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line>
                                <line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line>
                                <line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                {(selectedColors.length > 0 || selectedTallas.length > 0 || selectedSubcats.length > 0) && (
                    <div className="active-filters">
                        {selectedSubcats.map(s => (
                            <div className="filter-tag" key={s}>
                                {subcategories.find(c => c.slug === s)?.name || s}
                                <button onClick={() => toggleSubcat(s)}>×</button>
                            </div>
                        ))}
                        {selectedColors.map(c => (
                            <div className="filter-tag" key={c}>
                                {translateColor(c)}
                                <button onClick={() => toggleColor(c)}>×</button>
                            </div>
                        ))}
                        {selectedTallas.map(t => (
                            <div className="filter-tag" key={t}>
                                Talla: {t}
                                <button onClick={() => toggleTalla(t)}>×</button>
                            </div>
                        ))}
                        {selectedTags.map(t => (
                            <div className="filter-tag" key={t}>
                                {tagTerms.find(tag => tag.slug === t)?.name || t}
                                <button onClick={() => toggleTag(t)}>×</button>
                            </div>
                        ))}
                        <button className="clear-all" onClick={clearFilters}>Limpiar todo</button>
                    </div>
                )}
            </div>

            {/* Grid de Productos */}
            <section className={`products-grid-container container-full ${loading ? 'loading' : ''}`}>
                {loading && (
                    <div className="loading-indicator">
                        <span className="spinner"></span> Cargando...
                    </div>
                )}
                {error && <div className="error-msg">{error}</div>}

                <div className="grid-wrapper">
                    {loading ? (
                        <div className="grid-loading-placeholder"></div>
                    ) : filteredProducts && filteredProducts.length > 0 ? (
                        <div className="grid-4x3">
                            {filteredProducts.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>
                    ) : !error && (
                        <div className="empty-state">
                            <div className="empty-icon">
                                <svg viewBox="0 0 24 24" width="48" height="48" stroke="#ccc" strokeWidth="1" fill="none">
                                    <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle>
                                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                                </svg>
                            </div>
                            <h2>No se encontraron productos</h2>
                            <p>Intenta ajustar tus filtros o selecciona una categoría diferente.</p>
                            <a href="/tienda" className="btn-outline">Ver toda la tienda</a>
                        </div>
                    )}
                </div>

                {/* Marcador para Infinite Scroll */}
                <div ref={observerTarget} style={{ height: '20px', margin: '20px 0' }}>
                    {loadingMore && (
                        <div className="loading-more">
                            <span className="spinner"></span> Cargando más productos...
                        </div>
                    )}
                </div>
            </section>

            {/* Drawer */}
            <div className={`filter-drawer-overlay ${isDrawerOpen ? 'active' : ''}`} onClick={() => setIsDrawerOpen(false)}></div>
            <div className={`filter-drawer ${isDrawerOpen ? 'active' : ''}`}>
                <div className="drawer-header">
                    <h3>Mostrar filtros</h3>
                    <button className="close-drawer" onClick={() => setIsDrawerOpen(false)}>
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="1.5" fill="none">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className="drawer-content">
                    {/* Categorías o Etiquetas dinámicas */}
                    {(subcategories.length > 0 || ((category.slug || "").toLowerCase().includes('accesorios') && tagTerms.length > 0)) && (
                        <div className={`filter-group-accordion ${openSections.categories ? 'open' : ''}`}>
                            <button className="accordion-header" onClick={() => toggleSection('categories')}>
                                {(category.slug || "").toLowerCase().includes('accesorios') ? 'Tipo de Producto' : 'Categorías'}
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.5" fill="none" className="arrow-icon">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                            <div className="accordion-body">
                                <ul className="checklist">
                                    {(category.slug || "").toLowerCase().includes('accesorios') ? (
                                        tagTerms.map(tag => (
                                            <li key={tag.slug}>
                                                <label className="checkbox-container">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedTags.includes(tag.slug)}
                                                        onChange={() => toggleTag(tag.slug)}
                                                    />
                                                    <span className="checkmark"></span>
                                                    <span className="label-text">{tag.name}</span>
                                                </label>
                                            </li>
                                        ))
                                    ) : (
                                        subcategories.map(cat => (
                                            <li key={cat.slug}>
                                                <label className="checkbox-container">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedSubcats.includes(cat.slug)}
                                                        onChange={() => toggleSubcat(cat.slug)}
                                                    />
                                                    <span className="checkmark"></span>
                                                    <span className="label-text">{cat.name}</span>
                                                </label>
                                            </li>
                                        ))
                                    )}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Colores (Checklist con Swatch) */}
                    {colorTerms.length > 0 && (
                        <div className={`filter-group-accordion ${openSections.color ? 'open' : ''}`}>
                            <button className="accordion-header" onClick={() => toggleSection('color')}>
                                Colores
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.5" fill="none" className="arrow-icon">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                            <div className="accordion-body">
                                <ul className="checklist grid-2">
                                    {colorTerms.map(term => (
                                        <li key={term.slug}>
                                            <label className="checkbox-container small">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedColors.includes(term.slug)}
                                                    onChange={() => toggleColor(term.slug)}
                                                />
                                                <span className="checkmark"></span>
                                                <div className="color-info">
                                                    <span className="color-circle" style={{ backgroundColor: getColorHex(term.slug), border: '1px solid #eee' }}></span>
                                                    <span className="label-text">{translateColor(term.name)}</span>
                                                </div>
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    {/* Tallas (Boxes) */}
                    {tallaTerms.length > 0 && (
                        <div className={`filter-group-accordion ${openSections.talla ? 'open' : ''}`}>
                            <button className="accordion-header" onClick={() => toggleSection('talla')}>
                                Tallas
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.5" fill="none" className="arrow-icon">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </button>
                            <div className="accordion-body">
                                <div className="talla-options">
                                    {tallaTerms.map(term => (
                                        <button
                                            key={term.slug}
                                            onClick={() => toggleTalla(term.slug)}
                                            className={`talla-box ${selectedTallas.includes(term.slug) ? 'active' : ''}`}
                                        >
                                            {term.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="drawer-footer-sticky">
                    <button className="btn-show-products" onClick={() => setIsDrawerOpen(false)}>
                        Mostrar productos
                    </button>
                    <button className="btn-clear-minimal" onClick={clearFilters}>Limpiar Filtros</button>
                </div>
            </div>

            <style>{`
                .filter-bar-container { width: 100%; border-bottom: 1px solid #eee; background: #fff; }
                .sticky-filters { position: sticky; top: 80px; z-index: 100; background: #fff; box-shadow: 0 5px 15px rgba(0,0,0,0.05); transition: top 0.3s ease-in-out; }
                .sticky-filters.is-hidden-top { top: 0; }
                .filter-bar { max-width: var(--container-max-width); margin: 0 auto; display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; position: relative; }
                .filter-left, .filter-right { display: flex; align-items: center; gap: 1rem; }
                
                .category-dropdown { position: relative; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; padding: 0.5rem 0; }
                .category-dropdown:hover .dropdown-icon { transform: rotate(180deg); }
                .category-dropdown:hover .dropdown-list { opacity: 1; visibility: visible; pointer-events: auto; }
                .current-category { font-family: var(--font-paragraphs); font-size: 0.8rem; font-weight: 500; letter-spacing: 1px; color: #121212; }
                .dropdown-icon { transition: transform 0.3s ease; }
                .dropdown-list { position: absolute; top: 100%; left: 0; background: #fff; list-style: none; padding: 0.5rem 0 1rem; margin: 0; min-width: 200px; max-height: 400px; overflow-y: auto; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08); border: 1px solid #e8e8e8; border-top: none; opacity: 0; visibility: hidden; pointer-events: none; transition: all 0.2s; z-index: 100; }
                .dropdown-list li { position: relative; }
                .dropdown-list li a { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 1.5rem; color: #666; text-decoration: none; font-family: var(--font-paragraphs); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px; transition: all 0.2s; }
                .dropdown-list li a:hover { color: var(--color-green, #155338); background-color: #f9f9f9; }
                
                .has-children > a::after { content: '›'; font-size: 1.2rem; line-height: 1; margin-left: 10px; color: #ccc; transition: transform 0.2s; }
                .has-children:hover > a::after { color: var(--color-green); transform: translateX(3px); }
                
                .has-children:hover > .sub-dropdown { opacity: 1; visibility: visible; pointer-events: auto; transform: translateX(0); }
                .sub-dropdown { 
                    position: absolute; 
                    top: -1px; 
                    left: 100%; 
                    background: #fff; 
                    list-style: none; 
                    padding: 0.5rem 0; 
                    margin: 0; 
                    min-width: 200px; 
                    box-shadow: 10px 10px 25px rgba(0, 0, 0, 0.08); 
                    border: 1px solid #e8e8e8; 
                    opacity: 0; 
                    visibility: hidden; 
                    pointer-events: none; 
                    transition: all 0.2s; 
                    transform: translateX(10px);
                    z-index: 101;
                }
                .sub-dropdown li a { padding: 0.5rem 1.5rem; font-size: 0.75rem; color: #777; text-transform: uppercase; letter-spacing: 1px; }
                .sub-dropdown li a:hover { background-color: #f5f5f5; color: #000; }

                .sort-dropdown { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 1rem; border: 1px solid #e0e0e0; cursor: pointer; position: relative; width: 240px; }
                .sort-dropdown:hover .sort-list { opacity: 1; visibility: visible; pointer-events: auto; }
                .sort-label { font-family: var(--font-paragraphs); font-size: 0.8rem; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
                .sort-list { position: absolute; top: calc(100% + 1px); right: -1px; background: #fff; list-style: none; padding: 0.5rem 0 1rem; margin: 0; width: calc(100% + 2px); box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08); border: 1px solid #e8e8e8; border-top: none; opacity: 0; visibility: hidden; pointer-events: none; transition: all 0.2s; z-index: 110; }
                .sort-list li button { width: 100%; text-align: left; background: none; border: none; display: block; padding: 0.6rem 1.5rem; color: #666; font-family: var(--font-paragraphs); font-size: 0.8rem; letter-spacing: 0.5px; transition: all 0.2s; cursor: pointer; }
                .sort-list li button:hover, .sort-list li button.active { color: var(--color-green, #155338); background-color: #f9f9f9; font-weight: 600; }

                .filter-btn { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1.2rem; background: transparent; border: 1px solid #e0e0e0; font-family: var(--font-paragraphs); font-size: 0.8rem; color: #333; cursor: pointer; transition: all 0.2s; }
                .filter-btn:hover { border-color: #121212; background: #f9f9f9; }

                .products-grid-container { position: relative; min-height: 400px; display: flex; flex-direction: column; }
                .grid-wrapper { flex-grow: 1; }
                .grid-loading-placeholder { height: 100%; min-height: 400px; width: 100%; }
                
                .loading-more {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    padding: 2rem;
                    font-family: var(--font-paragraphs);
                    color: #888;
                    font-size: 0.9rem;
                }

                .loading-indicator {
                    position: absolute;
                    top: 100px;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 10;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background: #fff;
                    padding: 12px 24px;
                    border: 1px solid #eee;
                    border-radius: 30px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.08);
                    font-family: var(--font-paragraphs);
                    font-size: 0.9rem;
                    color: var(--color-green, #155338);
                    animation: fadeInIndicator 0.3s ease;
                }
                
                .spinner {
                    width: 18px;
                    height: 18px;
                    border: 2px solid rgba(21, 83, 56, 0.2);
                    border-top-color: var(--color-green, #155338);
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }

                @keyframes fadeInIndicator { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
                @keyframes spin { 100% { transform: rotate(360deg); } }

                .loading { pointer-events: none; }
                
                .checklist { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.8rem; }
                .checklist.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem 0.5rem; }
                
                /* Checkbox Custom Styling */
                .checkbox-container { display: flex; align-items: center; gap: 1rem; cursor: pointer; font-size: 0.9rem; user-select: none; position: relative; }
                .checkbox-container.small { gap: 0.5rem; font-size: 0.8rem; }
                .checkbox-container input { display: none; }
                .checkmark { height: 18px; width: 18px; border: 1px solid #ddd; background-color: #fff; display: block; border-radius: 0; position: relative; flex-shrink: 0; }
                .checkbox-container input:checked ~ .checkmark { background-color: #000; border-color: #000; }
                .checkmark:after { content: ""; position: absolute; display: none; left: 6px; top: 2px; width: 5px; height: 10px; border: solid white; border-width: 0 2px 2px 0; transform: rotate(45deg); }
                .checkbox-container input:checked ~ .checkmark:after { display: block; }
                
                .color-info { display: flex; align-items: center; gap: 0.5rem; overflow: hidden; }
                .color-circle { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; }
                .label-text { font-family: var(--font-paragraphs); color: #444; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

                .talla-options { display: flex; flex-wrap: wrap; gap: 0.8rem; }
                .talla-box { min-width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; border: 1px solid #ddd; background: #fff; font-family: var(--font-paragraphs); font-size: 0.85rem; cursor: pointer; transition: all 0.2s; }
                .talla-box:hover { border-color: #000; }
                .talla-box.active { background: #000; color: #fff; border-color: #000; }

                .filter-group-accordion { border-bottom: 1px solid #eee; overflow: hidden; }
                .accordion-header { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 1.2rem 0; background: none; border: none; cursor: pointer; font-family: var(--font-titles); font-size: 1rem; color: #121212; text-transform: uppercase; letter-spacing: 0.5px; }
                .arrow-icon { transition: transform 0.3s ease; }
                .filter-group-accordion.open .arrow-icon { transform: rotate(180deg); }
                .accordion-body { max-height: 0; transition: max-height 0.4s cubic-bezier(0, 1, 0, 1); overflow: hidden; }
                .filter-group-accordion.open .accordion-body { max-height: 1000px; transition: max-height 0.4s ease-in; padding-bottom: 1.5rem; }

                .btn-show-products { width: 90%; padding: 1.2rem; background: var(--color-green, #155338); color: #fff; border: none; border-radius: 0; font-family: var(--font-titles); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; transition: all 0.2s; margin-bottom: 1rem; }
                .btn-show-products:hover { background: #0f3d29; }
                .btn-clear-minimal { background: none; border: none; text-decoration: underline; color: #888; font-size: 0.75rem; cursor: pointer; padding: 0.5rem;}
                
                .active-filters { max-width: var(--container-max-width); margin: 0 auto; padding: 0 2rem 1.5rem; display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: center; }
                .filter-tag { background: #f4f4f4; padding: 0.4rem 0.8rem; border-radius: 4px; font-size: 0.75rem; display: flex; align-items: center; gap: 0.5rem; font-family: var(--font-paragraphs); color: #333; }
                .filter-tag button { background: none; border: none; cursor: pointer; color: #999; font-size: 1.1rem; padding: 0; line-height: 1; }
                .clear-all { font-family: var(--font-paragraphs); font-size: 0.75rem; color: #888; text-decoration: underline; margin-left: 0.5rem; cursor: pointer; background: none; border: none; }
                
                .drawer-footer-sticky{ padding: 1.5rem 2rem; border-top: 1px solid #eee; display: flex; flex-direction: column; align-items: center; }
                
                .grid-4x3 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; width: 100%; }
                
                @media (max-width: 1200px) { .grid-4x3 { grid-template-columns: repeat(3, 1fr); } }
                @media (max-width: 768px) {
                    .filter-bar { flex-direction: column; gap: 1.5rem; align-items: flex-start; }
                    .filter-right { width: 100%; justify-content: space-between; }
                    .grid-4x3 { grid-template-columns: repeat(2, 1fr); }
                }

                /* Drawer Styles */
                .filter-drawer-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.4);
                    z-index: 9998;
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.4s ease;
                    pointer-events: none;
                }

                .filter-drawer-overlay.active {
                    opacity: 1;
                    visibility: visible;
                    pointer-events: auto;
                }

                .filter-drawer {
                    position: fixed;
                    top: 0;
                    right: -400px;
                    width: 400px;
                    height: 100%;
                    background: #fff;
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    transition: right 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
                    box-shadow: -10px 0 30px rgba(0, 0, 0, 0.1);
                    pointer-events: auto;
                }

                .filter-drawer.active {
                    right: 0;
                }

                .drawer-header {
                    padding: 1.5rem 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #eee;
                }

                .drawer-header h3 {
                    font-family: var(--font-titles);
                    font-size: 1.25rem;
                    color: var(--color-green);
                    margin: 0;
                }

                .close-drawer {
                    background: none;
                    border: none;
                    font-size: 2rem;
                    cursor: pointer;
                    padding: 0;
                    line-height: 1;
                    color: #888;
                }

                .drawer-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 2rem;
                }

                @media (max-width: 480px) {
                    .filter-drawer {
                        width: 100%;
                        right: -100%;
                    }
                }
            `}</style>
        </>
    );
};

const COLOR_TRANSLATIONS: Record<string, string> = {
    'black': 'Negro', 'brown': 'Café', 'beige': 'Beige', 'blue': 'Azul', 'white': 'Blanco', 'red': 'Rojo', 'green': 'Verde', 'yellow': 'Amarillo', 'gray': 'Gris', 'grey': 'Gris', 'navy': 'Azul Noche', 'tan': 'Canela', 'honey': 'Miel', 'tobacco': 'Tabaco'
};

function translateColor(text: string | undefined): string {
    if (!text) return "";
    return COLOR_TRANSLATIONS[text.toLowerCase()] || text;
}

function getColorHex(slug: string | undefined): string {
    if (!slug) return "#ddd";
    const s = slug.toLowerCase();
    const colors: Record<string, string> = {
        'negro': '#121212', 'black': '#121212',
        'cafe': '#6F4E37', 'café': '#6F4E37', 'marron': '#6F4E37', 'marrón': '#6F4E37', 'brown': '#6F4E37', 'chocolate': '#3E2723',
        'miel': '#D4A373', 'honey': '#D4A373',
        'azul': '#1B3F8B', 'blue': '#1B3F8B', 'marino': '#000080',
        'verde': '#155338', 'green': '#155338',
        'vino': '#722F37', 'vinotinto': '#722F37', 'burgundy': '#722F37',
        'tabaco': '#8B5A2B', 'tobacco': '#8B5A2B',
        'cognac': '#9A463D',
        'rojo': '#C41E3A', 'red': '#C41E3A',
        'blanco': '#FFFFFF', 'white': '#FFFFFF',
        'gris': '#888888', 'gray': '#888888',
        'beige': '#F5F5DC', 'arena': '#E2CBA4',
        'tan': '#D2B48C', 'camel': '#C19A6B',
        'rosa': '#E91E63', 'pink': '#E91E63',
        'mostaza': '#E1AD01', 'mustard': '#E1AD01',
        'morado': '#9C27B0', 'purple': '#9C27B0', 'violeta': '#7B1FA2',
        'naranja': '#FF6600', 'orange': '#FF6600', 'naranaja': '#FF6600'
    };

    if (colors[s]) return colors[s];
    const noDash = s.replace(/-/g, '');
    if (colors[noDash]) return colors[noDash];

    // Intento de detección por palabras clave en nombres compuestos
    if (s.includes('negro')) return colors['negro'];
    if (s.includes('cafe')) return colors['cafe'];
    if (s.includes('café')) return colors['café'];
    if (s.includes('marron') || s.includes('marrón')) return colors['marron'];
    if (s.includes('azul')) return colors['azul'];
    if (s.includes('miel')) return colors['miel'];
    if (s.includes('tabaco')) return colors['tabaco'];
    if (s.includes('verde')) return colors['verde'];
    if (s.includes('rojo')) return colors['rojo'];
    if (s.includes('blanco')) return colors['blanco'];
    if (s.includes('gris')) return colors['gris'];
    if (s.includes('vino')) return colors['vino'];
    if (s.includes('chocolate')) return colors['chocolate'];
    if (s.includes('rosa')) return colors['rosa'];
    if (s.includes('mostaza')) return colors['mostaza'];
    if (s.includes('morado')) return colors['morado'];
    if (s.includes('purple')) return colors['morado'];
    if (s.includes('naranja')) return colors['naranja'];
    if (s.includes('orange')) return colors['naranja'];

    return '#ddd';
}

export default FilteredProductList;
