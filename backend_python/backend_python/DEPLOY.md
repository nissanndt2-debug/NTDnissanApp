# Desplegar el backend

Dos rutas segun para que es:

| | Para prueba (esta guia) | Para produccion en planta |
|---|---|---|
| Costo | **$0/mes** (o centavos) | ~$25-35/mes |
| Base de datos | Neon (Postgres gratis) | Azure Database for PostgreSQL |
| Registro de imagen | GitHub Container Registry (gratis) | Azure Container Registry |
| Backend | Azure Container Apps (capa gratuita) | Azure Container Apps |

No se eligio Azure Kubernetes Service (AKS) para ninguna de las dos: es para flotas de microservicios, no para un backend monolito de este tamano.

---

## Ruta barata (prueba)

La idea: Azure Container Apps tiene una capa **siempre gratis** (180,000
vCPU-segundos + 360,000 GiB-segundos + 2M peticiones/mes) que para trafico de
prueba no se agota. Lo unico que cuesta dinero en el plan "todo Azure" es la
base de datos administrada y el registro de imagenes — asi que esos dos se
reemplazan por alternativas gratuitas que hablan el mismo protocolo (Postgres
estandar, registro de contenedores OCI estandar). Cero cambios de codigo.

### 1. Base de datos — Neon (gratis, no expira)

1. Crea cuenta en [neon.tech](https://neon.tech) (con GitHub, un clic).
2. "Create a project" → copia el **connection string** que te dan (algo como
   `postgresql://usuario:password@ep-xxx.neon.tech/nissan_body?sslmode=require`).
3. Carga el schema:
   ```bash
   psql "<tu-connection-string-de-neon>" -f db-init/01-schema.sql
   psql "<tu-connection-string-de-neon>" -f db-init/02-admin.sql
   ```

### 2. Imagen Docker — GitHub Container Registry (gratis)

```bash
# Un Personal Access Token con permiso "write:packages" (GitHub -> Settings -> Developer settings -> Tokens)
echo "<tu-token>" | docker login ghcr.io -u <tu-usuario-github> --password-stdin

docker build -t ghcr.io/<tu-usuario-github>/body-app-backend:latest .
docker push ghcr.io/<tu-usuario-github>/body-app-backend:latest
```

Si el repo es privado, hazlo publico en GitHub (Settings del paquete) para
que Container Apps lo jale sin credenciales — mas simple para pruebas. Si
necesita quedarse privado, hay que pasarle `--registry-username`/`--registry-password`
al `az containerapp create` de abajo.

### 3. Backend — Azure Container Apps (capa gratis)

```bash
az login
RESOURCE_GROUP=nissan-bodyapp-test-rg
LOCATION=eastus2

az group create --name $RESOURCE_GROUP --location $LOCATION
az extension add --name containerapp --upgrade

az containerapp env create \
  --resource-group $RESOURCE_GROUP \
  --name nissan-bodyapp-test-env \
  --location $LOCATION

az containerapp create \
  --resource-group $RESOURCE_GROUP \
  --name body-app-backend-test \
  --environment nissan-bodyapp-test-env \
  --image ghcr.io/<tu-usuario-github>/body-app-backend:latest \
  --target-port 3001 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 1 \
  --cpu 0.25 --memory 0.5Gi \
  --env-vars \
    NODE_ENV=production \
    PORT=3001 \
    CORS_ORIGIN="*" \
    JWT_SECRET=secretref:jwt-secret \
    DATABASE_URL=secretref:database-url \
  --secrets \
    jwt-secret="$(openssl rand -hex 32)" \
    database-url="<tu-connection-string-de-neon>"
```

`--min-replicas 0` + `--cpu 0.25` es el tamano minimo que Container Apps
permite — junto con el trafico bajo de una prueba, esto se queda dentro de la
capa gratis. El comando imprime la URL publica al terminar
(`https://body-app-backend-test.<hash>.eastus2.azurecontainerapps.io`).

### 4. Fotos — Cloudinary (gratis, sin tarjeta)

Se puede dejar sin configurar — el endpoint responde 501 explicito y el
resto de la app funciona igual. Si las quieres desde ya:

1. Crea cuenta en [cloudinary.com](https://cloudinary.com) (gratis, no pide tarjeta).
2. En el Dashboard copia el valor de **"API Environment variable"**
   (formato `cloudinary://<api_key>:<api_secret>@<cloud_name>`).
3. Agrega `CLOUDINARY_URL=<ese-valor>` como variable de entorno del backend
   (en Render: Environment; en Container Apps: `--secrets` + `--env-vars`
   igual que `DATABASE_URL`).

### 5. Verificar

```bash
curl https://<tu-url-de-container-apps>/health
```

### 6. Apuntar la app movil aqui

En `TestApp/eas.json`, perfil de build que uses, cambia:
```json
"EXPO_PUBLIC_API_BASE_URL": "https://<tu-url-de-container-apps>"
```
y genera un build nuevo (`eas build --platform android --profile interna`).

---

## Ruta de produccion (planta, trafico real, backups administrados)

Ver la version anterior de esta guia — cambia solo dos piezas respecto a la
ruta barata:

- **Base de datos**: Azure Database for PostgreSQL Flexible Server (Burstable
  B1ms, ~$12-15/mes) en vez de Neon — backups automaticos administrados por
  Azure, sin depender de un tercero.
- **Registro**: Azure Container Registry (Basic, ~$5/mes) en vez de GitHub
  Container Registry — integracion nativa con Container Apps sin tocar
  credenciales.

```bash
DB_SERVER_NAME=nissan-bodyapp-db   # unico globalmente
DB_ADMIN_USER=bodyappadmin
DB_ADMIN_PASSWORD='CambiaEstaClave123!'

az postgres flexible-server create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER_NAME \
  --location $LOCATION \
  --admin-user $DB_ADMIN_USER \
  --admin-password $DB_ADMIN_PASSWORD \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --public-access 0.0.0.0-255.255.255.255

az postgres flexible-server db create --resource-group $RESOURCE_GROUP --server-name $DB_SERVER_NAME --database-name nissan_body

psql "host=$DB_SERVER_NAME.postgres.database.azure.com port=5432 dbname=nissan_body user=$DB_ADMIN_USER password=$DB_ADMIN_PASSWORD sslmode=require" \
  -f db-init/01-schema.sql

ACR_NAME=nissanbodyappacr   # unico globalmente
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic --admin-enabled true
az acr build --registry $ACR_NAME --image body-app-backend:latest .
```

Sube `--min-replicas` a 1 si no quieres el arranque en frio de "escala a
cero" en horario de planta, y restringe el firewall de Postgres a la IP
saliente de Container Apps en vez de dejarlo abierto a todo internet.

---

## Actualizar una version nueva

```bash
# Ruta barata:
docker build -t ghcr.io/<usuario>/body-app-backend:latest . && docker push ghcr.io/<usuario>/body-app-backend:latest
az containerapp update --resource-group $RESOURCE_GROUP --name body-app-backend-test --image ghcr.io/<usuario>/body-app-backend:latest

# Ruta de produccion:
az acr build --registry $ACR_NAME --image body-app-backend:latest .
az containerapp update --resource-group $RESOURCE_GROUP --name body-app-backend --image "$ACR_NAME.azurecr.io/body-app-backend:latest"
```

## Notas

- **CORS_ORIGIN=`*`** esta bien para una prueba (nadie mas lo usa); en
  produccion hay que ponerlo a la URL real del dashboard web.
- **La app movil (TestApp) no se despliega aqui** — eso es EAS Build/Update,
  un flujo completamente distinto (ver `eas.json` en la raiz del repo del
  frontend).
