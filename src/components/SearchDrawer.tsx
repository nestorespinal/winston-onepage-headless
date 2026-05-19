import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { isSearchOpen } from '../store/cart';

const SearchDrawer: React.FC = () => {
    const $isSearchOpen = useStore(isSearchOpen);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if ($isSearchOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [$isSearchOpen]);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length > 1) {
                setLoading(true);
                try {
                    const res = await fetch(`/api/products?search=${encodeURIComponent(query)}&per_page=10`);
                    if (res.ok) {
                        const data = await res.json();
                        setResults(data);
                    }
                } catch (err) {
                    console.error("Search error:", err);
                } finally {
                    setLoading(false);
                }
            } else {
                setResults([]);
            }
        }, 600);

        return () => clearTimeout(timer);
    }, [query]);

    const handleClose = () => {
        isSearchOpen.set(false);
        setQuery('');
        setResults([]);
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            window.location.href = `/buscar?s=${encodeURIComponent(query.trim())}`;
        }
    };

    if (!$isSearchOpen) return null;

    return (
        <>
            <div className={`search-overlay ${$isSearchOpen ? 'active' : ''}`} onClick={handleClose} />
            <div className={`search-drawer ${$isSearchOpen ? 'active' : ''}`}>
                <div className="search-container">
                    <div className="search-header">
                        <form onSubmit={handleSearchSubmit} className="search-form">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="1.2" fill="none">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="BUSCAR PRODUCTOS..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="search-input"
                            />
                        </form>
                        <button className="close-search" onClick={handleClose}>
                            <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="1.2" fill="none">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>

                    <div className="search-results-container">
                        {loading && (
                            <div className="search-loading">
                                <span className="spinner"></span> Buscando...
                            </div>
                        )}

                        {!loading && results.length > 0 && (
                            <div className="search-results-grid">
                                {results.map((product) => (
                                    <a key={product.id} href={`/productos/${product.slug}`} className="search-result-item">
                                        <div className="result-img">
                                            <img src={product.images[0]?.src} alt={product.name} />
                                        </div>
                                        <div className="result-info">
                                            <h4>{product.name}</h4>
                                            <p className="result-price">
                                                ${parseInt(product.prices.price).toLocaleString('es-CO')}
                                            </p>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        )}

                        {query.length > 2 && !loading && results.length === 0 && (
                            <div className="search-empty">
                                <p>No se encontraron resultados para "{query}"</p>
                            </div>
                        )}

                        {query.length === 0 && (
                            <div className="search-suggestions">
                                <h5>Sugerencias</h5>
                                <ul>
                                    <li><a href="/buscar?s=ropa">Ropa</a></li>
                                    <li><a href="/buscar?s=mocasines">Mocasines</a></li>
                                    <li><a href="/buscar?s=botas">Botas</a></li>
                                    <li><a href="/buscar?s=maletas">Maletas</a></li>
                                </ul>
                            </div>
                        )}
                    </div>

                    {results.length > 0 && (
                        <a href={`/buscar?s=${encodeURIComponent(query)}`} className="view-all-results" onClick={handleClose}>
                            VER TODOS LOS RESULTADOS
                        </a>
                    )}
                </div>
            </div>

            <style>{`
                .search-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(4px);
                    z-index: 10000;
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.4s ease;
                }
                .search-overlay.active {
                    opacity: 1;
                    visibility: visible;
                }
                .search-drawer {
                    position: fixed;
                    top: 0;
                    right: 0;
                    width: 450px;
                    height: 100%;
                    background: #fff;
                    z-index: 10001;
                    transform: translateX(100%);
                    transition: transform 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
                    box-shadow: -10px 0 30px rgba(0,0,0,0.1);
                }
                .search-drawer.active {
                    transform: translateX(0);
                }
                @media (max-width: 500px) {
                    .search-drawer { width: 100%; }
                }

                .search-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    padding: 2rem;
                }

                .search-header {
                    display: flex;
                    align-items: center;
                    gap: 1.5rem;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 1rem;
                    margin-bottom: 2rem;
                }

                .search-form {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                }

                .search-input {
                    flex: 1;
                    border: none;
                    background: none;
                    font-family: var(--font-titles);
                    font-size: 0.9rem;
                    letter-spacing: 2px;
                    outline: none;
                    color: #121212;
                }

                .close-search {
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: #666;
                    padding: 0;
                    transition: transform 0.3s;
                }
                .close-search:hover { transform: rotate(90deg); color: #000; }

                .search-results-container {
                    flex: 1;
                    overflow-y: auto;
                }

                .search-loading {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 1rem;
                    color: #888;
                    padding: 2rem;
                }

                .search-results-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }

                .search-result-item {
                    display: flex;
                    gap: 1.5rem;
                    text-decoration: none;
                    align-items: center;
                    transition: opacity 0.3s;
                }
                .search-result-item:hover { opacity: 0.7; }

                .result-img {
                    width: 80px;
                    height: 80px;
                    background: #f9f9f9;
                    flex-shrink: 0;
                }
                .result-img img { width: 100%; height: 100%; object-fit: cover; }

                .result-info h4 {
                    margin: 0 0 0.4rem 0;
                    font-family: var(--font-titles);
                    font-size: 0.8rem;
                    letter-spacing: 1px;
                    color: #121212;
                    text-transform: uppercase;
                }
                .result-price {
                    margin: 0;
                    font-family: var(--font-paragraphs);
                    font-size: 0.85rem;
                    color: #666;
                }

                .view-all-results {
                    display: block;
                    padding: 1.2rem;
                    background: var(--color-green, #121212);
                    color: #fff;
                    text-align: center;
                    font-family: var(--font-titles);
                    font-size: 0.75rem;
                    letter-spacing: 2px;
                    text-decoration: none;
                    transition: background 0.3s;
                    margin-top: 1.5rem;
                    flex-shrink: 0;
                }
                .view-all-results:hover { background: #333; }

                .search-suggestions {
                    margin-top: 1rem;
                }
                .search-suggestions h5 {
                    font-family: var(--font-titles);
                    font-size: 0.75rem;
                    letter-spacing: 1.5px;
                    color: #888;
                    text-transform: uppercase;
                    margin-bottom: 1rem;
                }
                .search-suggestions ul { list-style: none; padding: 0; margin: 0; }
                .search-suggestions li { margin-bottom: 0.8rem; }
                .search-suggestions a {
                    text-decoration: none;
                    color: #121212;
                    font-family: var(--font-paragraphs);
                    font-size: 0.9rem;
                    transition: color 0.3s;
                }
                .search-suggestions a:hover { color: #666; }

                .spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid #eee;
                    border-top-color: #121212;
                    border-radius: 50%;
                    animation: spin 0.8s linear infinite;
                }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </>
    );
};

export default SearchDrawer;
