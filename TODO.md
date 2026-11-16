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

## Alta pública Partner · 12/11/2026
- [x] Aceptar 0–5 documentos opcionales, enviando solo los elegidos y omitiendo documents si no hay ninguno. PDF/JPEG/PNG, tipos únicos y máximo 2.500.000 bytes; validar localmente y conservar controles/escáner del API, sin aprobación ficticia por ausencia.
- [x] Exponer PDA a 200 €/unidad (20000 céntimos), cantidad entera 1–50, total y consentimiento propio explícito renovado tras cambios; rechazar el precio anterior 30000 sin tocar cargos/históricos.
- [x] Exponer IVA 4/10/21 sin selección oculta, conservar contraseña válida, perfil, datos legales/fiscales/bancarios y aceptaciones requeridas.
- [x] Mostrar dos franjas editables por día (lunes–domingo), cierres independientes de franja/día, etiquetas accesibles, HH:MM/00:00/nocturnos Europe/Madrid; ningún horario activo inicial, y exigir al menos una franja configurada para enviar.
- [x] Confirmar recepción solo con id/código real y pending_review del API; no éxito por HTML/2xx vacío, código PIKI-PARTNER de fallback, aprobación ni enlace Stripe inventados. No inventar contrato legal externo ausente.
- [x] Ejecutar check-only previo/final, regresiones offline de handlers/payload/adjuntos/coste/horarios/recibo y build sin .env ni servidor. Entregar manifiesto relativo y handoff a Root; sin commits/push/merge/deploy.

Evidencia final: 273/273 tests Vitest (59 nuevos de onboarding), check-only previo/final, lint de afectados y build offline sin errores. Handoff y manifiesto: `/home/ubuntu/piki-audit/noon-partner-onboarding-fix.md`, `/home/ubuntu/piki-audit/noon-partner-onboarding-files.txt`. La fuente legal externa no está en este repositorio: Root debe confirmar los textos publicados; no se inventaron enlaces ni condiciones.

## Identidad de cuenta Partner · 13/11/2026
- [x] Mostrar arriba el nombre completo canónico y la foto propia de todas las cuentas autenticadas, también sin local asignado. Nombre completo con wrapping en móvil, nunca oculto por breakpoint. Foto ausente/rota: silueta neutra y «Sin foto», sin KYC, DiceBear, imágenes generadas ni avatares ficticios.
- [x] Mostrar puesto real `employee.jobRole` y rol activo `employee.role`, sin inferir de primaryRole/superficie. Conservar códigos desconocidos sin inventar etiquetas; presentar los roles de asignación local como información distinta, sin modificar ACL ni permisos.
- [x] Acción accesible discreta «Añadir/Cambiar foto propia»: input file JPEG/PNG/WebP sin capture ni permisos de cámara; canvas máximo 256 px, JPEG quality .8, máximo 220000 caracteres. PATCH `/api/v1/auth/employee/profile` con Bearer y solo `{photoUrl:dataURL|null}`; actualizar únicamente tras ACK.
- [x] Borrar identidad ante cambio token/logout/cuenta/error auth e ignorar respuestas tardías de `/me` y foto. Reutilizar `/me` sin duplicar peticiones por cabecera/foto/local; conservar web/PDA, safe areas y operaciones de pedidos.
- [x] Verificar render/helpers y sesiones con mocks offline: nombre largo, rol/puesto reales distintos de superficie/local, foto ausente/rota, compresión y ACK, cambio sesión, errores auth y respuestas tardías. Solo partner en rama `feat/account-identity-20261113`: pnpm install frozen prefer-offline, check/tests existentes; sin API/otras apps, navegador, producción, versión/build de release, commit/push/deploy/merge.

Evidencia: `pnpm install --frozen-lockfile --prefer-offline` sin modificar lockfile; `pnpm check` aprobado; `pnpm test` 350/350 tests, 22 archivos con guard offline y sin .env; `pnpm lint` 0 warnings/errores; `git diff --check` aprobado. Nombre/puesto/rol, ausencia/rotura de foto, encoding y límites, ACK/204/rechazo, sesiones/cuentas y peticiones tardías cubiertos con mocks y render estático. Sin compilación de release, servicios ni acciones Android. Integración real pendiente del contrato de API central gestionado por otro agente. Warning preexistente de Vite por import sin extensión en vitest.config.ts, no bloqueante.

## Pedidos entrantes visibles · 16/11/2026
- [x] Mostrar «Pedidos» y «Pedidos entrantes» a perfiles que tienen `orders:read` declarado aunque el local esté pausado, pendiente de aprobación o aún no sea orderable.
- [x] Mantener bloqueadas la lectura REST y las acciones de aceptar/preparar hasta que el backend confirme que el local está operativo; explicar el motivo en la pantalla en lugar de ocultar el módulo.
