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

## Adaptación PDA Sunmi V2s · 18/11/2026
Las fotografías del terminal muestran el tablero web de columnas recortado. El modo PDA se seleccionaba solo por hostname; una APK Capacitor con recursos locales utiliza normalmente `localhost`. Activar la vista PDA también mediante la detección Android existente y mediante `?pda=1` para comprobación manual web, sin redirigir dominios ni cambiar las claves de sesión.

Reutilizar `SunmiPdaBoard`, autenticación, receptor REST/SSE, ACL, confirmación de transiciones e impresión Sunmi existentes. Añadir navegación Nuevos/Preparación/Listos y selección entre comandas confirmadas. Cabecera compacta con nombre completo/foto visibles; ajustes de cuenta y notificaciones desplegables. Reservar cuerpo desplazable y acciones táctiles visibles con fallback `vh`/`dvh`; mantener notas y modificadores antes de aceptar. Consentimiento en flujo PDA, nunca aceptado automáticamente ni ocultando botones. Preservar vista PC y tiempos operativos actuales 15/20/30/45.

Validar TypeScript, suite offline, render/acciones por permisos y pruebas de viewport 360/375×640 y PC. Publicar solo archivos del Partner autorizados. Una actualización web no sustituye por sí sola los recursos embebidos de la APK; compilar artefacto Android solo con la identidad existente, sin nuevas claves ni desinstalación forzada. No modificar API/DB, cartas, comisiones, contratos, cuentas ni pedidos reales. La impresión y el sonido físicos requieren confirmación en el terminal.

## Conexión de login Sunmi V2s · 18/11/2026
El usuario confirma que la APK 1.0.13 se instaló correctamente, pero el login muestra `Failed to fetch`; no hay navegador en la PDA y ADB no está autorizado. Producción responde `/ready` 200 y admite el preflight de `https://localhost` con los encabezados reales de Partner. No se ha identificado aún el error de red/TLS del dispositivo ni hay un rechazo de contraseña demostrado.

Utilizar `CapacitorHttp.request` directamente para solicitudes JSON de la API PIKI en Android y conservar fetch web para SSE/ReadableStream, multipart y archivos; no activar un parche global que almacene o rompa el streaming. Mantener origen HTTPS, token/rol/local/versiones, respuestas HTTP y cancelación de respuestas obsoletas. No reintentar automáticamente un POST fallido. Añadir en el login una comprobación manual GET `/ready` sin credenciales, con código de error nativo, reloj/fecha del servidor y versión visibles para fotografiar. Mantener contraseñas, roles, límites de login, TLS/validación de certificados e impresión sin cambios. Firmar actualización con la misma clave Partner de la 1.0.13 confirmada por el usuario; no publicar Play ni desinstalar/borrar datos.

## Arranque de SUNMI V2 Android 7.1.1 · 18/11/2026
La V2 autorizada devuelve SDK25, APK1.0.14/versionCode13, proveedor configurado com.google.android.webview62.0.3202.84; Chrome56.0.2924.87 está también instalado/habilitado y no se cambia. No hay salida del servicio webviewupdate ni errores del proceso capturados; la selección configurada no prueba por sí sola el proveedor cargado. La APK contiene un único script type=module y no se prometerá soporte Chrome56 ni se reducirá el mínimo de Capacitor. Las inicializaciones de onboarding, horarios y alérgenos ejecutan Object.fromEntries/Array.flatMap antes de createRoot; esas APIs no forman parte de WebView62. El login, las lecturas cancelables y notificaciones también usan AbortController, Promise.finally y globalThis, ausentes en ese motor.

Añadir una capa estándar de compatibilidad importada antes de App y sus dependencias: polyfills específicos de Object.fromEntries, Array.flat/flatMap, Promise.finally, globalThis y string trimStart/trimEnd; AbortController/AbortSignal cuando no existan, sin parchear globalmente fetch ni XMLHttpRequest. Mantener sin cambios el HTTP nativo JSON de PIKI, streaming/archivos, límites de login, ACL, TLS/certificados, impresora y contratos comerciales. No inventar API de abort que admita respuestas obsoletas; reutilizar el descarte existente por señal/epoch. Dependencias exactas y política explícita pnpm10 en archivo de proyecto. Conservar los campos, códigos/alias de alérgenos y tickets originales; no reescribirlos para ocultar el problema.

Regresión de la capa en un entorno donde se hayan retirado las APIs faltantes antes de cargar onboarding/alérgenos, y simulación offline del App real hasta login en un motor de capacidades reducidas. Respetar la versión nativa y firma Partner existentes, preparar nueva versión superior y comprobar APK/assets/identidad y hash; no publicar Google Play, no borrar datos ni tocar proveedor Android/quiosco ni datos de API. El arranque/login/recepción/ticket en cada V2 permanece pendiente hasta confirmación física. La impresión física en V2s1.0.14 ya está confirmada; no prueba automáticamente la V2.
