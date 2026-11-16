# PIKI Partner PDA: configuración de producción

## Decisión predeterminada

Esta guía usa una configuración de producción sencilla y centralizada:

- **Identidad:** Microsoft 365 + Microsoft Entra ID.
- **MDM/EMM:** Microsoft Intune.
- **Gestión Android:** Android Enterprise Dedicated Device / Fully Managed.
- **Modo:** quiosco de una sola aplicación.
- **Aplicación:** `com.pikidelivery.partners`.
- **Nombre visible:** PIKI Partner Orders.
- **URL PWA de contingencia:** `https://partners-pda.pikidelivery.com`.
- **API:** `https://api.pikidelivery.com`.

No se debe reutilizar una cuenta, licencia, inscripción Zero-touch o política de otra empresa.

## Cuentas que debe registrar el propietario

Estas son las identidades recomendadas. Son nombres propuestos; el propietario debe crearlas dentro de su tenant real de Microsoft 365 y completar MFA.

| Uso | Dirección recomendada | Tipo |
| --- | --- | --- |
| Administración diaria de Intune | `pda-admin@pikidelivery.com` | Administrador de Intune/Endpoint, MFA obligatorio |
| Emergencia / recuperación | `pda-breakglass@pikidelivery.com` | Cuenta de emergencia, protegida y sin uso diario |
| Contacto técnico opcional | `it@pikidelivery.com` | Buzón de soporte, no usar como identidad compartida de inicio de sesión |

Recomendación: no usar `admin@` como cuenta diaria y no compartir contraseñas. La cuenta `pda-breakglass` debe tener una contraseña larga guardada en un gestor seguro, MFA independiente y alertas de uso.

## Alta inicial de Microsoft 365

1. Comprar o abrir el tenant de Microsoft 365 de PIKI con el propietario legal.
2. Añadir y verificar el dominio `pikidelivery.com` mediante el registro TXT que entregue Microsoft.
3. Crear `pda-admin@pikidelivery.com`.
4. Crear `pda-breakglass@pikidelivery.com`.
5. Activar MFA para ambas cuentas.
6. Asignar licencia adecuada a la cuenta diaria. Para Intune suele utilizarse Microsoft 365 Business Premium o una licencia equivalente con Intune Plan 1 y Entra ID.
7. No asignar una licencia cotidiana a la cuenta de emergencia salvo que la política de Microsoft lo requiera; debe conservar capacidad de recuperación administrativa.
8. En Entra ID, crear un grupo dinámico o estático llamado `PIKI-PDA-Production`.

## Activación de Intune y Android Enterprise

1. Entrar en el centro de administración de Intune con `pda-admin@pikidelivery.com`.
2. Activar la conexión Android Enterprise.
3. Aceptar los términos de Google Android Enterprise como propietario autorizado.
4. Crear el grupo `PIKI-PDA-Production`.
5. Crear un perfil de inscripción de dispositivo dedicado.
6. Seleccionar **Corporate-owned dedicated devices**.
7. Usar inscripción mediante QR para las SUNMI nuevas y legítimamente desvinculadas.
8. Generar un token o QR independiente por lote de dispositivos.

## Política de quiosco

Crear una política de configuración de dispositivo Android Enterprise Dedicated Device:

```text
Nombre: PIKI PDA - Dedicated Kiosk - Production
Plataforma: Android Enterprise
Tipo: Fully Managed / Dedicated Device
Modo: Single app kiosk
Aplicación permitida: com.pikidelivery.partners
Bloquear salir del quiosco: Sí
Bloquear aplicaciones recientes: Sí
Bloquear cambiar de usuario: Sí
Bloquear ajustes del sistema: Sí
Bloquear instalación desde fuentes desconocidas: Sí
Bloquear depuración USB: Sí
Bloquear restablecimiento local: Sí
Permitir notificaciones: Sí
Permitir vibración: Sí
Permitir sonido: Sí
Permitir cámara: No, salvo que una futura versión la necesite
Capturas de pantalla: No en producción
```

Permitir únicamente las redes Wi-Fi de PIKI o del establecimiento. La contraseña Wi-Fi debe entregarse mediante la política MDM, no escribirse en esta documentación.

## Aplicación PIKI

Añadir el APK firmado como **Managed Google Play private app** o como aplicación LOB de Intune:

```text
Package name: com.pikidelivery.partners
Display name: PIKI Partner Orders
Install: Required
Launch automatically: Enabled
Uninstall: Blocked
Update: Automatic, outside service peak if possible
```

El APK no debe distribuirse como debug. La release necesita la clave de subida real de PIKI y la huella SHA-256 esperada.

## Enrolamiento de una SUNMI

1. Confirmar que la PDA es propiedad legítima de PIKI o del partner.
2. Confirmar que no aparece el nombre de otra empresa durante el primer arranque.
3. Confirmar que no solicita la cuenta Google anterior.
4. Restablecer la PDA desde Android.
5. En la pantalla inicial, activar el lector QR de provisioning con el gesto de Android Enterprise.
6. Escanear el QR de Intune.
7. Esperar a que se instale la política.
8. Esperar a que se instale `PIKI Partner Orders`.
9. Confirmar que entra automáticamente en quiosco.
10. Etiquetar físicamente el dispositivo con su identificador MDM, local y fecha de alta.

Si aparece FRP, Zero-touch o una política anterior, detener el proceso y pedir al propietario anterior o al distribuidor la desvinculación oficial.

## Red y sistema

La política debe aplicar:

```text
Zona horaria: Europe/Madrid
Fecha y hora automáticas: Activadas
Idioma: Español
Formato horario: 24 horas
Wi-Fi corporativa: Configurada por MDM
Datos móviles de respaldo: Según tarifa del dispositivo
Optimización de batería para PIKI: Excluida
Ejecución en segundo plano: Permitida
Reinicio programado: Fuera del horario operativo
Brillo: Suficiente para cocina
```

## URL PDA y DNS

La aplicación ya activa el modo PDA cuando el hostname es exactamente `partners-pda.pikidelivery.com` o empieza por `partners-pda.`.

En el proveedor DNS de `pikidelivery.com`:

```text
Tipo: CNAME
Nombre: partners-pda
Destino: el destino de dominio que indique Vercel para el proyecto piki-partner
TTL: Automático
```

Después, en el proyecto Vercel que ya sirve `partners.pikidelivery.com`:

1. Añadir el dominio `partners-pda.pikidelivery.com`.
2. Esperar la validación DNS y TLS.
3. Verificar que responde HTTP 200.
4. Abrir la URL en un navegador normal y confirmar la etiqueta `MODO PDA OPERATIVO`.
5. Instalar el APK para producción; la URL queda como fallback PWA.

No se debe crear un segundo proyecto Vercel. El subdominio debe apuntar al proyecto existente de `piki-partner`.

## Checklist de producción

- [ ] Dominio `pikidelivery.com` verificado en Microsoft 365.
- [ ] `pda-admin@pikidelivery.com` creado y protegido con MFA.
- [ ] `pda-breakglass@pikidelivery.com` creado y guardado en gestor seguro.
- [ ] Intune conectado con Android Enterprise.
- [ ] Grupo `PIKI-PDA-Production` creado.
- [ ] Política Dedicated Device asignada.
- [ ] APK firmado cargado como aplicación obligatoria.
- [ ] DNS de `partners-pda` creado.
- [ ] Dominio añadido en el proyecto Vercel existente.
- [ ] SUNMI de prueba restablecida legítimamente.
- [ ] Enrolamiento QR completado.
- [ ] Pedido recibido y notificación comprobada.
- [ ] Impresión 58 mm comprobada con y sin QR/PIN.
- [ ] Reinicio y reconexión comprobados.
- [ ] Salida de emergencia probada únicamente desde Intune.

## Criterio de salida de emergencia

El partner no debe tener un código local para escapar del quiosco. La salida debe realizarla un administrador desde Intune:

1. Retirar temporalmente el dispositivo del perfil kiosk o enviar la acción administrativa correspondiente.
2. Diagnosticar el dispositivo.
3. Volver a asignar la política.
4. Confirmar que la PDA regresa a `PIKI Partner Orders`.

Todas las acciones administrativas deben quedar registradas en Intune.
