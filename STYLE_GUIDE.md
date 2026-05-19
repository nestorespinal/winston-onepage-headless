# Guía de Estilos - Winston & Harry

Este documento establece los estándares visuales y de diseño para el proyecto, asegurando la uniformidad en todos los componentes y páginas.

## 1. Colores (Paleta)

| Color | Hexadecimal | Uso Principal |
| :--- | :--- | :--- |
| **Verde (Corporativo)** | `#155338` | Títulos, fondo de botones primarios, branding. |
| **Beige (Acento)** | `#B1915F` | Hovers, elementos de acento, estados de interacción. |
| **Blanco (Fondo)** | `#EFEFEF` | Color de fondo general ("blanco roto"). |
| **Negro (Texto)** | `#121212` | Color principal para cuerpo de texto y lectura. |

---

## 2. Tipografía

El sitio utiliza una combinación de **Adobe Fonts (Typekit)** y **Google Fonts**.

### Títulos y Productos (Headings H1-H4)
- **Familia:** `'darkmode-off'`, fallbacks a `'Antonio'`, `sans-serif`.
- **Fuente Google:** `Antonio` (Weights: 300, 400, 700).
- **Estilo Base:**
    - **Color:** `#155338` (Verde)
    - **Peso:** 700 (Bold)
    - **Transformación:** `UPPERCASE` (Mayúsculas)
    - **Letter Spacing:** `2px`
    - **Tamaño Base:** `1.25rem` (aprox. 20px)

### Cuerpo de Texto (Párrafos/Body)
- **Familia:** `'Helvetica'`, `'Arial'`, `sans-serif`.
- **Estilo Base:**
    - **Color:** `#121212` (Negro)
    - **Tamaño:** `0.8rem` (aprox. 12.8px)
    - **Line Height:** `1.6`

---

## 3. Botones (.btn)

### Estado Normal
- **Fondo:** `#155338` (Verde)
- **Texto:** `#EFEFEF` (Blanco)
- **Fuente:** `Antonio` (Weights: 600)
- **Padding:** `1rem` (vertical) / `2.5rem` (horizontal)
- **Letter Spacing:** `2px`
- **Transformación:** `UPPERCASE`

### Estado Hover (Interacción)
- **Fondo:** `#B1915F` (Beige)
- **Efecto:** Elevación suave (`translateY(-3px)`) con transición fluida.

---

## 4. Layout y Espaciado (Grilla)

- **Ancho Máximo del Contenedor:** `1400px`.
- **Gutters (Padding lateral):** `2rem` (32px) a cada lado del contenedor.
- **Espaciado entre Secciones (Padding vertical):**
    - **Desktop:** `2rem` arriba y abajo.
    - **Mobile (<768px):** `1rem` arriba y abajo.

---

## 5. Variables CSS (Propuesta para global.css)

```css
:root {
  --color-green: #155338;
  --color-beige: #B1915F;
  --color-white: #EFEFEF;
  --color-black: #121212;
  
  --font-titles: 'darkmode-off', 'Antonio', sans-serif;
  --font-body: 'Helvetica', 'Arial', sans-serif;
  
  --container-max-width: 1400px;
  --section-padding-desktop:2rem 0;
  --section-padding-mobile: 1rem 0;
}
```
