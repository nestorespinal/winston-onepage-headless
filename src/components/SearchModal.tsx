import React, { useState, useEffect, useRef, useCallback } from 'react';

interface SearchResult {
    id: number;
    name: string;
    slug: string;
    price: string;
    regular_price: string;
    on_sale: boolean;
    image: string;
    categories: { id: number; name: string; slug: string }[];
}

function formatPrice(price: string): string {
    const num = parseInt(price, 10);
    if (isNaN(num) || num === 0) return '';
    return '$' + num.toLocaleString('es-CO');
}

const SearchModal: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Escuchar eventos del DOM para abrir/cerrar el modal
    useEffect(() => {
        const handleOpen = () => setIsOpen(true);
        const handleClose = () => setIsOpen(false);
        window.addEventListener('open-search', handleOpen);
        window.addEventListener('close-search', handleClose);
        return () => {
            window.removeEventListener('open-search', handleOpen);
            window.removeEventListener('close-search', handleClose);
        };
    }, []);

    // Focus input on open, reset on close
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            // pequeño delay para no ver el flash de reset mientras cierra
            setTimeout(() => {
                setQuery('');
                setResults([]);
                setSearched(false);
            }, 300);
        }
    }, [isOpen]);

    // Close on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) setIsOpen(false);
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [isOpen]);

    // Prevent body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    const doSearch = useCallback(async (q: string) => {
        if (q.length < 2) {
            setResults([]);
            setSearched(false);
            return;
        }
        setLoading(true);
        setSearched(false);
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&per_page=10`);
            if (!res.ok) throw new Error('Error en búsqueda');
            const data = await res.json();
            setResults(Array.isArray(data) ? data : []);
        } catch (e) {
            setResults([]);
        } finally {
            setLoading(false);
            setSearched(true);
        }
    }, []);

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            doSearch(val.trim());
        }, 380);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            // Al dar enter, redirigimos a la página de búsqueda completa
            window.location.href = `/buscar?s=${encodeURIComponent(query.trim())}`;
            close();
        } else {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            doSearch(query.trim());
        }
    };

    const close = () => setIsOpen(false);

    if (!isOpen) return null;

    return (
        <>
            {/* Overlay */}
            <div className="search-overlay" onClick={close} aria-hidden="true" />

            {/* Panel */}
            <div className="search-panel" role="dialog" aria-modal="true" aria-label="Buscador">
                {/* Header del modal */}
                <div className="search-panel-header">
                    <form className="search-form" onSubmit={handleSubmit} role="search">
                        <svg className="search-icon-input" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        <input
                            ref={inputRef}
                            id="search-input"
                            type="search"
                            className="search-input"
                            placeholder="Buscar productos..."
                            value={query}
                            onChange={handleInput}
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="Buscar productos"
                            aria-autocomplete="list"
                            aria-controls="search-results-list"
                        />
                        {loading && <span className="search-spinner" aria-hidden="true" />}
                        {query && !loading && (
                            <button
                                type="button"
                                className="search-clear-btn"
                                onClick={() => { setQuery(''); setResults([]); setSearched(false); inputRef.current?.focus(); }}
                                aria-label="Limpiar búsqueda"
                            >
                                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="1.5" fill="none">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        )}
                    </form>
                    <button className="search-close-btn" onClick={close} aria-label="Cerrar buscador">
                        <span className="esc-label">ESC</span>
                        <svg className="close-icon" viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.5" fill="none">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {/* Resultados */}
                <div className="search-panel-body" id="search-results-list" role="status" aria-live="polite">
                    {/* Estado inicial: sugerencias populares */}
                    {!query && !searched && (
                        <div className="search-initial">
                            <p className="search-hint-title">Búsquedas populares</p>
                            <div className="search-suggestions">
                                {['Zapatos', 'Mocasín', 'Oxford', 'Maletín', 'Billetera', 'Cinturón'].map(s => (
                                    <button
                                        key={s}
                                        className="search-suggestion-tag"
                                        onClick={() => { setQuery(s); doSearch(s); }}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Sin resultados */}
                    {searched && !loading && results.length === 0 && (
                        <div className="search-empty">
                            <svg viewBox="0 0 24 24" width="40" height="40" stroke="#ccc" strokeWidth="1" fill="none">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <p>No encontramos resultados para <strong>"{query}"</strong></p>
                            <span>Intenta con otro término o revisa la ortografía</span>
                        </div>
                    )}

                    {/* Lista de resultados */}
                    {results.length > 0 && (
                        <ul className="search-results">
                            {results.map(product => (
                                <li key={product.id} className="search-result-item">
                                    <a href={`/productos/${product.slug}`} className="search-result-link" onClick={close}>
                                        <div className="search-result-img">
                                            {product.image ? (
                                                <img src={product.image} alt={product.name} width="64" height="64" loading="lazy" />
                                            ) : (
                                                <div className="search-result-img-placeholder">
                                                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="#ccc" strokeWidth="1" fill="none">
                                                        <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                                                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                                        <polyline points="21 15 16 10 5 21"></polyline>
                                                    </svg>
                                                </div>
                                            )}
                                        </div>
                                        <div className="search-result-info">
                                            <span className="search-result-name">{product.name}</span>
                                            {product.categories.length > 0 && (
                                                <span className="search-result-cat">{product.categories[0].name}</span>
                                            )}
                                            <div className="search-result-price">
                                                {product.on_sale && product.regular_price && product.regular_price !== product.price ? (
                                                    <>
                                                        <span className="price-sale">{formatPrice(product.price)}</span>
                                                        <span className="price-regular-crossed">{formatPrice(product.regular_price)}</span>
                                                    </>
                                                ) : (
                                                    <span className="price-normal">{formatPrice(product.price)}</span>
                                                )}
                                            </div>
                                        </div>
                                        <svg className="search-result-arrow" viewBox="0 0 24 24" width="16" height="16" stroke="#ccc" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="9 18 15 12 9 6"></polyline>
                                        </svg>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Footer */}
                {results.length > 0 && query && (
                    <div className="search-panel-footer">
                        <a href={`/buscar?s=${encodeURIComponent(query)}`} className="search-see-all" onClick={close}>

                            Ver todos los resultados para <strong>"{query}"</strong>
                            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                                <polyline points="12 5 19 12 12 19"></polyline>
                            </svg>
                        </a>
                    </div>
                )}
            </div>

            <style>{`
                .search-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.45);
                    backdrop-filter: blur(4px);
                    z-index: 2000;
                    animation: fadeInOverlay 0.2s ease;
                }
                @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }

                .search-panel {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    z-index: 2001;
                    background: #fff;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                    animation: slideDownPanel 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
                }
                @keyframes slideDownPanel {
                    from { transform: translateY(-20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }

                .search-panel-header {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 1.5rem 2.5rem;
                    border-bottom: 1px solid #f0f0f0;
                }

                .search-form {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 0.8rem;
                    background: #f7f7f7;
                    padding: 0.8rem 1.2rem;
                    border: 1px solid #ebebeb;
                }

                .search-icon-input { color: #999; flex-shrink: 0; }

                .search-input {
                    flex: 1;
                    border: none;
                    background: transparent;
                    font-size: 1rem;
                    font-family: var(--font-paragraphs, sans-serif);
                    color: #121212;
                    outline: none;
                    min-width: 0;
                }
                .search-input::placeholder { color: #aaa; }
                .search-input::-webkit-search-cancel-button { display: none; }
                .search-input::-ms-clear { display: none; }

                .search-spinner {
                    width: 18px;
                    height: 18px;
                    border: 2px solid rgba(21, 83, 56, 0.2);
                    border-top-color: var(--color-green, #155338);
                    border-radius: 50%;
                    animation: spin 0.7s linear infinite;
                    flex-shrink: 0;
                }
                @keyframes spin { 100% { transform: rotate(360deg); } }

                .search-clear-btn {
                    background: none; border: none; cursor: pointer;
                    color: #aaa; padding: 0; display: flex; align-items: center;
                    transition: color 0.2s; flex-shrink: 0;
                }
                .search-clear-btn:hover { color: #555; }

                .search-close-btn {
                    background: none;
                    border: 1px solid #ddd;
                    cursor: pointer;
                    padding: 0.4rem 0.8rem;
                    font-family: var(--font-paragraphs, sans-serif);
                    font-size: 0.7rem;
                    color: #888;
                    letter-spacing: 1px;
                    transition: all 0.2s;
                    flex-shrink: 0;
                    display: flex;
                    align-items: center;
                    gap: 0.4rem;
                }
                .search-close-btn:hover { border-color: #888; color: #333; }
                .close-icon { display: none; }

                .search-panel-body {
                    flex: 1;
                    overflow-y: auto;
                    padding: 1.5rem 2.5rem;
                    max-height: calc(90vh - 80px - 60px);
                }

                .search-initial { padding: 0.5rem 0; }
                .search-hint-title {
                    font-family: var(--font-paragraphs, sans-serif);
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    color: #999;
                    margin-bottom: 1rem;
                }
                .search-suggestions { display: flex; flex-wrap: wrap; gap: 0.6rem; }
                .search-suggestion-tag {
                    background: #f4f4f4;
                    border: 1px solid #e8e8e8;
                    padding: 0.4rem 1rem;
                    font-family: var(--font-paragraphs, sans-serif);
                    font-size: 0.8rem;
                    color: #555;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .search-suggestion-tag:hover { border-color: #121212; color: #121212; background: #fff; }

                .search-empty {
                    display: flex; flex-direction: column; align-items: center;
                    text-align: center; padding: 3rem 1rem; gap: 0.8rem;
                }
                .search-empty p { font-family: var(--font-paragraphs, sans-serif); font-size: 1rem; color: #333; margin: 0; }
                .search-empty span { font-family: var(--font-paragraphs, sans-serif); font-size: 0.85rem; color: #999; }

                .search-results { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; }
                .search-result-item { border-bottom: 1px solid #f4f4f4; }
                .search-result-item:last-child { border-bottom: none; }

                .search-result-link {
                    display: flex; align-items: center; gap: 1rem;
                    padding: 0.9rem 0; text-decoration: none; color: inherit;
                    transition: background 0.15s;
                }
                .search-result-link:hover { background: #fafafa; }
                .search-result-link:hover .search-result-arrow { color: #121212; }

                .search-result-img {
                    width: 64px; height: 64px; flex-shrink: 0;
                    background: #f6f6f6; overflow: hidden;
                    display: flex; align-items: center; justify-content: center;
                }
                .search-result-img img { width: 100%; height: 100%; object-fit: cover; }
                .search-result-img-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }

                .search-result-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
                .search-result-name {
                    font-family: var(--font-products, sans-serif);
                    font-size: 0.9rem; color: #121212;
                    text-transform: uppercase; letter-spacing: 0.5px;
                    font-weight: 400; white-space: nowrap;
                    overflow: hidden; text-overflow: ellipsis;
                }
                .search-result-cat {
                    font-family: var(--font-paragraphs, sans-serif);
                    font-size: 0.72rem; color: #999;
                    text-transform: uppercase; letter-spacing: 1px;
                }
                .search-result-price { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.2rem; }
                .price-normal, .price-sale {
                    font-family: var(--font-paragraphs, sans-serif);
                    font-size: 0.9rem; color: #121212; font-weight: 500;
                }
                .price-sale { color: var(--color-green, #155338); }
                .price-regular-crossed {
                    font-family: var(--font-paragraphs, sans-serif);
                    font-size: 0.8rem; color: #bbb; text-decoration: line-through;
                }
                .search-result-arrow { flex-shrink: 0; transition: color 0.2s; }

                .search-panel-footer { padding: 1rem 2.5rem; border-top: 1px solid #f0f0f0; }
                .search-see-all {
                    display: flex; align-items: center; gap: 0.5rem;
                    font-family: var(--font-paragraphs, sans-serif);
                    font-size: 0.82rem; color: var(--color-green, #155338);
                    text-decoration: none; transition: gap 0.2s;
                }
                .search-see-all:hover { gap: 0.8rem; }
                .search-see-all strong { font-weight: 600; }

                @media (max-width: 768px) {
                    .search-panel-header { padding: 1rem 1.2rem; }
                    .search-panel-body { padding: 1rem 1.2rem; }
                    .search-panel-footer { padding: 0.8rem 1.2rem; }
                    .search-form { padding: 0.7rem 1rem; }
                    .esc-label { display: none; }
                    .close-icon { display: block; }
                    .search-close-btn { border: none; padding: 0.4rem; }
                }
            `}</style>
        </>
    );
};

export default SearchModal;
