# Piki Partner Orders · modo Sunmi V2/V3

## Objetivo
Convertir el modo PDA de Partner Orders en una pantalla de cocina vertical, táctil y de alta legibilidad para terminales Sunmi V2/V3, reutilizando la autenticación, realtime, estados de pedido y diseño PIKI existentes.

## Diseño elegido
- **Movimiento:** consola operativa industrial, inspirada en POS de cocina.
- **Principios:** lectura a distancia, una acción primaria por fase, feedback inmediato y tolerancia a red/audio/printer no disponibles.
- **Color:** amarillo PIKI para identidad y alertas; verde para aceptar; azul para listo; negro/blanco para máximo contraste.
- **Layout:** identificación arriba, detalle central y acción fija/grande abajo en viewport estrecho.
- **Interacción:** chips de tiempo de preparación; aceptar detiene la alarma, persiste el tiempo y dispara impresión; listo actualiza el estado y el despacho.
- **Tipografía:** sistema sans-serif existente, mínimo 18px en contenidos operativos PDA.

## Implementación
1. Añadir `SunmiPdaBoard` como presentación específica del modo PDA; mantener `OrdersBoard` como fuente de datos, realtime, auth y transiciones.
2. Usar tiempos explícitos 15/20/30/45 minutos y enviarlos en la transición de aceptación/preparación.
3. Añadir `sunmiPrinter.ts` con puente `window.PikiSunmiPrinter`/Capacitor preparado para ESC/POS y fallback `window.print()` de 58 mm.
4. Ampliar el contrato del API Partner para aceptar esos tiempos y permitir que el despacho use el tiempo elegido.
5. Añadir pruebas unitarias del selector, fases y payloads; validar check, tests y build.

## Estructura
- `src/SunmiPdaBoard.tsx`: UI PDA de una comanda enfocada.
- `src/sunmiPrinter.ts`: adaptador nativo ESC/POS + fallback web.
- `src/OrdersBoard.tsx`: datos y operaciones existentes, con integración PDA.
- `src/App.css`: estilos verticales y targets táctiles.
- `piki-api/src/server.ts` y `src/models.ts`: validación/persistencia del tiempo de preparación.

## Alta pública Partner · 12/11/2026
Alinear únicamente el formulario público con el API actualizado: 0–5 adjuntos opcionales PDF/JPEG/PNG, máximo 2.500.000 bytes, sin retirar controles de servidor; PDA 20000 céntimos por unidad, 1–50 unidades y consentimiento explícito que se invalida al cambiar datos; IVA elegido entre 4/10/21. Mantener los datos legales, fiscales, bancarios, contraseña y consentimientos exigidos. Reutilizar estilos PIKI y editar dos franjas por día, con cierres independientes, HH:MM y Europe/Madrid, sin horarios activos iniciales ni horas inventadas. Los días/franjas inactivos usan 00:00 exclusivamente como valor estructural cerrado requerido por el esquema split; para abrir se exigen horas elegidas. La recepción requiere el contrato real `partner.id`, `partnerCode`, `onboarding_status: pending_review`; no fabrica código, aprobación ni enlace Stripe. No se crean contratos ni enlaces legales externos desconocidos. Helpers en `src/partnerOnboardingPayload.ts`, UI en `src/PartnerOnboarding.tsx` y regresiones offline con el runner existente. Sin servidores, .env, operaciones reales, commits, push ni despliegue; Root revisa/publica tras API.
