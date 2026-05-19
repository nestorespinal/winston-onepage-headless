import { useStore } from '@nanostores/react';
import { useState, useMemo, useEffect } from 'react';
import { cartItems, clearCart, type CartItem } from '../../store/cart';
import { userSession } from '../../store/user';

type Step = 'form' | 'payment' | 'processing';

interface FormData {
    first_name: string;
    last_name: string;
    document_id: string;
    email: string;
    phone: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    order_notes: string;
    payment_method: 'mercadopago' | 'addi';
}

const INITIAL_FORM: FormData = {
    first_name: '',
    last_name: '',
    document_id: '',
    email: '',
    phone: '',
    address_1: '',
    address_2: '',
    city: '',
    state: '',
    postcode: '',
    order_notes: '',
    payment_method: 'mercadopago',
};

interface FieldProps {
    label: string;
    field: keyof FormData;
    form: FormData;
    errors: Partial<FormData>;
    set: (field: keyof FormData, value: string) => void;
    type?: string;
    required?: boolean;
    placeholder?: string;
}

const Field = ({
    label, field, form, errors, set, type = 'text', required = false, placeholder = ''
}: FieldProps) => (
    <div className={`field ${errors[field] ? 'field-error' : ''}`}>
        <label>
            {label}
            {required && <span className="required"> *</span>}
        </label>
        <input
            type={type}
            value={form[field] as string}
            onChange={e => set(field, e.target.value)}
            placeholder={placeholder}
        />
        {errors[field] && <span className="error-msg">{errors[field]}</span>}
    </div>
);

export default function CheckoutPage() {
    const $cartItems = useStore(cartItems);
    const session = useStore(userSession);
    const [form, setForm] = useState<FormData>(INITIAL_FORM);
    const [step, setStep] = useState<Step>('form');
    const [errors, setErrors] = useState<Partial<FormData>>({});
    const [submitting, setSubmitting] = useState(false);
    const [serverError, setServerError] = useState('');

    // Pre-llenar con datos del usuario si está logueado
    useEffect(() => {
        if (session.user_email) {
            const [first, ...rest] = (session.user_display_name || '').split(' ');
            setForm(f => ({
                ...f,
                email: session.user_email || '',
                first_name: first || '',
                last_name: rest.join(' ') || '',
            }));
        }
    }, [session.token]);

    const items = useMemo(() => {
        return Object.entries($cartItems).map(([key, value]) => ({
            key,
            ...(JSON.parse(value) as CartItem),
        }));
    }, [$cartItems]);

    const [shippingSettings, setShippingSettings] = useState({ flat_rate: 21008, free_shipping_threshold: 100000 });

    useEffect(() => {
        fetch('/api/shipping-settings')
            .then(res => res.json())
            .then(data => {
                if (data.flat_rate !== undefined) setShippingSettings(data);
            })
            .catch(err => console.error("Error fetching shipping settings:", err));
    }, []);

    const subtotal = useMemo(
        () => items.reduce((s, i) => s + i.price * i.quantity, 0),
        [items]
    );

    const FREE_SHIPPING_THRESHOLD = shippingSettings.free_shipping_threshold;
    const SHIPPING_COST = shippingSettings.flat_rate;
    const shippingCost = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
    const total = subtotal + shippingCost;

    const fmt = (n: number) => '$' + new Intl.NumberFormat('es-CO').format(n);

    // Redirigir si carrito vacío (pero no si estamos procesando el pago)
    useEffect(() => {
        if (Object.keys($cartItems).length === 0 && step === 'form') {
            window.location.href = '/carrito';
        }
    }, [$cartItems, step]);

    const set = (field: keyof FormData, value: string) => {
        setForm(f => ({ ...f, [field]: value }));
        setErrors(e => ({ ...e, [field]: '' }));
    };

    const validate = (): boolean => {
        const e: Partial<FormData> = {};
        if (!form.first_name.trim()) e.first_name = 'Requerido';
        if (!form.last_name.trim()) e.last_name = 'Requerido';
        if (!form.document_id.trim()) e.document_id = 'Requerido';
        if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email inválido';
        if (!form.phone.trim()) e.phone = 'Requerido';
        if (!form.address_1.trim()) e.address_1 = 'Requerido';
        if (!form.city.trim()) e.city = 'Requerido';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        setSubmitting(true);
        setServerError('');

        try {
            const payload = {
                ...form,
                shipping_cost: shippingCost,
                items: items.map(item => {
                    const baseProductId = Number(String(item.key).split('-')[0]);
                    return {
                        product_id: baseProductId,
                        variation_id: item.id !== baseProductId ? item.id : 0,
                        quantity: item.quantity,
                    };
                }),
            };

            const res = await fetch('/api/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await res.json();

            if (!res.ok || !data.order_id) {
                setServerError(data.error || 'Error al crear la orden. Intenta de nuevo.');
                setSubmitting(false);
                return;
            }

            // Guardar número de orden para página de gracias
            sessionStorage.setItem('wh_last_order', JSON.stringify({
                id: data.order_id,
                number: data.order_number,
                email: form.email,
            }));

            // Cambiar step a 'processing'
            // para evitar que el guard de carrito vacío redirija a /carrito
            setStep('processing');

            // Redirigir a pasarela de pago
            if (form.payment_method === 'addi') {
                window.location.href = `https://order-checkout.addi.com/allies/winstonharry-ecommerce/orders/${data.order_id}/checkout`;
            } else {
                window.location.href = data.payment_url;
            }

        } catch (err: any) {
            setServerError('Error de conexión. Intenta de nuevo.');
            setSubmitting(false);
        }
    };


    return (
        <>
            <div className="checkout-page">

                {/* ── TÍTULO ─────────────────────────────── */}
                <div className="checkout-title-bar">
                    <h1>Finalizar Compra</h1>
                </div>

                <div className="checkout-layout">

                    {/* ── COLUMNA IZQUIERDA — Formulario ──── */}
                    <div className="checkout-form-col">

                        {/* Datos de facturación */}
                        <section className="checkout-section">
                            <h2>Detalles de facturación</h2>

                            <div className="fields-grid">
                                <Field label="Nombre" field="first_name" form={form} errors={errors} set={set} required />
                                <Field label="Apellidos" field="last_name" form={form} errors={errors} set={set} required />
                            </div>

                            <Field label="Documento de identidad" field="document_id" form={form} errors={errors} set={set} required placeholder="CC / NIT" />
                            <Field label="Correo electrónico" field="email" form={form} errors={errors} set={set} type="email" required />
                            <Field label="Teléfono / WhatsApp" field="phone" form={form} errors={errors} set={set} type="tel" required placeholder="+57 300 000 0000" />
                        </section>

                        {/* Dirección de envío */}
                        <section className="checkout-section">
                            <h2>Dirección de envío</h2>

                            <Field label="Dirección" field="address_1" form={form} errors={errors} set={set} required placeholder="Calle, número, barrio" />
                            <Field label="Apartamento / Oficina (opcional)" field="address_2" form={form} errors={errors} set={set} placeholder="Apto 101, Torre B..." />

                            <div className="fields-grid">
                                <Field label="Ciudad" field="city" form={form} errors={errors} set={set} required />
                                <Field label="Departamento" field="state" form={form} errors={errors} set={set} />
                            </div>

                            <Field label="Código postal (opcional)" field="postcode" form={form} errors={errors} set={set} />
                        </section>

                        {/* Notas */}
                        <section className="checkout-section">
                            <h2>Notas del pedido <span className="optional">(opcional)</span></h2>
                            <textarea
                                value={form.order_notes}
                                onChange={e => set('order_notes', e.target.value)}
                                placeholder="Instrucciones especiales para la entrega..."
                                rows={3}
                            />
                        </section>

                        {/* Método de pago */}
                        <section className="checkout-section">
                            <h2>Método de pago</h2>

                            <div className="payment-methods">
                                <label className={`payment-option ${form.payment_method === 'mercadopago' ? 'selected' : ''}`}>
                                    <input
                                        type="radio"
                                        name="payment"
                                        value="mercadopago"
                                        checked={form.payment_method === 'mercadopago'}
                                        onChange={() => set('payment_method', 'mercadopago')}
                                    />
                                    <div className="payment-info">
                                        <strong>Mercado Pago</strong>
                                        <span>Tarjetas, PSE, efectivo y más</span>
                                    </div>
                                </label>

                                <label className={`payment-option ${form.payment_method === 'addi' ? 'selected' : ''}`}>
                                    <input
                                        type="radio"
                                        name="payment"
                                        value="addi"
                                        checked={form.payment_method === 'addi'}
                                        onChange={() => set('payment_method', 'addi')}
                                    />
                                    <div className="payment-info">
                                        <strong>Addi</strong>
                                        <span>Paga en cuotas sin tarjeta de crédito</span>
                                    </div>
                                </label>
                            </div>
                        </section>

                        {/* Error servidor */}
                        {serverError && (
                            <div className="server-error">{serverError}</div>
                        )}
                    </div>

                    {/* ── COLUMNA DERECHA — Resumen ────────── */}
                    <div className="checkout-summary-col">
                        <div className="checkout-summary">
                            <h2>Tu pedido</h2>

                            {/* Items */}
                            <div className="summary-items">
                                {items.map(item => (
                                    <div key={item.key} className="summary-item">
                                        <div className="summary-item-img">
                                            <img src={item.image} alt={item.name} />
                                            <span className="summary-item-qty">{item.quantity}</span>
                                        </div>
                                        <div className="summary-item-info">
                                            <span className="summary-item-name">{item.name}</span>
                                            {item.color && <span className="summary-item-var">Color: {item.color}</span>}
                                            {item.size && <span className="summary-item-var">Talla: {item.size}</span>}
                                        </div>
                                        <span className="summary-item-price">
                                            {fmt(item.price * item.quantity)}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Totales */}
                            <div className="summary-totals">
                                <div className="summary-row">
                                    <span>Subtotal</span>
                                    <span>{fmt(subtotal)}</span>
                                </div>
                                <div className="summary-row">
                                    <span>Envío</span>
                                    {shippingCost === 0 ? (
                                        <span className="free-shipping">Gratis</span>
                                    ) : (
                                        <span className="cost-shipping">{fmt(shippingCost)}</span>
                                    )}
                                </div>
                                {shippingCost > 0 && (
                                    <div className="shipping-threshold-notice">
                                        Agrega {fmt(FREE_SHIPPING_THRESHOLD - subtotal)} más para envío gratis
                                    </div>
                                )}
                                <div className="summary-row summary-total-row">
                                    <span>Total</span>
                                    <span>{fmt(total)}</span>
                                </div>
                                <p className="tax-note">Incluye impuestos</p>
                            </div>

                            {/* Botón */}
                            <button
                                className="btn-place-order"
                                onClick={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting ? 'PROCESANDO...' : 'FINALIZAR COMPRA'}
                            </button>

                            <p className="privacy-note">
                                Tus datos personales se usarán para procesar tu pedido conforme a nuestra{' '}
                                <a href="/politica-privacidad-proteccion-datos">política de privacidad</a>.
                            </p>

                            <a href="/carrito" className="back-to-cart">← Volver al carrito</a>
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                .checkout-page {
                    --green: var(--color-green, #155338);
                    --beige: var(--color-beige, #B1915F);
                    --black: var(--color-black, #121212);
                    --gray:  #888;
                    --line:  #f0f0f0;
                    --error: #c0392b;
                    font-family: var(--font-paragraphs, 'Helvetica', sans-serif);
                    background: #fff;
                    min-height: 60vh;
                }

                /* Título */
                .checkout-title-bar {
                    border-bottom: 2px solid var(--line);
                    padding: 1.4rem 40px 1rem;
                }
                .checkout-title-bar h1 {
                    font-family: var(--font-titles, sans-serif);
                    font-size: 1.25rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 3px;
                    color: var(--green);
                    margin: 0;
                }

                /* Layout */
                .checkout-layout {
                    display: grid;
                    grid-template-columns: 1fr 380px;
                    gap: 48px;
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 40px 40px 60px;
                    align-items: start;
                }

                /* Secciones del formulario */
                .checkout-section {
                    margin-bottom: 32px;
                    padding: 1rem;
                    border-bottom: 1px solid var(--line);
                }
                .checkout-section:last-child { border-bottom: none; }

                .checkout-section h2 {
                    font-family: var(--font-titles, sans-serif);
                    font-size: 1.25rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1.5px;
                    color: var(--green);
                    margin: 0 0 20px 0;
                    padding-bottom: 10px;
                    border-bottom: 1px solid var(--line);
                }
                .optional {
                    font-family: var(--font-paragraphs, sans-serif);
                    font-size: 0.75rem;
                    font-weight: 400;
                    text-transform: none;
                    color: var(--gray);
                    letter-spacing: 0;
                }

                /* Campos */
                .fields-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 0 16px;
                }

                .field {
                    margin-bottom: 14px;
                }
                .field label {
                    display: block;
                    font-size: 0.7rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: #333;
                    margin-bottom: 5px;
                }
                .required { color: var(--error); }

                .field input,
                .checkout-page textarea {
                    width: 100%;
                    height: 46px;
                    padding: 0 14px;
                    border: 1px solid #e0e0e0;
                    background: #fafafa;
                    font-size: 1rem;
                    font-family: inherit;
                    outline: none;
                    transition: border-color 0.2s;
                    box-sizing: border-box;
                }
                .field input:focus,
                .checkout-page textarea:focus { border-color: var(--green); background: #fff; }

                .checkout-page textarea {
                    height: auto;
                    padding: 12px 14px;
                    resize: vertical;
                }

                .field-error input { border-color: var(--error); }
                .error-msg {
                    display: block;
                    font-size: 0.7rem;
                    color: var(--error);
                    margin-top: 4px;
                }

                /* Métodos de pago */
                .payment-methods {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                .payment-option {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 14px 16px;
                    border: 1px solid #e0e0e0;
                    cursor: pointer;
                    transition: border-color 0.2s;
                }
                .payment-option.selected {
                    border-color: var(--green);
                    background: #f0f7f3;
                }
                .payment-option input[type="radio"] { accent-color: var(--green); }
                .payment-info {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .payment-info strong {
                    font-size: 0.88rem;
                    color: var(--black);
                }
                .payment-info span {
                    font-size: 0.75rem;
                    color: var(--gray);
                }

                /* Error servidor */
                .server-error {
                    padding: 12px 16px;
                    background: #fdf0f0;
                    border: 1px solid #f5c6c6;
                    color: var(--error);
                    font-size: 0.85rem;
                    margin-top: 16px;
                }

                /* ── RESUMEN ─────────────────────────────── */
                .checkout-summary-col {
                    position: sticky;
                    top: 100px;
                }
                .checkout-summary {
                    border: 1px solid var(--line);
                    padding: 24px;
                    background: #fff;
                }
                .checkout-summary h2 {
                    font-family: var(--font-titles, sans-serif);
                    font-size: 1.25rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    color: var(--green);
                    margin: 0 0 16px 0;
                    padding-bottom: 12px;
                    border-bottom: 1px solid var(--line);
                }

                /* Items del resumen */
                .summary-items {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    padding-bottom: 16px;
                    border-bottom: 1px solid var(--line);
                    margin-bottom: 16px;
                }
                .summary-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .summary-item-img {
                    position: relative;
                    flex-shrink: 0;
                }
                .summary-item-img img {
                    width: 52px;
                    height: 52px;
                    object-fit: cover;
                }
                .summary-item-qty {
                    position: absolute;
                    top: -6px;
                    right: -6px;
                    width: 18px;
                    height: 18px;
                    background: var(--black);
                    color: #fff;
                    border-radius: 50%;
                    font-size: 0.65rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                }
                .summary-item-info {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .summary-item-name {
                    font-size: 0.8rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    color: var(--black);
                    letter-spacing: 0.3px;
                }
                .summary-item-var {
                    font-size: 0.72rem;
                    color: var(--gray);
                }
                .summary-item-price {
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: var(--black);
                    white-space: nowrap;
                }

                /* Totales */
                .summary-totals { margin-bottom: 20px; }
                .summary-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 0;
                    font-size: 0.82rem;
                    color: #444;
                    border-bottom: 1px solid var(--line);
                }
                .summary-row span:first-child {
                    text-transform: uppercase;
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: var(--gray);
                    letter-spacing: 0.5px;
                }
                .free-shipping { color: var(--green) !important; font-weight: 600; }
                .cost-shipping { color: #c0392b !important; font-weight: 600; }
                .shipping-threshold-notice {
                    font-size: 0.72rem;
                    color: var(--green);
                    background: #f0f7f3;
                    border: 1px solid #c3e0d0;
                    padding: 8px 10px;
                    margin: 4px 0 8px;
                    text-align: center;
                }

                .summary-total-row {
                    border-bottom: none !important;
                    padding-top: 12px !important;
                }
                .summary-total-row span:first-child {
                    color: var(--black) !important;
                    font-size: 0.85rem !important;
                    font-weight: 700 !important;
                }
                .summary-total-row span:last-child {
                    font-size: 1.3rem;
                    font-weight: 700;
                    color: var(--beige);
                    font-family: var(--font-titles, sans-serif);
                }
                .tax-note {
                    font-size: 0.7rem;
                    color: #bbb;
                    text-align: right;
                    margin: 4px 0 0;
                }

                /* Botón */
                .btn-place-order {
                    width: 100%;
                    padding: 1.2rem;
                    background: var(--green);
                    color: #fff;
                    font-family: var(--font-titles, sans-serif);
                    font-size: 1.1rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    border: none;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    margin-bottom: 15px;
                    margin-top: 10px;
                }
                .btn-place-order:hover:not(:disabled) {
                    background: var(--beige);
                    transform: translateY(-2px);
                }
                .btn-place-order:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .privacy-note {
                    font-size: 0.72rem;
                    color: #aaa;
                    line-height: 1.5;
                    margin-bottom: 14px;
                }
                .privacy-note a { color: var(--green); }

                .back-to-cart {
                    display: block;
                    text-align: center;
                    font-size: 0.75rem;
                    color: var(--gray);
                    text-decoration: none;
                    transition: color 0.2s;
                }
                .back-to-cart:hover { color: var(--green); }

                /* ── MOBILE ≤ 768px ──────────────────────── */
                @media (max-width: 768px) {
                    .checkout-title-bar { padding: 1rem 16px 0.8rem; }
                    .checkout-title-bar h1 { font-size: 1.1rem; }

                    .checkout-layout {
                        grid-template-columns: 1fr;
                        gap: 0;
                        padding: 0 14px 40px;
                    }

                    /* Resumen baja al final */
                    .checkout-summary-col {
                        order: 1;
                        position: static;
                        margin: 16px 0;
                    }

                    .fields-grid {
                        grid-template-columns: 1fr;
                        gap: 0;
                    }

                    .checkout-section { margin-bottom: 20px; padding-bottom: 20px; }
                    .field { margin-bottom: 10px; }
                    .field input { font-size: 1rem; }

                    .btn-place-order { padding: 16px; font-size: 0.88rem; }

                    .checkout-summary { padding: 16px; }
                }
            `}</style>
        </>
    );
}
