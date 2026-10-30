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
