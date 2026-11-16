# PIKI Partner Orders

Aplicación operativa para restaurantes, tiendas y supermercados asociados a **PIKI Delivery**. Está pensada para tablet, móvil o terminal del local: aceptar pedidos, preparar comandas, activar/desactivar productos y consultar rendimiento sin salir de la operación.

## Producción

| Componente | Dirección |
| --- | --- |
| Frontend público | [https://partners.pikidelivery.com](https://partners.pikidelivery.com) |
| Hosting frontend | Vercel |
| API central | https://api.pikidelivery.com |
| Health check API | https://api.pikidelivery.com/ready |
| Backend | Render |

El navegador no se comunica directamente con Render: las llamadas Partner usan `/piki-api/*` y Vercel las reescribe de forma same-origin a `https://api.pikidelivery.com/*`. Esto evita que la autenticación de empleados dependa de cabeceras CORS entre dominios.

## Funcionalidad Orders

- **Estado de local:** control grande Abierto/Pausado, conectado al contrato `PATCH /api/v1/partners/store/status`.
- **Pedidos:** carriles Nuevos, Aceptados, En preparación y Listos; temporizadores, alarma de pedidos, actualizaciones REST y eventos en tiempo real.
- **Disponibilidad:** interruptores de producto sobre `GET`/`PUT /api/v1/partners/menu`.
- **Rendimiento:** pantalla preparada para datos reales de `GET /api/v1/partners/metrics/overview?period=today`; no muestra cifras de demostración si el backend aún no entrega el resumen.
- **PWA:** iconos del rider-abeja PIKI, manifest, service worker y avisos de pedidos compatibles con dispositivos de local.

## Identidad, locales y permisos

Tras el login de empleado, la app valida `GET /api/v1/auth/employee/me` y normaliza roles, permisos y locales autorizados. Si el backend devuelve más de un establecimiento asignado, aparece un selector; cada solicitud incluye `X-PIKI-Restaurant-Id` con el local activo.

El frontend reduce errores operativos, pero el backend es siempre la frontera de seguridad: debe validar token, permisos y pertenencia al local para todas las rutas Partner.

## Desarrollo

```bash
pnpm install --frozen-lockfile
pnpm dev
```

El servidor Vite expone la app en `http://localhost:3000` y proxifica `/piki-api/*` hacia la API central. Para validar antes de publicar:

```bash
pnpm run check
pnpm run lint
pnpm test
```

## Despliegue

Vercel ejecuta `pnpm install --frozen-lockfile` y `pnpm run build` con cada push a `main`. El build actualiza los metadatos de versión y el service worker antes de crear `dist`.

## Producción en PDA SUNMI

- [Manual de Android Enterprise, Intune, cuentas, DNS y modo quiosco](docs/pda-production-runbook.md)
- [Manual de firma y generación del APK/AAB](docs/android-release-runbook.md)

La URL PDA es `https://partners-pda.pikidelivery.com`. El modo PDA se activa por hostname; el bloqueo real del dispositivo lo aplica Android Enterprise/Intune, no la interfaz web por sí sola.
