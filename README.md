<div align="center">
<img width="1200" height="475" alt="MyBudget Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# MyBudget

**App de control de inversiones y presupuesto personal**

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E?logo=supabase)](https://supabase.com)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor)](https://capacitorjs.com)

</div>

## Descripción

MyBudget es una aplicación web y móvil para gestionar inversiones y presupuesto personal. Permite registrar gastos e inversiones, hacer seguimiento de pagos pendientes y vencidos, y visualizar el estado financiero a través de un dashboard interactivo.

## Funcionalidades

- **Dashboard** con resumen de pagos pendientes, pagados, vencidos y progreso general
- **Gestión de gastos** con múltiples categorías y tipos de presupuesto
- **Frecuencia de pagos** — Único, Mensual, Bimestral, Trimestral, Semestral, Anual
- **Auto-renovación** de pagos recurrentes al confirmar un pago
- **Vista por estado, categoría y mes** para analizar gastos desde diferentes perspectivas
- **Vista de calendario** para visualizar pagos por fecha
- **Seguimiento de gastos de alimentación** como categoría especializada
- **Soporte multi-moneda** (COP y USD)
- **Confirmación de pagos** con carga de comprobantes (imagen o PDF)
- **Modo oscuro**
- **App nativa** para Android e iOS vía Capacitor

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS 4 |
| Routing | React Router DOM 7 |
| Backend | Supabase (Auth, Database, Storage) |
| Gráficos | Recharts |
| Animaciones | Motion |
| Formularios | React Hook Form |
| Mobile | Capacitor 8 (Android / iOS) |
| Build | Vite 6 |

## Ejecutar Localmente

**Requisitos:** Node.js 18+

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/mystoredigital/inversion-budget-app.git
   cd inversion-budget-app
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Configurar variables de entorno en `.env.local`:
   ```env
   VITE_SUPABASE_URL=tu_supabase_url
   VITE_SUPABASE_ANON_KEY=tu_supabase_anon_key
   ```

4. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```

   La app estará disponible en `http://localhost:3000`

## Build para Producción

```bash
npm run build
```

## Build Nativo (Mobile)

```bash
npm run native:build    # Build + sync con Capacitor
npm run cap:android     # Abrir proyecto Android
npm run cap:ios         # Abrir proyecto iOS
```

## Docker

```bash
docker build -t mybudget .
docker run -p 80:80 mybudget
```
