// ============================================================
// servidor.js — Sistema de Publicación de Noticias Breves
// ============================================================

const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const mime = require("mime");

const PUERTO = 3000;
const CARPETA_PUBLICA = path.join(__dirname, "public");
const ARCHIVO_NOTICIAS = path.join(CARPETA_PUBLICA, "noticias.txt");

// Caché en memoria para archivos estáticos
const cache = {};

// ── Helpers ──────────────────────────────────────────────────

function responderError(res, codigo, mensaje) {
  res.writeHead(codigo, { "Content-Type": "text/html; charset=utf-8" });
  res.end(`
    <html><head><link rel="stylesheet" href="/estilos.css"></head>
    <body>
      <h1>Error ${codigo}</h1>
      <p>${mensaje}</p>
      <a href="/">← Volver al inicio</a>
    </body></html>
  `);
}

// Lee noticias.txt y devuelve un array de líneas
async function leerNoticias() {
  try {
    const contenido = await fs.readFile(ARCHIVO_NOTICIAS, "utf-8");
    return contenido.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  } catch {
    return []; // Si el archivo no existe, lista vacía
  }
}

// ── Manejadores de ruta ───────────────────────────────────────

// GET / — Listado de noticias
async function manejarInicio(req, res) {
  try {
    const noticias = await leerNoticias();

    let itemsHTML = "<p>No hay noticias publicadas todavía.</p>";

    if (noticias.length > 0) {
      itemsHTML = "<ul>";
      noticias.forEach((linea, idx) => {
        const [titulo, , fecha] = linea.split("||");
        const numero = idx + 1;
        itemsHTML += `<li><a href="/noticia?id=${numero}">${titulo}</a> — <small>${fecha}</small></li>`;
      });
      itemsHTML += "</ul>";
    }

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Noticias Breves</title>
        <link rel="stylesheet" href="/estilos.css">
      </head>
      <body>
        <header>
          <h1>Noticias Breves</h1>
          <nav><a href="/formulario.html">+ Publicar noticia</a></nav>
        </header>
        <main>
          <h2>Últimas noticias</h2>
          ${itemsHTML}
        </main>
        <footer><p>NoticiasBreves — Node.js puro</p></footer>
      </body>
      </html>
    `;

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    console.error("Error en manejarInicio:", err);
    responderError(res, 500, "Error interno al cargar las noticias.");
  }
}

// GET /noticia?id=N — Detalle de noticia
async function manejarDetalle(req, res, searchParams) {
  try {
    const id = parseInt(searchParams.get("id"), 10);

    if (isNaN(id) || id < 1) {
      return responderError(res, 404, "ID de noticia inválido.");
    }

    const noticias = await leerNoticias();

    if (id > noticias.length) {
      return responderError(res, 404, `No existe la noticia #${id}.`);
    }

    const [titulo, cuerpo, fecha] = noticias[id - 1].split("||");

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>${titulo} — Noticias Breves</title>
        <link rel="stylesheet" href="/estilos.css">
      </head>
      <body>
        <header>
          <h1>Noticias Breves</h1>
          <nav><a href="/">← Volver al inicio</a></nav>
        </header>
        <main>
          <article>
            <h2>${titulo}</h2>
            <p><small>Publicado: ${fecha}</small></p>
            <p>${cuerpo}</p>
          </article>
        </main>
        <footer><p>NoticiasBreves — Node.js puro</p></footer>
      </body>
      </html>
    `;

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    console.error("Error en manejarDetalle:", err);
    responderError(res, 500, "Error interno al cargar la noticia.");
  }
}

// POST /publicar — Guarda nueva noticia
function manejarPublicacion(req, res) {
  let body = "";

  // Los datos llegan en fragmentos (chunks); los acumulamos
  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    try {
      const params = new URLSearchParams(body);
      const titulo = (params.get("titulo") || "").trim();
      const cuerpo = (params.get("cuerpo") || "").trim();

      if (!titulo || !cuerpo) {
        return responderError(res, 400, "Título y cuerpo son obligatorios.");
      }

      const fecha = new Date().toLocaleString("es-AR");
      // Formato: TITULO||CUERPO||FECHA
      const linea = `${titulo}||${cuerpo}||${fecha}\n`;

      await fs.appendFile(ARCHIVO_NOTICIAS, linea, "utf-8");

      // Redirigimos al inicio
      res.writeHead(302, { Location: "/" });
      res.end();
    } catch (err) {
      console.error("Error en manejarPublicacion:", err);
      responderError(res, 500, "Error al guardar la noticia.");
    }
  });
}

// Archivos estáticos con caché en memoria
async function servirEstatico(req, res, pathname) {
  const rutaCompleta = path.join(CARPETA_PUBLICA, pathname);

  // Verificar caché primero
  if (cache[rutaCompleta]) {
    console.log(`[CACHÉ HIT] ${pathname}`);
    const { contenido, tipo } = cache[rutaCompleta];
    res.writeHead(200, { "Content-Type": tipo });
    return res.end(contenido);
  }

  // No está en caché: leer del disco
  try {
    await fs.stat(rutaCompleta); // Verifica que existe
    const contenido = await fs.readFile(rutaCompleta);
    const tipo = mime.getType(rutaCompleta) || "application/octet-stream";

    // Guardar en caché
    cache[rutaCompleta] = { contenido, tipo };
    console.log(`[CACHÉ MISS] ${pathname} → guardado en caché`);

    res.writeHead(200, { "Content-Type": tipo });
    res.end(contenido);
  } catch (err) {
    if (err.code === "ENOENT") {
      responderError(res, 404, `Archivo no encontrado: ${pathname}`);
    } else {
      console.error("Error sirviendo estático:", err);
      responderError(res, 500, "Error interno del servidor.");
    }
  }
}

// ── Servidor principal ────────────────────────────────────────

const servidor = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://localhost:${PUERTO}`);
  const pathname = urlObj.pathname;
  const metodo = req.method;

  console.log(`[${new Date().toLocaleTimeString()}] ${metodo} ${pathname}`);

  if (metodo === "GET" && pathname === "/") {
    await manejarInicio(req, res);

  } else if (metodo === "GET" && pathname === "/noticia") {
    await manejarDetalle(req, res, urlObj.searchParams);

  } else if (metodo === "POST" && pathname === "/publicar") {
    manejarPublicacion(req, res);

  } else if (metodo === "GET") {
    await servirEstatico(req, res, pathname);

  } else {
    responderError(res, 404, `Ruta no encontrada: ${metodo} ${pathname}`);
  }
});

servidor.listen(PUERTO, () => {
  console.log(`Servidor corriendo en http://localhost:${PUERTO}`);
});