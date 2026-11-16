# APK de producción de PIKI Partner Orders

## Identidad Android

```text
Application ID: com.pikidelivery.partners
Nombre: PIKI Partner Orders
Min SDK: 24
Target SDK: 36
Impresora: woyou.aidlservice.jiuiv5
API de producción: https://api.pikidelivery.com
```

## Importante sobre la firma

No se debe inventar una keystore para producción. La keystore de subida debe ser propiedad de PIKI, tener copia de seguridad cifrada y conservarse fuera del repositorio.

El workflow `.github/workflows/android.yml` ya está preparado para:

- validar identidad canónica del paquete;
- ejecutar check, lint equivalente y pruebas;
- compilar el código Android;
- exigir una keystore de subida existente;
- construir AAB firmado y APK firmado;
- comprobar certificado, versión y metadatos;
- guardar los artefactos como artifacts privados del workflow.

## Secretos de GitHub necesarios

En el repositorio privado `rrhhmilchollos-jpg/piki-partner`, configurar en **Settings → Secrets and variables → Actions**:

```text
PIKI_SIGNING_KEYSTORE_BASE64
PIKI_SIGNING_STORE_PASSWORD
PIKI_SIGNING_KEY_ALIAS
PIKI_SIGNING_KEY_PASSWORD
```

Configurar como variables:

```text
PIKI_EXPECTED_UPLOAD_CERT_SHA256
PIKI_PLAY_MAX_VERSION_CODE
```

La keystore se convierte a Base64 únicamente para almacenarla como secreto de GitHub. No se debe imprimir en logs.

## Generación del APK

Una vez configurados los secretos, hacer push a `main` o ejecutar el workflow Android. El job `signed-release` generará:

```text
piki-partner-signed-release-apk
  android/app/build/outputs/apk/release/app-release.apk

piki-partner-signed-release-aab
  android/app/build/outputs/bundle/release/app-release.aab
```

El APK es el archivo adecuado para instalarlo directamente mediante Intune. El AAB se reserva para Google Play Managed Google Play.

## Instalación en Intune

1. Descargar el artifact `piki-partner-signed-release-apk` desde GitHub Actions.
2. En Intune elegir **Apps → Android → Add**.
3. Seleccionar aplicación LOB o el método de aplicación privada que utilice el tenant.
4. Subir `app-release.apk`.
5. Confirmar el package name `com.pikidelivery.partners`.
6. Asignar como Required al grupo `PIKI-PDA-Production`.
7. Aplicar la política de quiosco.
8. Enrolar una SUNMI de prueba.

## Pruebas obligatorias del APK

- Arranque automático.
- Login de empleado.
- Selección del establecimiento.
- Pedido entrante y notificación.
- Aceptación y preparación.
- Impresión sin QR.
- Impresión con `pickupQrUrl` real.
- Impresión con `pickupPin` real.
- Reconexión de la impresora tras reinicio.
- Reconexión de sesión tras pérdida temporal de red.
- Bloqueo de salida mediante Intune.

No se debe subir a producción un APK si la validación de la firma, el package name o la identidad de subida falla.
