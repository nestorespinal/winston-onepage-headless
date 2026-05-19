import { useState, useEffect, useRef } from 'react';

interface Review {
    id: number;
    reviewer: string;
    review: string;
    rating: number;
    product_name: string;
    product_slug?: string;
    product_image?: {
        src: string;
        alt: string;
    };
    formatted_date_created: string;
}

export default function ReviewsSection() {
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isMobile, setIsMobile] = useState(false);
    const sliderRef = useRef<HTMLDivElement>(null);
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const [isPaused, setIsPaused] = useState(false);

    const minSwipeDistance = 50;

    useEffect(() => {
        const fetchReviews = async () => {
            try {
                // SWR: Primero intentamos cargar de localStorage para carga instantánea
                const localData = localStorage.getItem('wh_cached_reviews');
                if (localData) {
                    try {
                        const parsed = JSON.parse(localData);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            setReviews(parsed);
                            setLoading(false); // Ya tenemos algo que mostrar
                        }
                    } catch (e) {
                        console.error("Error parsing local reviews:", e);
                    }
                }

                const res = await fetch('/api/reviews');
                if (res.ok) {
                    const data = await res.json();
                    setReviews(data);
                    // Guardar en local para la próxima vez
                    localStorage.setItem('wh_cached_reviews', JSON.stringify(data));
                }
            } catch (e) {
                console.error("Error fetching reviews:", e);
            } finally {
                setLoading(false);
            }
        };

        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };

        fetchReviews();
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Autoplay logic
    useEffect(() => {
        if (loading || reviews.length === 0 || isPaused) return;

        const interval = setInterval(() => {
            nextSlide();
        }, 5000);

        return () => clearInterval(interval);
    }, [loading, reviews.length, isPaused, currentIndex]);

    const nextSlide = () => {
        if (reviews.length === 0) return;
        const perPage = isMobile ? 1 : 3;
        const maxIndex = Math.max(0, reviews.length - perPage);
        setCurrentIndex(prev => (prev >= maxIndex ? 0 : prev + 1));
    };

    const prevSlide = () => {
        if (reviews.length === 0) return;
        const perPage = isMobile ? 1 : 3;
        const maxIndex = Math.max(0, reviews.length - perPage);
        setCurrentIndex(prev => (prev <= 0 ? maxIndex : prev - 1));
    };

    // Touch handlers
    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > 50;
        const isRightSwipe = distance < -50;

        if (isLeftSwipe) {
            nextSlide();
        } else if (isRightSwipe) {
            prevSlide();
        }
    };

    const perPage = isMobile ? 1 : 3;
    const translateX = currentIndex * (100 / perPage);

    return (
        <section className={`reviews-section ${loading ? 'is-loading' : 'is-ready'}`}>
            <div className="container-reviews">
                <div className="section-header">
                    <h2>Lo que dicen quienes eligieron<br />Winston & Harry</h2>
                </div>

                <div
                    className="slider-container"
                    onMouseEnter={() => setIsPaused(true)}
                    onMouseLeave={() => setIsPaused(false)}
                >
                    {loading ? (
                        <div className="reviews-placeholder">
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <>
                            <button className="nav-btn prev" onClick={prevSlide} aria-label="Previous">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
                            </button>

                            <div
                                className="slider-viewport"
                                ref={sliderRef}
                                onTouchStart={onTouchStart}
                                onTouchMove={onTouchMove}
                                onTouchEnd={onTouchEnd}
                            >
                                <div
                                    className="slider-track"
                                    style={{ transform: `translateX(-${translateX}%)` }}
                                >
                                    {reviews.map((review) => (
                                        <div key={review.id} className="review-card-wrapper fade-in">
                                            <div className="review-card">
                                                <div className="card-left">
                                                    <h3 className="reviewer-name">{review.reviewer}</h3>
                                                    <div
                                                        className="review-text"
                                                        dangerouslySetInnerHTML={{ __html: review.review }}
                                                    />
                                                </div>

                                                <div className="card-right">
                                                    <div className="stars">
                                                        {[...Array(5)].map((_, i) => (
                                                            <span key={i} className={`star ${i < review.rating ? 'filled' : ''}`}>★</span>
                                                        ))}
                                                    </div>

                                                    <div className="product-info-column">
                                                        <span className="valoro-label">VALORÓ</span>
                                                        <a
                                                            href={review.product_slug ? `/productos/${review.product_slug}` : '#'}
                                                            className="product-link"
                                                        >
                                                            {review.product_image && (
                                                                <img
                                                                    src={review.product_image.src}
                                                                    alt={review.product_image.alt || review.product_name}
                                                                    className="product-thumb"
                                                                    referrerPolicy="no-referrer"
                                                                    onError={(e) => {
                                                                        const target = e.target as HTMLImageElement;
                                                                        target.onerror = null;
                                                                        let currentSrc = target.src;
                                                                        if (currentSrc.toLowerCase().endsWith('.webp')) {
                                                                            const fallback = currentSrc.replace(/\.webp$/i, '');
                                                                            if (fallback !== currentSrc) {
                                                                                target.src = fallback;
                                                                                return;
                                                                            }
                                                                        }
                                                                        const cleanSrc = currentSrc.replace(/-e\d+(?=\.(jpg|jpeg|png))/i, '');
                                                                        if (cleanSrc !== target.src) {
                                                                            target.src = cleanSrc;
                                                                        } else {
                                                                            target.src = 'https://via.placeholder.com/300?text=Winston+%26+Harry';
                                                                        }
                                                                    }}
                                                                />
                                                            )}
                                                            <span className="product-name">{review.product_name}</span>
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <button className="nav-btn next" onClick={nextSlide} aria-label="Next">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                            </button>
                        </>
                    )}
                </div>
            </div>

            <style>{`
                .reviews-section {
                    padding: 4rem;
                    background-color: #fff;
                    overflow: hidden;
                    width: 100%;
                }

                .container-reviews {
                    max-width: 1440px;
                    margin: 0 auto;
                    padding: 0 0rem;
                }

                .section-header {
                    text-align: center;
                    margin-bottom: 2rem;
                    max-width: 800px;
                    margin-left: auto;
                    margin-right: auto;
                }

                .section-header h2 {
                    color: var(--color-green);
                    font-size: 1.25rem;
                    margin-bottom: 0px;
                    letter-spacing: 2px;
                    font-family: var(--font-titles);
                    font-weight: 700;
                    line-height: 1.2;
                    text-transform: uppercase;
                    }

                .slider-container {
                    position: relative;
                    display: flex;
                    align-items: center;
                }

                /* Edge Fade Effects for Desktop */
                @media (min-width: 1024px) {
                    .slider-container::before,
                    .slider-container::after {
                        content: '';
                        position: absolute;
                        top: 0;
                        bottom: 0;
                        width: 150px;
                        z-index: 5;
                        pointer-events: none;
                        transition: opacity 0.3s;
                    }

                    .slider-container::before {
                        left: -20px;
                        background: linear-gradient(to right, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%);
                    }

                    .slider-container::after {
                        right: -20px;
                        background: linear-gradient(to left, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%);
                    }
                }

                .slider-viewport {
                    overflow: hidden; /* Mantener oculto para que el track no se salga del layout */
                    width: 100%;
                }

                .slider-track {
                    display: flex;
                    transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
                    width: 100%;
                    align-items: stretch; /* Por defecto estirar en desktop */
                }

                .review-card-wrapper {
                    flex: 0 0 33.333%; /* 3 cards per view for more width */
                    padding: 0 0.5rem;
                }

                @media (max-width: 1200px) {
                    .review-card-wrapper { flex: 0 0 50%; }
                }

                @media (max-width: 768px) {
                    .slider-track {
                        align-items: center; /* En móvil permitir que cada una tenga su altura */
                    }
                    .review-card-wrapper { flex: 0 0 100%; }
                    .container-reviews { padding: 0 0rem; }
                    .reviews-section { padding: 4rem 2rem; }
                    .review-card {
                        background: #F5F5F5;
                        padding: 1.5rem;
                        height: auto;
                        display: flex;
                        flex-direction: column !important;
                        gap: 1rem !important;
                        box-shadow: none;
                        border: none;
                        border-radius: 12px;
                        align-items: center;
                        text-align: center;
                    }
                    .product-info-column {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        width: 100% !important;
                    }
                    .product-thumb {
                        width: 150px !important;
                        height: 150px !important;
                        margin-bottom: 0.5rem;
                    }
                    .card-right {
                        width: 150px;
                    }
                    .nav-btn.next {
                        right: 5px;
                        transform: scale(0.6) translateY(-50%);
                    }
                    .nav-btn.prev {
                        left: 5px;
                        transform: scale(0.6) translateY(-50%);
                    }
                    .review-text {
                        -webkit-line-clamp: unset;
                        overflow: visible;
                    }
                    .section-header h2 {
                        color: var(--color-green);
                        font-size: 1.25rem;
                        margin-bottom: 0px;
                        letter-spacing: 2px;
                        font-family: var(--font-titles);
                        font-weight: 700;
                        line-height: 1.2;
                        text-transform: uppercase;
                    }
                }

                .review-card {
                    background: #F5F5F5;
                    padding: 1rem 2rem;
                    height: 100%;
                    display: flex;
                    flex-direction: row;
                    justify-content: space-between;
                    gap: 1.5rem;
                    box-shadow: none;
                    border: none;
                    border-radius: 12px;
                }

                .card-left {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    text-align: left;
                    justify-content: center;
                }

                .card-right {
                    width: 110px;
                    flex-shrink: 0;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    text-align: center;
                }

                .reviewer-name {
                    font-family: var(--font-titles);
                    font-size: 0.9rem;
                    color: var(--color-green);
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                    font-weight: 700;
                    margin: 0 0 1.5rem 0;
                    line-height: 1.3;
                }

                .review-text {
                    font-size: 0.82rem;
                    color: #555;
                    line-height: 1.7;
                    display: -webkit-box;
                    -webkit-line-clamp: 8;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                    font-family: var(--font-paragraphs);
                }
                
                .review-text p { margin: 0; }

                .stars {
                    color: #B1915F;
                    font-size: 1.5rem;
                    display: flex;
                    gap: 0px;
                    white-space: nowrap;
                    opacity: 0.8;
                    margin-bottom: 0.5rem;
                }

                .product-info-column {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    width: 100%;
                }

                .product-link {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-decoration: none;
                    transition: all 0.3s ease;
                    width: 100%;
                }

                .product-link:hover {
                    transform: translateY(-5px);
                }

                .product-link:hover .product-name {
                    color: var(--color-green);
                }

                .valoro-label {
                    font-size: 0.8rem;
                    color: var(--color-green);
                    font-weight: 800;
                    letter-spacing: 1px;
                    text-transform: uppercase;
                    margin-bottom: 0.5rem;
                    display: block;
                }

                .product-thumb {
                    width: 120px;
                    height: 120px;
                    object-fit: cover;
                    background-color: #fff;
                    border-radius: 2px;
                    margin-bottom: 0.8rem;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
                }

                .product-name {
                    font-size: 0.7rem;
                    font-weight: 700;
                    color: #555;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    line-height: 1.3;
                    transition: color 0.3s ease;
                }

                @media (max-width: 480px) {
                    .review-card { 
                        padding: 1.5rem; 
                    }
                    .card-left {
                        padding-right: 0;
                    }
                    .card-right {
                        width: 150px;
                    }
                    .product-thumb {
                        width: 75px;
                        height: 75px;
                    }
                }

                .nav-btn {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    background: transparent;
                    border: none;
                    color: #A98B68;
                    cursor: pointer;
                    z-index: 10;
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.3s;
                }

                .nav-btn:hover {
                    color: var(--color-green);
                    transform: translateY(-50%) scale(1.1);
                }

                .nav-btn.prev { left: -50px; }
                .nav-btn.next { right: -50px; }

                @media (max-width: 1400px) {
                    .nav-btn.prev { left: -10px; }
                    .nav-btn.next { right: -10px; }
                    .nav-btn { background: rgba(255,255,255,0.8); border-radius: 50%; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                }

                .loading {
                    height: 400px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(21, 83, 56, 0.1);
                    border-left-color: var(--color-green);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin { to { transform: rotate(360deg); } }

                .fade-in {
                    animation: fadeIn 0.8s ease forwards;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .reviews-placeholder {
                    width: 100%;
                    height: 300px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
            `}</style>
        </section>
    );
}
