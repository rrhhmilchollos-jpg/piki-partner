# TODO · Piki Partner Orders Sunmi

## Pantalla PDA de dos fases
- [x] En terminal vertical Sunmi V2/V3, mostrar arriba el ID gigante, cliente, hora y alerta de alergias/notas especiales; mostrar en el centro productos, modificadores y estado del Rider; reservar la parte inferior para acciones táctiles grandes.
- [x] En pedido entrante, mostrar alarma continua compatible con la política de gesto de usuario y el selector `[15 min] [20 min] [30 min] [45 min]`, con 20 minutos por defecto.
- [x] Al pulsar «ACEPTAR PEDIDO», persistir el pedido como `accepted`, conservar el tiempo elegido para despacho, detener la alarma y enviar la comanda a impresión ESC/POS Sunmi con fallback web de 58 mm.
- [x] Tras aceptar, cambiar a la fase de preparación/recogida y mostrar «¡PEDIDO LISTO para recoger!» como acción primaria azul.
- [x] Al pulsar «¡PEDIDO LISTO para recoger!», persistir `ready_for_pickup`, notificar realtime y dejar que el backend coordine/reasigne el Rider según sus reglas.

## Backend y despacho
- [x] Aceptar y persistir tiempos de preparación 15, 20, 30 y 45 minutos sin romper transiciones existentes.
- [x] Mantener preparados los POST/PATCH y el cálculo Just-in-Time existente para que el tiempo de preparación participe en la selección del Rider.

## Calidad y entrega
- [x] Añadir pruebas del adaptador de impresión y validar las fases/payloads mediante el check y tests del API.
- [x] Ejecutar check, tests y build de Partner y API.
- [ ] Crear commits independientes en `piki-partner` y `piki-api`; dejar despliegue a Vercel/Render según la conexión de cada repositorio.

## Correcciones Go-Live Partner · 11/11/2026
- [x] Mantener alarma de pedidos `pending` online `paymentState: authorized` y `paid` en snapshot REST y SSE+REST, sin tratar `unpaid` online como confirmado.
- [x] Mostrar `deliveryNote` antes de aceptar/preparar en web y PDA, y conservarla en el ticket web usado como fallback Sunmi.
- [x] Cambiar disponibilidad solo por PATCH atómico por ID con `{available:boolean}`; no enviar la carta completa para un toggle. GET guarda `menuRevision` con su snapshot; fullsave siempre envía `expectedMenuRevision`. Un 409 recarga sin sobrescribir borrador ni reintentar a ciegas; no asociar una revisión nueva de PATCH a una carta antigua.
- [x] Separar `canAccept` (`orders:write`), `canPrepare` (`orders:prepare`) y `canCancel` (`orders:cancel`) en web/PDA; eliminar alias write→prepare sin ampliar roles.
- [x] Usar `partnerPrepDeadlineAt` confirmado para accepted/preparing y distinguir fallback estimado/ausente. Conservar `preparationMinutes` confirmado si no hay selección local.
- [x] Ejecutar regresiones offline con mocks/guard de red, check y build solo de compilación; documentar evidencias y límites. Evidencia: 172 tests Vitest + 8 checks nativos contractuales, TypeScript y lint sin errores; compilación Vite aislada. Sin commits/push/deploy, servicios/DB, lectura .env de producción ni operaciones comerciales.

## Correcciones de integración focalizadas · 12/11/2026
- [x] Invalidar lecturas/escrituras de carta por epoch y AbortController al desmontar o cambiar identidad/local/token; comprobar vigencia tras awaits antes de estado/onUnauthorized, recuperación y locks. No confiar únicamente en key o setState ignorado por React.
- [x] Acotar clearSession en App al token/epoch vigente, invalidado sincrónicamente en logout/login; un 401 tardío A tras login B o relogin con el mismo token no cierra la sesión nueva. Conservar logout de 401 vigente.
- [x] Conservar required y mínimos/máximos contractuales originales al pausar/reactivar o sanear opciones, sin clamp al número disponible ni cotización/estimación local alternativa.
- [x] Verificar handlers A→logout→loginB→401 tardío A, GET/JSON y save/stock obsoletos, escritura/borrador B activos, límites al pausar/reactivar y la integración de menú existente con guard/mocks offline. Resultado focalizado: 104 tests en 6 archivos; pnpm check, lint de afectados (0 warnings/errors) y diff check aprobados. No suite integral/E2E, build de release, commits/push/deploy, API/DB/servicios ni operaciones comerciales. Informe: /home/ubuntu/piki-audit/piki-partner-integration-fixes.md.
