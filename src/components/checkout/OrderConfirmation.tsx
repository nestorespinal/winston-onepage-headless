import { useEffect, useState } from 'react';
import { clearCart } from '../../store/cart';

interface OrderData {
    id: number;
    number: string;
    email: string;
}

export default function OrderConfirmation() {
    const [order, setOrder] = useState<OrderData | null>(null);

    useEffect(() => {
        const raw = sessionStorage.getItem('wh_last_order');
        if (raw) {
            const parsedOrder = JSON.parse(raw);
            setOrder(parsedOrder);
            sessionStorage.removeItem('wh_last_order');
            clearCart();

            // GA4 + Meta Purchase
            const alreadyTracked = sessionStorage.getItem('tracked_order_' + parsedOrder.id);
            if (!alreadyTracked && typeof window !== 'undefined') {
                const orderTotal = parseFloat(String(parsedOrder.total || '0')) || 0;
                const orderItems = parsedOrder.items || [];
                if (typeof (window as any).gtag === 'function') {
                    (window as any).gtag('event', 'purchase', {
                        transaction_id: String(parsedOrder.id), currency: 'COP', value: orderTotal,
                        items: orderItems.map((item: any) => ({ item_id: String(item.id), item_name: item.name, price: item.price, quantity: item.quantity }))
                    });
                }
                if (typeof (window as any).fbq === 'function') {
                    (window as any).fbq('track', 'Purchase', {
                        content_ids: orderItems.map((item: any) => String(item.id)), content_type: 'product', value: orderTotal, currency: 'COP'
                    });
                }
                sessionStorage.setItem('tracked_order_' + parsedOrder.id, 'true');
            }
        }
    }, []);

    return (
        <>
            <div className="confirmation-page">
                <div className="confirmation-box">
                    <div className="check-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                    </div>

                    <h1>¡Gracias por tu compra!</h1>

                    {order ? (
                        <>
                            <p className="order-number">
                                Pedido <strong>#{order.number}</strong>
                            </p>
                            <p className="order-email">
                                Recibirás una confirmación en <strong>{order.email}</strong>
                            </p>
                        </>
                    ) : (
                        <p className="order-email">Tu pedido ha sido recibido.</p>
                    )}

                    <p className="order-note">
                        Nuestro equipo procesará tu pedido y te contactará para coordinar la entrega.
                        Si tienes dudas escríbenos a{' '}
                        <a href="mailto:info@winstonandharrystore.com">
                            info@winstonandharrystore.com
                        </a>
                    </p>

                    <div className="confirmation-actions">
                        {order && (
                            <a href="/mi-cuenta/pedidos" className="btn-green">
                                Ver mis pedidos
                            </a>
                        )}
                        <a href="/" className="btn-outline">
                            Seguir comprando
                        </a>
                    </div>
                </div>
            </div>

            <style>{`
                .confirmation-page {
                    --green: #155338;
                    --beige: #B1915F;
                    --line:  #f0f0f0;
                    min-height: 70vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 60px 20px;
                    font-family: var(--font-paragraphs, sans-serif);
                }
                .confirmation-box {
                    max-width: 520px;
                    width: 100%;
                    text-align: center;
                }
                .check-icon {
                    width: 72px;
                    height: 72px;
                    border-radius: 50%;
                    background: #f0f7f3;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 24px;
                    color: var(--green);
                }
                h1 {
                    font-family: var(--font-titles, sans-serif);
                    font-size: 1.25rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    color: var(--green);
                    margin: 0 0 16px;
                }
                .order-number {
                    font-size: 1rem;
                    color: #333;
                    margin-bottom: 8px;
                }
                .order-email {
                    font-size: 0.88rem;
                    color: #666;
                    margin-bottom: 24px;
                }
                .order-note {
                    font-size: 0.82rem;
                    color: #888;
                    line-height: 1.6;
                    margin-bottom: 32px;
                    padding: 16px;
                    background: #fafafa;
                    border: 1px solid var(--line);
                }
                .order-note a { color: var(--green); }
                .confirmation-actions {
                    display: flex;
                    gap: 12px;
                    justify-content: center;
                    flex-wrap: wrap;
                }
                .btn-green {
                    display: inline-block;
                    padding: 14px 28px;
                    background: var(--green);
                    color: #fff;
                    font-family: var(--font-titles, sans-serif);
                    font-size: 0.85rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    text-decoration: none;
                    transition: filter 0.2s;
                }
                .btn-green:hover { filter: brightness(1.1); color: #fff; }
                .btn-outline {
                    display: inline-block;
                    padding: 14px 28px;
                    border: 1px solid var(--green);
                    color: var(--green);
                    font-family: var(--font-titles, sans-serif);
                    font-size: 0.85rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    text-decoration: none;
                    transition: all 0.2s;
                }
                .btn-outline:hover { background: var(--green); color: #fff; }
            `}</style>
        </>
    );
}
