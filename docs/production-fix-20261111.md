# PIKI Partner — corrección 11/11/2026

Se unifica el icono web y Android con el PNG canónico de la ficha PIKI Partner Orders en Google Play. Se preservan applicationId, nombre instalado y versionCode. Web usa /piki-api con rewrite hacia https://api.pikidelivery.com; Android usa un origen HTTPS absoluto y no depende del proxy Vercel desde localhost.

Validado: TypeScript, 24 regresiones frontend, build web, cap sync y comprobación de identidad sincronizada; 50 regresiones de identidad/firma/workflows. Release Android requiere la keystore de subida existente, certificado y versionCode superior al máximo Play. No hay fallback unsigned. La publicación Play solo es manual a internal draft con run ID y SHA exactos.

Pendientes: build AAB firmado e instalación física, capturas auténticas de pantallas operativas para corregir Metadatos, sesión de cocina y recorrido comercial real. Este commit no declara aprobado Google Play ni E2E.
