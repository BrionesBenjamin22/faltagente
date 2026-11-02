# Falta Gente

Nombre y convenciones vigentes: [identidad de Falta Gente](docs/agent/NAMING.md). Los identificadores técnicos heredados que mantienen sesiones o datos se conservan por compatibilidad.

Para ejecutar la aplicación localmente, seguir el [instructivo de desarrollo](#levantar-el-proyecto-en-desarrollo).

## Siempre falta gente para jugar

Falta Gente nace para resolver una necesidad concreta: **conectar partidos deportivos que necesitan participantes con personas que tienen ganas de jugar**.

La idea es simple:

> Ya tenés el partido, el lugar y el horario. Te faltan personas. Publicás los lugares disponibles y cualquier usuario interesado puede reservar uno o más lugares para sumarse.

El problema no es exclusivo del fútbol. Puede pasar en un fútbol 5, un partido de pádel, básquet, vóley o cualquier otro deporte donde exista un encuentro organizado con lugares por completar.

La plataforma busca conectar esas dos situaciones:

- alguien organiza un partido y necesita completar lugares;
- otra persona quiere practicar un deporte y busca dónde sumarse.

El deporte pertenece al partido, no al usuario. Una misma persona puede organizar fútbol un día, sumarse a un partido de pádel otro y buscar básquet durante el fin de semana.

## Buena fe y respeto por el partido ajeno

Cualquier persona registrada puede reservar un lugar disponible.

La primera versión de Falta Gente se basa en algo muy simple: la buena fe de la comunidad.

> **Si reservás, comprometete a ir. Si no podés, avisá con tiempo. El partido ajeno se respeta.**

No reserves lugares que no vas a utilizar.

No te bajes a último momento si podés evitarlo.

Respetá al organizador, a quienes se anotaron y las condiciones publicadas del partido.

La aplicación no busca complicar algo que debería ser sencillo. El objetivo es facilitar que un encuentro deportivo se complete y que personas que no se conocen puedan jugar juntas.

A futuro, la plataforma podrá registrar cancelaciones tardías y utilizar esa información para mecanismos de reputación o convivencia. Esa política no forma parte del alcance inicial.

## Qué busca resolver

Falta Gente apunta a este flujo principal:

1. Alguien organiza un partido.
2. Elige el deporte.
3. Define lugar, fecha, horario, precio y lugares disponibles.
4. Publica el partido.
5. Otra persona entra a Falta Gente.
6. Busca partidos por localidad, deporte y fecha.
7. Encuentra uno que le interesa.
8. Reserva uno o más lugares.
9. Va a jugar.

La idea central puede resumirse así:

> **Publicar → descubrir → reservar → jugar.**

El deporte cambia el contexto del partido, pero no el flujo principal.

## Alcance multideporte

Cada partido está asociado a un deporte.

Catálogo inicial implementado:

- Fútbol
- Pádel
- Básquet
- Vóley

Un deporte puede tener formatos o modalidades propias cuando sea necesario.

Por ejemplo:

```text
Fútbol
├── Fútbol 5
├── Fútbol 6
└── Fútbol 7

Básquet
├── 3x3
└── 5x5

Pádel
└── Dobles
```

El objetivo no es implementar reglas particulares para todos los deportes desde el comienzo, sino mantener un dominio común para:

- publicación de partidos;
- descubrimiento;
- reservas;
- acompañantes;
- cancelaciones;
- participación;
- lista de espera;
- notificaciones.

Las reglas específicas de cada deporte se incorporarán únicamente cuando exista una necesidad real.

## Funciones principales del MVP

El alcance objetivo contempla las siguientes funciones. El apartado «Estado actual del desarrollo» distingue las implementadas de las pendientes:

- registro e inicio de sesión;
- verificación y recuperación de cuenta;
- perfil editable;
- localidad principal;
- búsqueda temporal en otras localidades;
- catálogo de deportes;
- filtrado de partidos por deporte, localidad y fecha;
- publicación de partidos;
- asociación de cada partido a un deporte;
- formatos deportivos opcionales;
- reserva de uno o más lugares;
- acompañantes opcionales;
- cancelación de reservas;
- cancelación de partidos;
- lista de espera para partidos completos;
- consulta de partidos organizados y reservados;
- historial;
- notificaciones relevantes;
- reglas comunitarias.

Un usuario no tiene un rol global de jugador u organizador.

La relación depende de cada partido:

```text
User
  ├── ORGANIZER en un partido
  └── PLAYER en otro
```

## Idea a futuro

A futuro podrían incorporarse funciones relacionadas con:

- complejos y espacios deportivos;
- disponibilidad de canchas;
- reservas de instalaciones;
- reputación;
- torneos;
- ligas;
- perfiles deportivos más completos;
- estadísticas específicas por deporte.

Pero eso viene después.

Primero hay que resolver bien algo mucho más simple:

> **Hay un partido. Faltan personas. Publico los lugares. Alguien los reserva. Jugamos.**

## Estado actual del desarrollo

La aplicación implementa registro y login local, sesión segura, verificación de email, recuperación de contraseña y descubrimiento de partidos por localidad. La selección temporal del Home es independiente de la localidad principal del perfil. Google y las reservas quedan para etapas posteriores.

La segunda iteración agrega edición del perfil con historial privado, cambio de contraseña con cierre de todas las sesiones, localidades buscables, navegación de cuenta y temas claro, oscuro y sistema.

MVP-01 generaliza el dominio de partidos a deporte y formato opcional. El catálogo persistido incluye Fútbol, Pádel, Básquet y Vóley; el listado conserva sus filtros por localidad y muestra los nombres recibidos de la API. No agrega selección de deporte, publicación ni reservas. Consultar [el contrato y la migración multideporte](apps/api/MULTISPORT.md).

MVP-02 extiende ese listado con filtros combinables de deporte, formato opcional y fecha local de Buenos Aires. Los selectores consumen el catálogo real, conservan la localidad temporal y la carga progresiva de nueve resultados. Los filtros se reflejan en la URL y admiten navegación atrás/adelante. Detalle, publicación y reservas continúan fuera de esta entrega.

Google OAuth también continúa pendiente. Los flujos de publicación y reserva descritos en la visión del producto representan el objetivo del MVP.

- [Backend: configuración, persistencia y contratos](apps/api/VERTICAL-SLICE.md).
- [Backend: perfil e historial privado](apps/api/PROFILE.md).
- [Frontend: vistas, sesión y filtros](apps/web/FRONTEND.md).
- [Pruebas de la vertical slice](tests/README.md).

## Levantar el proyecto en desarrollo

### Requisitos

- Node.js **22.17 o superior dentro de la versión 22**; consultar `.nvmrc`.
- pnpm **10.33.2**.
- Docker con Docker Compose disponible y el motor iniciado (Docker Desktop en Windows).
- Puertos **3000** (frontend), **3001** (API) y **5432** (PostgreSQL) disponibles.

Los pasos siguientes se ejecutan desde la raíz del repositorio. Los comandos de copia usan PowerShell; en Linux/macOS reemplazar `Copy-Item origen destino` por `cp origen destino`.

### 1. Instalar dependencias

```powershell
corepack enable
corepack prepare pnpm@10.33.2 --activate
pnpm install --frozen-lockfile
```

### 2. Configurar las variables de entorno

Crear el archivo para Docker y completar sus valores antes de continuar:

```powershell
Copy-Item .env.example .env
```

En `.env`, conservar la configuración local y completar los campos vacíos:

```dotenv
NODE_ENV=development
PORT=3001
CORS_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000

POSTGRES_USER=hyt
POSTGRES_DB=hyt
POSTGRES_PORT=5432
POSTGRES_PASSWORD=<contraseña-local>
DOCKER_DATABASE_URL=postgresql://hyt:<password-codificada>@db:5432/hyt?schema=public
DATABASE_URL=postgresql://hyt:<contraseña-local>@localhost:5432/hyt?schema=public

JWT_SECRET=<secreto-aleatorio>
CSRF_SECRET=<otro-secreto-aleatorio>

RESEND_API_KEY=
EMAIL_FROM=
```

> **Nota:** los identificadores internos `hyt` se mantienen mientras sigan siendo los utilizados por la configuración actual del proyecto. El cambio de nombre comercial a Falta Gente no requiere renombrar inmediatamente usuarios, bases o volúmenes internos.

Los valores entre `<...>` son marcadores: reemplazarlos. `DATABASE_URL` debe coincidir con el usuario, contraseña, puerto y base configurados para Docker. Si la contraseña contiene caracteres especiales, codificarla para su uso dentro de una URL.

`JWT_SECRET` y `CSRF_SECRET` deben ser distintos y tener al menos 32 caracteres. Para generar cada valor localmente, ejecutar este comando por separado; también puede usarse para generar una contraseña de base sin caracteres especiales:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copiar el archivo ya configurado a la carpeta de la API. Nest y Prisma utilizan `apps/api/.env`; Docker Compose utiliza el `.env` de la raíz. Mantener ambos sincronizados si cambia la configuración del backend:

```powershell
Copy-Item .env apps/api/.env
```

Crear **`apps/web/.env.local`** con estas variables públicas, sin copiar secretos del backend:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_SESSION_WARNING_SECONDS=120
```

Para recibir emails reales de verificación y recuperación, completar `RESEND_API_KEY` y `EMAIL_FROM` con la configuración de Resend. Sin esos valores, el desarrollo permite registro/login y explorar partidos, pero no entrega los emails. Las pruebas cubren esos flujos con un transporte de email fake; no existe una bandeja de prueba en la aplicación.

Los archivos `.env` y `.env.local` están ignorados por Git. No versionar sus valores.

### 3. Preparar la base de datos

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait db
pnpm --filter api db:generate
pnpm --filter api db:migrate
```

Docker levanta PostgreSQL con PostGIS y conserva los datos en el volumen `hyt-postgres`. `db:migrate` aplica las migraciones existentes, incluido el historial del perfil.

Cargar los catálogos de deportes, formatos y localidades de La Plata:

```powershell
pnpm --filter api exec node --env-file=.env --import tsx prisma/seed.ts
```

Para demostrar el filtro con partidos ficticios en Tolosa, City Bell y Los Hornos, ejecutar además:

```powershell
pnpm --filter api exec node --env-file=.env --import tsx prisma/seed.ts --development
```

Los seeds son idempotentes. Estos comandos cargan explícitamente `apps/api/.env` porque el seed no inicia Nest ni carga sus variables automáticamente. Los datos ficticios son exclusivos de desarrollo; no ejecutar `--development` contra producción.

### 4. Iniciar API y frontend

Abrir dos terminales en la raíz del repositorio y mantenerlas abiertas.

**Terminal 1 — API:**

```powershell
pnpm dev:api
```

**Terminal 2 — frontend:**

```powershell
pnpm dev:web
```

| Servicio | Dirección |
| --- | --- |
| Aplicación | http://localhost:3000 |
| API | http://localhost:3001/api/v1 |
| Health check | http://localhost:3001/health |
| OpenAPI JSON | http://localhost:3001/api/v1/docs-json |

Usar **`localhost`** para acceder desde el navegador: las cookies de sesión mantienen `Secure` también en desarrollo. No intercambiarlo con `127.0.0.1` ni con la IP de la red sin configurar HTTPS y los orígenes correspondientes.

### 5. Probar el flujo actualmente implementado

1. Abrir la aplicación y seleccionar **Crear cuenta**.
2. Completar nombre, email y una contraseña de entre 8 y 128 caracteres (mínimo temporal autorizado).
3. Buscar **Tolosa** y seleccionarla como localidad principal.
4. Registrarse: se inicia sesión y aparece el Home con los partidos de Tolosa.
5. Cambiar temporalmente el selector a **City Bell** para comprobar que cambia el listado sin modificar el perfil.
6. Seleccionar un deporte y, cuando corresponda, un formato. Comprobar que el listado muestra sólo partidos compatibles.
7. Combinar con **Hoy**, **Mañana** o una fecha elegida. La fecha se interpreta en la zona de Buenos Aires y sólo incluye partidos futuros.
8. Usar **Limpiar filtros**, la navegación atrás/adelante y **Cargar más partidos** cuando haya más de nueve resultados.
9. Desde **Cuenta**, acceder al perfil, seguridad, apariencia o cerrar sesión.
10. Al ingresar nuevamente, el filtro inicial vuelve a la localidad principal.

### Detener y volver a iniciar

Detener API y frontend con `Ctrl+C` en sus terminales. Para detener la base conservando los datos:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml stop db
```

En siguientes ejecuciones basta con iniciar la base y ambos servidores. Después de actualizar el código, instalar dependencias si cambió el lockfile y ejecutar `db:generate` y `db:migrate` si cambió Prisma. Los partidos de demostración tienen fechas futuras al ejecutar el seed; si ya pasaron, volver a ejecutar el seed de desarrollo.

### Problemas frecuentes

- **Puerto 5432 ocupado:** cambiar `POSTGRES_PORT` y el puerto de `DATABASE_URL`, sincronizar `.env` con `apps/api/.env` y volver a iniciar la base.
- **Error de variables faltantes:** revisar `apps/api/.env`, los secretos y `DATABASE_URL`; reiniciar la API después de editarlos.
- **Error de conexión o autenticación de PostgreSQL:** comprobar `docker compose ps` y `docker compose logs db`. Cambiar `POSTGRES_PASSWORD` en `.env` no modifica la contraseña de una base que ya existe en el volumen.
- **Registro sin localidades o Home vacío:** ejecutar los seeds y verificar que las migraciones están aplicadas. El catálogo y los partidos de demostración se cargan por separado.
- **Sesión o CORS fallan:** usar `http://localhost:3000`, comprobar `NEXT_PUBLIC_API_URL` y mantener `FRONTEND_URL` dentro de `CORS_ORIGINS`. Reiniciar el frontend si cambian sus variables.
- **No llegan emails:** configurar Resend y un remitente autorizado; sin proveedor configurado no se envían enlaces en desarrollo.

## Validaciones

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test:integration` requiere PostgreSQL aislado. `pnpm test:e2e` requiere el frontend compilado levantado y utiliza una API real con transporte de email en memoria. Seguir [tests/README.md](tests/README.md) para preparar el entorno de pruebas; no ejecutar estas suites contra la base de desarrollo habitual ni producción.

## Stack completo con Docker

Consultar [la guía Docker](docs/DOCKER.md) para construir web/API, levantar los tres servicios, aplicar migraciones manuales y operar el stack. Compose base no expone PostgreSQL; el desarrollo con procesos en host requiere el override documentado.
