# Desplegar BestMe

Guía para poner el backend en la nube y apuntar la app hacia él.

---

## 1. Antes de nada: la clave de IA

Sin ella la app funciona, pero los análisis de comida y de composición corporal
devuelven **datos de ejemplo** (marcados con `[EJEMPLO]` y confianza 0).

1. Entra en <https://console.anthropic.com> → **API Keys** → *Create Key*.
2. Guárdala; solo se muestra una vez.

Coste orientativo: ~US$0,01 por foto. Con 5 comidas al día, ~US$1,5/mes.

---

## 2. Genera los secretos

```bash
python -c "import secrets; print('JWT_SECRET_KEY=' + secrets.token_urlsafe(64))"
```

La app **se niega a arrancar en producción** si `JWT_SECRET_KEY` sigue siendo el valor
por defecto, si `CORS_ORIGINS` es `*`, o si `DEBUG=true`. Es deliberado: cualquiera de
las tres cosas en producción es un agujero de seguridad.

---

## 3. Desplegar en Railway

Railway incluye PostgreSQL gestionado y despliega desde el repositorio. Para un
proyecto personal ronda los US$5/mes.

```bash
npm install -g @railway/cli
```
```bash
railway login
```

Desde la carpeta del proyecto:

```bash
railway init
```
```bash
railway add --database postgres
```

Railway inyecta `DATABASE_URL` automáticamente, **pero en formato `postgresql://`**.
El backend usa asyncpg y necesita `postgresql+asyncpg://`. Configúrala explícitamente
en el panel (Variables), junto al resto:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://...` (copia la de Railway y añade `+asyncpg`) |
| `JWT_SECRET_KEY` | la que generaste en el paso 2 |
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `ENVIRONMENT` | `production` |
| `DEBUG` | `false` |
| `CORS_ORIGINS` | `["https://tu-dominio.com"]` — nunca `*` |

Despliega:

```bash
railway up
```

Aplica las migraciones una vez que esté arriba:

```bash
railway run alembic upgrade head
```

Comprueba que responde:

```bash
curl https://tu-app.up.railway.app/api/health
```

Debe devolver `{"status":"ok",...,"database":"healthy"}`.

> **Alternativas equivalentes:** Render y Fly.io funcionan igual de bien. El `Dockerfile`
> lee `PORT` del entorno, que es lo que las tres plataformas asignan en tiempo de ejecución.

---

## 4. Apuntar la app al backend

En `mobile/.env`:

```
EXPO_PUBLIC_API_URL=https://tu-app.up.railway.app/api
```

Expo solo expone al bundle las variables con prefijo `EXPO_PUBLIC_`. Después de cambiarla
hay que reiniciar limpiando la caché:

```bash
npx expo start -c
```

### Para desarrollo local

| Dónde corre la app | URL |
|---|---|
| Web / simulador iOS | `http://localhost:8000/api` |
| Emulador Android | `http://10.0.2.2:8000/api` |
| Teléfono físico (misma WiFi) | `http://<IP-LAN-de-tu-PC>:8000/api` |

En un teléfono físico `localhost` es el propio teléfono, nunca tu ordenador. Averigua tu
IP con `ipconfig` (Windows) y usa esa. El backend debe escuchar en `0.0.0.0`, no en
`127.0.0.1`, o el teléfono no lo alcanzará.

---

## 5. Compilar la app

```bash
npm install -g eas-cli
```
```bash
eas login
```
```bash
eas build:configure
```

Para instalarla en tu teléfono Android:

```bash
eas build --platform android --profile preview
```

> **Cuando llegue el entrenador con cámara real** hará falta un *Development Build*
> (`--profile development`), porque `react-native-vision-camera` incluye código nativo
> que Expo Go no puede cargar. A partir de ahí Expo Go deja de servir para este proyecto.

---

## 6. Comprobaciones de seguridad antes de publicar

- [ ] `JWT_SECRET_KEY` generado, distinto del de desarrollo
- [ ] `CORS_ORIGINS` con dominios explícitos, sin `*`
- [ ] `DEBUG=false` (con `true`, SQLAlchemy escribe **todas** las consultas en los logs, incluidos los hashes de contraseñas)
- [ ] `ENVIRONMENT=production` (activa las validaciones de arranque)
- [ ] `.env` fuera del repositorio — ya está en `.gitignore`, verifícalo con `git status`
- [ ] Rate limiting activo: 20 peticiones/minuto por usuario en los endpoints de IA

---

## Ejecutar en local con Docker

```bash
docker compose up --build
```
```bash
docker compose exec api alembic upgrade head
```

Documentación interactiva de la API en <http://localhost:8000/docs>.

`docker-compose.yml` sobrescribe el comando del contenedor con `--reload` para
desarrollo. La imagen por sí sola arranca gunicorn con supervisión de workers,
que es lo que se usa en producción.
