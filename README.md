# NoticiasBreves — AO1 Programación de Aplicaciones Web II

**Alumno/a:** Ortiz Juan Ignacio     
**Fecha de entrega:** _(completar)_  
**Enlace al repositorio:** 

---

## Punto 1 — Diagrama de Flujo

El diagrama de flujo completo se encuentra en la carpeta `/docs/`:

- **Imagen exportada:** `/docs/diagrama-flujo.png`
- **Archivo editable:** `/docs/diagrama-flujo.puml` (PlantUML, importable en draw.io)

El diagrama cubre los 10 requisitos del enunciado: inicio del servidor, recepción de la petición, bifurcación GET/POST, verificación de caché, lectura de archivo con `fs`, resolución MIME, generación de respuesta dinámica, captura de chunks POST, persistencia con `appendFile`, y códigos 200/404/500.

---

## Punto 2 — Arquitectura y Selección de Librerías

### 2.a — Módulos nativos de Node.js

#### Módulo `http`

**Propósito general:** es el módulo que permite crear y gestionar un servidor web en Node.js. Sin él no existiría el servidor.

**Funciones usadas:**

- `http.createServer(callback)`: crea el servidor. El callback recibe `req` (la petición del cliente) y `res` (la respuesta que vamos a enviar). Se ejecuta cada vez que alguien hace una petición.
- `servidor.listen(puerto, callback)`: hace que el servidor empiece a escuchar conexiones en el puerto indicado. El callback se ejecuta una sola vez cuando el servidor ya está listo.
- `res.writeHead(código, headers)`: establece el código de estado HTTP (200, 302, 404, 500) y las cabeceras de la respuesta, como el `Content-Type`.
- `res.end(cuerpo)`: envía el cuerpo de la respuesta al cliente y cierra la conexión.

**Por qué se eligió:** es el módulo nativo de Node.js específicamente diseñado para trabajar con el protocolo HTTP. Como la consigna pide no usar frameworks, este módulo es la herramienta directa para construir el servidor.

---

#### Módulo `fs/promises`

**Propósito general:** permite leer y escribir archivos del sistema operativo. Se usa la variante `fs/promises` para trabajar con `async/await` de forma cómoda.

**Funciones usadas:**

- `fs.readFile(ruta, encoding)`: lee el contenido completo de un archivo. Se usa para leer `noticias.txt` y construir el listado o el detalle.
- `fs.appendFile(ruta, datos, encoding)`: agrega datos al final de un archivo sin borrar lo que ya está. Es la operación que persiste cada noticia nueva.
- `fs.stat(ruta)`: obtiene información sobre un archivo. Se usa para verificar si un archivo existe antes de intentar leerlo; si lanza error con `code === "ENOENT"`, el archivo no existe y se devuelve 404.

**Por qué se eligió:** es el único módulo de Node.js que permite trabajar con el sistema de archivos. La variante `fs/promises` se eligió por sobre la basada en callbacks porque el código queda más claro con `async/await` y evita el anidamiento excesivo.

---

#### Clase `URL` (módulo `url`)

**Propósito general:** permite analizar una URL y acceder a sus distintas partes (ruta, parámetros, etc.) de forma sencilla y estandarizada.

**Funciones y propiedades usadas:**

- `new URL(req.url, base)`: construye un objeto URL a partir de la ruta relativa que llega en la petición. Se pasa una base (`http://localhost:3000`) porque `req.url` es una ruta relativa y la clase URL necesita una URL completa.
- `urlObj.pathname`: devuelve solo la ruta, sin query string. Por ejemplo, de `/noticia?id=3` extrae `/noticia`.
- `urlObj.searchParams.get("id")`: devuelve el valor del parámetro `id` de la query string. Por ejemplo, de `/noticia?id=3` devuelve el string `"3"`.

**Por qué se eligió:** es la forma moderna y estándar de trabajar con URLs en Node.js, siguiendo la especificación WHATWG. Es más segura y clara que partir el string de la URL manualmente.

---

#### Módulo `path`

**Propósito general:** permite construir rutas del sistema de archivos de forma portable, sin preocuparse por las diferencias entre sistemas operativos (Linux usa `/`, Windows usa `\`).

**Funciones usadas:**

- `path.join(...segmentos)`: une segmentos de ruta con el separador correcto según el sistema. Se usa para construir la ruta completa a los archivos de la carpeta `public`.

**Por qué se eligió:** para no escribir rutas de archivo a mano con strings como `__dirname + "/public/" + pathname`, lo cual es propenso a errores y no funciona en todos los sistemas operativos.

---

### 2.b — Paquetes de npm

#### Paquete `mime`

**Instalación:**
```bash
npm install mime
```

**Versión utilizada:** `^4.1.0`

**Método principal:**
```js
mime.lookup(rutaOExtension)  // retorna string | false
```
Recibe una ruta de archivo o una extensión y devuelve el tipo MIME correspondiente. Por ejemplo: `mime.lookup("estilos.css")` devuelve `"text/css"`, y `mime.lookup("foto.png")` devuelve `"image/png"`. Si no reconoce la extensión retorna `false`, por eso se usa `|| "application/octet-stream"` como fallback.

> Nota: en mime v4 el método `getType()` fue renombrado a `lookup()`. Es importante verificar la versión instalada porque la API cambió entre versiones mayores.

**Por qué se eligió:** cuando el servidor sirve un archivo estático necesita indicar en la cabecera `Content-Type` qué tipo de contenido es, para que el navegador sepa cómo interpretarlo. Sin ese header, un archivo CSS podría no aplicarse correctamente. El paquete `mime` resuelve este problema consultando una tabla de extensiones conocidas, evitando tener que escribir un `switch` manual con todos los tipos posibles. Se eligió por sobre `mime-types` porque es más liviano y su API es directa.

---

## Punto 3 — Explicación de la Implementación

### Bloque A — Servidor HTTP y routing

El servidor se crea con `http.createServer()`, que recibe una función que se ejecuta cada vez que llega una petición. Dentro de esa función, primero se construye un objeto `URL` a partir de `req.url` para extraer de forma limpia el `pathname` (solo la ruta, sin parámetros) y el método (`req.method`).

El routing se implementa con una serie de `if / else if`. Cada condición combina el método y la ruta:

```js
if (metodo === "GET" && pathname === "/") { ... }
else if (metodo === "GET" && pathname === "/noticia") { ... }
else if (metodo === "POST" && pathname === "/publicar") { ... }
else if (metodo === "GET") { ... } // archivos estáticos
else { responderError(res, 404, ...) }
```

Cada rama llama a una función separada que se encarga de ese caso particular. Esto hace el código más organizado y fácil de leer que poner toda la lógica dentro de un solo bloque.

---

### Bloque B — Servicio de archivos estáticos con caché

Existe un objeto `cache = {}` que actúa como diccionario en memoria. Las claves son rutas absolutas de archivo y los valores son objetos con el contenido ya leído y su tipo MIME.

Cuando llega una petición de archivo estático, la función `servirEstatico` sigue este orden:

1. **Consulta la caché**: si `cache[rutaCompleta]` tiene algo, se sirve directamente desde memoria y se imprime `[CACHÉ HIT]` en consola. Esto ahorra el acceso al disco.
2. **Lee del disco**: si no está en caché, se llama a `fs.stat()` para verificar que el archivo exista. Si no existe, se devuelve 404. Si existe, se lee con `fs.readFile()`.
3. **Determina el tipo MIME**: se llama a `mime.lookup(rutaCompleta)` para obtener el `Content-Type` correcto según la extensión.
4. **Guarda en caché**: se almacena `{ contenido, tipo }` en `cache[rutaCompleta]` y se imprime `[CACHÉ MISS]`. La próxima vez que se pida ese archivo, vendrá de la caché.

---

### Bloque C — Captura de datos POST

Cuando el usuario envía el formulario, el navegador hace una petición HTTP POST con los datos en el cuerpo (body). En Node.js, el cuerpo de la petición no llega todo junto sino en fragmentos llamados *chunks*. Esto es porque Node.js usa streams: procesa los datos a medida que llegan, sin esperar a tener todo en memoria.

El mecanismo es el siguiente:

```js
let body = "";

req.on("data", (chunk) => {
  body += chunk.toString(); // acumulamos cada fragmento
});

req.on("end", async () => {
  // aquí body ya tiene todos los datos completos
});
```

El evento `"data"` se dispara cada vez que llega un fragmento; lo convertimos a string y lo sumamos a `body`. El evento `"end"` indica que no hay más datos.

Una vez ensamblado el body, tiene el formato `titulo=Hola&cuerpo=Mundo`. Se parsea con `new URLSearchParams(body)`, que lo convierte en un objeto del que podemos extraer los campos con `.get("titulo")` y `.get("cuerpo")`.

---

### Bloque D — Parámetros GET

Para la ruta `/noticia?id=3`, el parámetro `id` se obtiene así:

```js
const urlObj = new URL(req.url, `http://localhost:${PUERTO}`);
const id = parseInt(urlObj.searchParams.get("id"), 10);
```

`searchParams.get("id")` devuelve el string `"3"`. Se convierte a número entero con `parseInt`. Luego se valida: si no es un número o es menor a 1, se responde con 404. Si es válido, se lee `noticias.txt` con `readFile`, se divide en líneas y se accede a la posición `id - 1` (porque los arrays empiezan en 0). Si el número pedido es mayor a la cantidad de noticias que hay, también se responde 404.

---

### Bloque E — Persistencia en archivo de texto

El archivo `noticias.txt` funciona como una base de datos plana. Cada noticia ocupa una línea con el formato:

```
TITULO||CUERPO||FECHA
```

Se usa `||` como separador para evitar problemas con comas o puntos y coma que pueden aparecer en el texto.

- **Escritura**: `fs.appendFile(ARCHIVO_NOTICIAS, linea, "utf-8")` agrega la nueva línea al final del archivo sin borrar las anteriores. Es la operación que se ejecuta cuando llega un POST válido.
- **Lectura**: `fs.readFile(ARCHIVO_NOTICIAS, "utf-8")` devuelve el contenido completo como string. Se divide con `.split("\n")` para obtener un array de líneas, se filtran las vacías, y se parsea cada una dividiendo por `"||"` para obtener título, cuerpo y fecha por separado.

Si el archivo no existe todavía (primera ejecución antes de publicar algo), `readFile` lanza un error. Ese error se captura en el `catch` y se devuelve un array vacío, evitando que el servidor se caiga.

---

## Punto 4 — Código Funcional en Repositorio

### Cómo ejecutar

```bash
git clone <URL_DEL_REPOSITORIO>
cd mi-servidor-de-noticias-ortiz
npm install
node servidor.js
```

Abrir en el navegador: `http://localhost:3000`

### Estructura

```
mi-servidor-de-noticias-ortiz/
├── servidor.js          ← Servidor Node.js principal
├── public/
│   ├── formulario.html  ← Formulario de publicación
│   ├── estilos.css      ← Hoja de estilos
│   └── noticias.txt     ← Persistencia (inicia vacío)
├── docs/
│   ├── diagrama-flujo.png   ← Imagen exportada
│   └── diagrama-flujo.puml  ← Archivo fuente PlantUML
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

### Funcionalidades

| # | Funcionalidad | Dónde verificar |
|---|---------------|-----------------|
| F1 | El servidor arranca sin errores | `node servidor.js` |
| F2 | Sirve archivos estáticos | `GET /estilos.css`, `GET /formulario.html` |
| F3 | Caché en memoria | Logs en consola: `[CACHÉ HIT]` / `[CACHÉ MISS]` |
| F4 | Formulario POST guarda en noticias.txt | `POST /publicar` |
| F5 | Detalle de noticia por ID | `GET /noticia?id=1` |
| F6 | Listado dinámico en raíz | `GET /` |
| F7 | Rutas inexistentes devuelven 404 | `GET /cualquier-cosa` |

**Enlace al repositorio:** _(completar)_
