const { ipcRenderer } = require("electron");
const Fuse = require("fuse.js");
const PNotify = require('@pnotify/core');
const PNotifyBootstrap4 = require('@pnotify/bootstrap4');
require('@pnotify/bootstrap4');

const vision = require('@google-cloud/vision')

PNotify.defaultModules.set(PNotifyBootstrap4, {});
PNotify.defaults.styling = 'bootstrap4';

const cliente = new vision.ImageAnnotatorClient({
  keyFilename: 'project-94ea3abf-6c4f-425b-812-abafb201ab01.json'
})

const options = {
  includeScore: true,
  //más bajo, más estricto
  threshold: 0.25,
  keys: ["valor"],
  ignoreLocation: true,
  minMatchCharLength: 3,

};

let diccionario = [];
let fuse = null;

document.addEventListener("DOMContentLoaded", async () => {
  await cargarFormularios();
  configurarEventos();
  diccionario=construirDiccionario()
  fuse = new Fuse(diccionario, options);

});


function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

// ===============================
// INICIALIZACIÓN
// ===============================

let formularios = [];
let formularioEditandoIndex = null;
let formulariosNormalizados = [];
var rutaImagenActual="";



// ===============================
// CARGA DE DATOS (IPC)
// ===============================

async function cargarFormularios() {
  try {
    //formularios = await window.electronAPI.obtenerFormularios(); 
    formularios = await ipcRenderer.invoke("obtener-formularios");
    formulariosNormalizados = await ipcRenderer.invoke("obtener-formularios-normalizados");
    renderTabla(formularios);

  } catch (error) {
    console.error("Error al cargar formularios:", error);
  }
}

function construirDiccionario() {
  const productos = formulariosNormalizados.map(r => r.producto);
  const tipos = formulariosNormalizados.map(r => r.tipo);

  const unicos = [...new Set([...productos, ...tipos])];

  return unicos.map(p => ({
    valor: p,
    tipo: productos.includes(p) ? "producto" : "tipo"
  }));
}

function clasificarNumero(texto) {

  if (!/^\d+$/.test(texto)) return null;

  const n = parseInt(texto);

  if (n >= 2020 && n <= 2029) return "anio";
  if (n >= 1 && n <= 12) return "mes";
  if (n > 12) return "valor";

  return null;
}

function extraerEntidades(textoOriginal, fuse) {

  const entidades = [];
  const yaAgregadas = new Set();

  // extraer números
  const numeros = textoOriginal.match(/\d+/g);
  //debugger;
  if (numeros) {
    numeros.forEach(n => {
      const tipo = clasificarNumero(n);
      if (tipo) {
        entidades.push({
          tipo,
          valor: n,
          confianza: 1
        });
        yaAgregadas.add(n.toLowerCase());
      }
    });
  }

  // analizar texto sin números
  const textoSinNumeros = textoOriginal.replace(/\d+/g, "").trim();
  const textoLimpio = normalizar(textoSinNumeros);

  if (textoLimpio.length > 2) {

    let mejorResultado = null;
    let mejorScore = 1;

    const resultadoFrase = fuse.search(textoLimpio);

    if (resultadoFrase.length) {
      mejorResultado = resultadoFrase[0];
      mejorScore = resultadoFrase[0].score;
    }

    //buscar por palabras
    const palabras = textoLimpio.split(" ");
 
    palabras.forEach(p => {

      if (p.length < 3) return;

      const resultados = fuse.search(p);

      if (!resultados.length) return;

      // buscar el mejor que no esté repetido
      const candidato = resultados.find(r =>
        r.score < 0.35 &&
        !yaAgregadas.has(r.item.valor.toLowerCase())
      );

      if (!candidato) return;

      entidades.push({
        tipo: candidato.item.tipo,
        valor: candidato.item.valor,
        confianza: 1 - candidato.score
      });

      yaAgregadas.add(candidato.item.valor.toLowerCase());
    });


  }

  return entidades;
}

async function analizarImagen(imagePath) {
  try {
    
    const [result] = await cliente.documentTextDetection(imagePath);
    const fullText = result.fullTextAnnotation;
    // extraer todas las palabras
    const palabras = extraerPalabras(fullText);

    /*
    debugger;

    const lineaTipoY = obtenerLineaTipo(palabras);
    if (!lineaTipoY) return null;

    const { zonaProducto, zonaPrecios } = dividirZonas(palabras, lineaTipoY);

    const producto = reconstruirProducto(zonaProducto);
    const precios = detectarPrecios(zonaPrecios);

    return {
      producto,
      precios
    };

    */

    /*
    debugger;

    const tipoFormulario = obtenerTipoFormulario(palabras);
    const periodos = obtenerPeriodos(palabras);

    const maxX = Math.max(...palabras.map(p => p.centerX));
    const productos = obtenerProductos(palabras, maxX / 2);

    const productosFinal = productos.map(prod => ({
      nombre: prod.nombre,
      valores: obtenerValoresProducto(
        palabras,
        prod.y,
        periodos
      )
    }));

    console.log(tipoFormulario);
    console.log(productosFinal);

    return {
      tipoFormulario,
      productos: productosFinal
    };

    */
    //obtener el tipo de formulario
    const tipoFormulario = obtenerTipoFormulario(palabras);
    
    // detecta todos los periodos (Año y Mes) del encabezado
    const periodos = obtenerPeriodos(palabras);

    //Detecta las líneas horizontales que separan productos
    const separadoresY = obtenerSeparadoresProductos(palabras);

    //Divide el documento en bloques, uno por producto
    const bloques = dividirEnBloques(palabras, separadoresY);

    //Procesa cada bloque para reconstruir producto + precios
    const productos = bloques
      .map(b => procesarBloque(b,periodos))
      .filter(p => p !== null);

    return {
      tipoFormulario,
      productos
    };

  } catch (err) {
    console.error('Error analyzing image:', err);
    return null;
  }
}

function obtenerTipoFormulario(palabras) {

  // Busca la palabra que contiene "informante"
  const palabraInformante = palabras.find(p =>
    p.texto.toLowerCase().includes("informante")
  );

  if (!palabraInformante) return null;

  const mismaLinea = palabras.filter(p =>
    Math.abs(p.centerY - palabraInformante.centerY) < 10
  );

  mismaLinea.sort((a,b) => a.centerX - b.centerX);

  // Encuentra la posición de "informante"
  const indexInformante = mismaLinea.findIndex(p =>
    p.texto.toLowerCase().includes("informante")
  );

  const tipo = mismaLinea
    .slice(3, indexInformante) // saltr "Formulario: 99"
    .map(p => p.texto)
    .join(" ");

  return tipo;
}

function obtenerPeriodos(palabras) {

  const periodos = [];

  const palabrasA = palabras.filter(p => p.texto === "A");

  palabrasA.forEach(pA => {

    const mismaLinea = palabras.filter(p =>
      Math.abs(p.centerY - pA.centerY) < 10
    );

    mismaLinea.sort((a,b) => a.centerX - b.centerX);

    const indexA = mismaLinea.findIndex(p => p === pA);

    // Año está 2 posiciones después de "A"
    const anio = parseInt(mismaLinea[indexA + 2]?.texto);

    // Busca palabra "M"
    const palabraM = mismaLinea.find(p => p.texto === "M");

    if (!palabraM) return;

    const indexM = mismaLinea.findIndex(p => p === palabraM);
    const mes = parseInt(mismaLinea[indexA + 5]?.texto);

    periodos.push({
      anio,
      mes,
      centerX: pA.centerX // posición horizontal de la columna
    });

  });

  return periodos.sort((a,b) => a.centerX - b.centerX);
}

function asociarPreciosConPeriodos(preciosDetectados, periodos) {

  /*
  const toleranciaX = 200;

  const valores = [];

  periodos.forEach(periodo => {

    const precio = preciosDetectados.find(p =>
      Math.abs(p.centerX - periodo.centerX) < toleranciaX
    );

    if (precio) {
      valores.push({
        anio: periodo.anio,
        mes: periodo.mes,
        valor: parseFloat(precio.texto)
      });
    }

  });

  return valores;
  */
  const columnas = construirColumnas(periodos);

  const valores = [];

  preciosDetectados.forEach(precio => {

    // Busca en que columna cae horizontalmente
    const columna = columnas.find(col =>
      precio.centerX >= col.minX &&
      precio.centerX < col.maxX
    );

    if (columna) {
      valores.push({
        anio: columna.anio,
        mes: columna.mes,
        valor: parseFloat(precio.texto)
      });
    }

  });

  return valores;
}

function construirColumnas(periodos) {

  let columnas = [];
  /*
  for (let i = 0; i < periodos.length; i++) {

    const actual = periodos[i];
    const siguiente = periodos[i + 1];

    const limiteIzq = i === 0
      ? actual.centerX - 200
      : (periodos[i - 1].centerX + actual.centerX) / 2;

    const limiteDer = siguiente
      ? (actual.centerX + siguiente.centerX) / 2
      : actual.centerX + 200;

    columnas.push({
      anio: actual.anio,
      mes: actual.mes,
      minX: limiteIzq,
      maxX: limiteDer
    });
  }
  */
  const ANCHO_COLUMNA = 357;
  const OFFSET_PERIODO_DESDE_INICIO = 28;

  columnas = periodos.map(p => {

    const inicioColumna = p.centerX - OFFSET_PERIODO_DESDE_INICIO;

    return {
      anio: p.anio,
      mes: p.mes,
      minX: inicioColumna,
      maxX: inicioColumna + ANCHO_COLUMNA
    };
  });
  return columnas;
}

function extraerPalabras(fullText) {
  const palabras = [];

  fullText.pages.forEach(page => {
    page.blocks.forEach(block => {
      block.paragraphs.forEach(paragraph => {
        paragraph.words.forEach(word => {

          const texto = word.symbols.map(s => s.text).join('');
          const v = word.boundingBox.vertices;

          // Calcula centro horizontal y vertical
          const centerX = (v[0].x + v[1].x) / 2;
          const centerY = (v[0].y + v[2].y) / 2;

          palabras.push({
            texto,
            centerX,
            centerY,
            vertices: v
          });
        });
      });
    });
  });

  return palabras;
}

function obtenerLineaTipo(palabras) {
  const palabraTipo = palabras.find(p => 
    p.texto.toLowerCase() === "tipo"
  );

  return palabraTipo ? palabraTipo.centerY : null;
}

function dividirZonas(palabras, lineaTipoY) {

  const zonaSuperior = palabras.filter(p => p.centerY < lineaTipoY);

  const zonaProducto = zonaSuperior.filter(p => p.centerX < 400); 
  const zonaPrecios = zonaSuperior.filter(p => p.centerX >= 400);

  return { zonaProducto, zonaPrecios };
}

function agruparPorFilas(palabras, tolerancia = 15) {
  const filas = [];

  palabras.forEach(p => {
    let fila = filas.find(f => Math.abs(f.y - p.centerY) < tolerancia);

    if (!fila) {
      fila = { y: p.centerY, palabras: [] };
      filas.push(fila);
    }

    fila.palabras.push(p);
  });

  filas.forEach(f => 
    f.palabras.sort((a, b) => a.centerX - b.centerX)
  );

  return filas;
}

function reconstruirProducto(zonaProducto) {
  const filas = agruparPorFilas(zonaProducto);

  const texto = filas
    .sort((a,b) => a.y - b.y)
    .map(f => f.palabras.map(p => p.texto).join(" "))
    .join(" ");

  return texto;
}

/*
function obtenerProductos(palabras, limiteX) {

  const zonaIzquierda = palabras.filter(p => p.centerX < limiteX);

  const filas = agruparPorFilas(zonaIzquierda, 15)
    .sort((a,b) => a.y - b.y);

  return filas.map(f => ({
    nombre: f.palabras.map(p => p.texto).join(" "),
    y: f.y
  }));
}

function obtenerValoresProducto(palabras, productoY, periodos) {

  const toleranciaY = 12;
  const toleranciaX = 40;

  const numeros = palabras.filter(p =>
    /^[0-9]+(\.[0-9]+)?$/.test(p.texto) &&
    Math.abs(p.centerY - productoY) < toleranciaY
  );

  const valores = [];

  periodos.forEach(periodo => {

    const precio = numeros.find(n =>
      Math.abs(n.centerX - periodo.centerX) < toleranciaX
    );

    if (precio) {
      valores.push({
        anio: periodo.anio,
        mes: periodo.mes,
        valor: parseFloat(precio.texto)
      });
    }
  });

  return valores;
}
*/
function esNumero(texto) {
  return /^[0-9]+(\.[0-9]+)?$/.test(texto);
}

function detectarPrecios(zonaPrecios) {
  /*
  const numeros = zonaPrecios
    .filter(p => esNumero(p.texto))
    .sort((a,b) => a.centerX - b.centerX);

  return numeros.map(n => parseFloat(n.texto));
  */
 return zonaPrecios
    .filter(p => esNumero(p.texto))
    .map(p => ({
      texto: p.texto,
      centerX: p.centerX,
      centerY: p.centerY
  }));
}

/*
function esPrecio(texto) {
  return /^\d+(\.\d+)?$/.test(texto);
}
*/
/*
function estructurarFormulario(filas) {
  let producto = "";
  let precios = [];

  filas.forEach(fila => {
    fila.palabras.forEach(p => {
      if (esPrecio(p.texto)) {
        precios.push(parseFloat(p.texto));
      }
    });
  });

  // producto = primeras filas sin números grandes
  const filaProducto = filas.find(f =>
    f.palabras.some(p => !esPrecio(p.texto))
  );

  if (filaProducto) {
    producto = filaProducto.palabras
      .map(p => p.texto)
      .join(" ");
  }

  return { producto, precios };
}
*/
/** Tercer cambio */
function obtenerSeparadoresProductos(palabras) {

  const tipos = palabras.filter(p =>
    p.texto.toLowerCase() === "tipo"
  );

  const filasTipo = agruparPorFilas(tipos, 10)
    .sort((a,b) => a.y - b.y);

  return filasTipo.map(f => f.y);
}

function dividirEnBloques(palabras, separadoresY) {
// Divide todas las palabras en bloques verticales
  const bloques = [];

  for (let i = 0; i < separadoresY.length; i++) {

    const inicio = separadoresY[i] - 80; // margen arriba del "Tipo"
    const fin = separadoresY[i + 1] 
      ? separadoresY[i + 1] - 20
      : Infinity;

    const bloque = palabras.filter(p =>
      p.centerY >= inicio && p.centerY < fin
    );

    bloques.push(bloque);
  }

  return bloques;
}

function procesarBloque(bloque, periodos) {
  /*
  const lineaTipoY = obtenerLineaTipo(bloque);
  if (!lineaTipoY) return null;

  const { zonaProducto, zonaPrecios } = dividirZonas(bloque, lineaTipoY);

  const producto = reconstruirProducto(zonaProducto);
  const precios = detectarPrecios(zonaPrecios);

  if (!producto || precios.length === 0) return null;

  return { producto, precios };
  */
  // Busca línea para dividir producto y precios
  const lineaTipoY = obtenerLineaTipo(bloque);
  if (!lineaTipoY) return null;

  // Divide en zona izquierda (producto) y derecha (precios)
  const { zonaProducto, zonaPrecios } = dividirZonas(bloque, lineaTipoY);

  // Reconstruye texto completo del producto
  const producto = reconstruirProducto(zonaProducto);

  // Detecta números en la zona de precios
  const preciosDetectados = detectarPrecios(zonaPrecios);

  if (!producto || preciosDetectados.length === 0)
    return null;

  // Asocia cada precio a su periodo correspondiente
  const valores = asociarPreciosConPeriodos(preciosDetectados,periodos);

  if (valores.length === 0)
    return null;

  return {
    nombre: producto,
    valores
  };
}

// ===============================
// CONFIGURACIÓN DE EVENTOS
// ===============================

function configurarEventos() {

  // Filtrar
  document.getElementById("btnFiltrar")
    .addEventListener("click", () => {
      const filtrados = obtenerFormulariosFiltrados(formularios);
      renderTabla(filtrados);
    });

  // Exportar CSV
  document.getElementById("btnExportarCsv")
    .addEventListener("click", () => {
      const filtrados = obtenerFormulariosFiltrados(formularios);

      if (filtrados.length === 0) {
        alert("No hay datos para exportar.");
        return;
      }

      const csv = generarCSV(filtrados);
      descargarCSV(csv);
    });

  // Delegación de eventos para tabla
  document.addEventListener("click", manejarEventosTabla);

  // Guardar edición
  document.getElementById("btnGuardarEdicion")
    .addEventListener("click", guardarEdicion);
}


// ===============================
// FILTROS
// ===============================

function obtenerFormulariosFiltrados(lista) {

  const fechaDesde = document.getElementById("fechaDesde").value;
  const fechaHasta = document.getElementById("fechaHasta").value;
  const estadoFiltro = document.getElementById("estadoFiltro").value;

  return lista.filter(formulario => {

    const fechaFormulario = new Date(formulario.fecha);

    if (fechaDesde) {
      const desde = new Date(fechaDesde);
      if (fechaFormulario < desde) return false;
    }

    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      if (fechaFormulario > hasta) return false;
    }

    if (estadoFiltro && formulario.estado !== estadoFiltro) {
      return false;
    }

    return true;
  });
}


// ===============================
// RENDER TABLA
// ===============================

function renderTabla(lista) {

  const tbody = document.querySelector("#tablaFormularios tbody");
  tbody.innerHTML = "";

  if (lista.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center text-muted">
          No hay resultados.
        </td>
      </tr>
    `;
    return;
  }

  lista.forEach((formulario, index) => {

    const tr = document.createElement("tr");

    const imagenBtn = formulario.imagen ? `
      <button class="btn btn-sm btn-outline-primary btnVerImagen"
              data-imagen="${formulario.imagen}"
              data-bs-toggle="modal"
              data-bs-target="#modalImagen">
        <i class="bi bi-image">Ver Imagen</i>
      </button>
    ` : "";

    tr.innerHTML = `
      <td>${new Date(formulario.fecha).toLocaleString()}</td>

      <td>
        ${imagenBtn}
        <button class="btn btn-sm btn-info btnVerDetalle" data-index="${index}">
          <i class="bi bi-eye">Ver Detalle</i>
        </button>
        <button class="btn btn-sm btn-warning btnEditar" data-index="${index}">
          <i class="bi bi-pencil">Editar</i>
        </button>
              <button class="btn btn-sm btn-outline-primary btnAnalizarImagen"
              data-imagen="${formulario.imagen}"
              data-bs-toggle="modal"
              data-bs-target="#modalAnalizarImagen">
        <i class="bi bi-image">Analizar Imagen</i>
      </button>
      </td>

      <td>
        <span class="badge ${formulario.estado === "Confirmado" ? "bg-success" : "bg-secondary"}">
          ${formulario.estado ?? "Pendiente"}
        </span>
      </td>
    `;

    tbody.appendChild(tr);
  });
}


// ===============================
// MANEJO DE EVENTOS DE TABLA
// ===============================

function manejarEventosTabla(e) {

  if (e.target.closest(".btnVerDetalle")) {
    const index = e.target.closest(".btnVerDetalle").dataset.index;
    mostrarDetalle(index);
  }

  if (e.target.closest(".btnEditar")) {
    const index = e.target.closest(".btnEditar").dataset.index;
    abrirModalEdicion(index);
  }

  if (e.target.closest(".btnVerImagen")) {
    const imgPath = e.target.closest(".btnVerImagen").dataset.imagen;
    mostrarImagen(imgPath,"imagenModal");
    //analizarImagen(imgPath)
  }

  if (e.target.closest(".btnAnalizarImagen")) {
    const imgPath = e.target.closest(".btnAnalizarImagen").dataset.imagen;
    mostrarImagen(imgPath,"imagenModalAnalizar");
    rutaImagenActual = imgPath;
    //analizarImagen(imgPath)
  }
}




// ===============================
// DETALLE
// ===============================

function mostrarDetalle(index) {
  const formulario = formularios[index];
  console.log("Detalle:", formulario);
  // Expande el renglón
}

function mostrarImagen(imgPath,ubicacion) {

  const img = document.getElementById(ubicacion);

  if (!imgPath) {
    img.src = "";
    img.alt = "Imagen no disponible";
    return;
  }

  // En Electron las rutas locales necesitan el path
  img.src = `${imgPath}`;
  img.alt = "Imagen del formulario";
}

function mostrarDetalle(index) {

  const formulario = formularios[index];
  const tbody = document.querySelector("#tablaFormularios tbody");
  const filas = tbody.querySelectorAll("tr");

  const filaActual = filas[index];

  // Si ya existe un detalle abierto justo debajo, lo cerramos
  const siguienteFila = filaActual.nextElementSibling;

  if (siguienteFila && siguienteFila.classList.contains("fila-detalle")) {
    siguienteFila.remove();
    return;
  }

  // Crear fila detalle
  const detalleRow = document.createElement("tr");
  detalleRow.className = "fila-detalle";

  const detalleCell = document.createElement("td");
  detalleCell.colSpan = 3; 
  detalleCell.className = "bg-light p-3";

  // Construir contenido expandible
  let contenido = `<div class="container-fluid">`;

  formulario.datos?.forEach(sec => {

    contenido += `
      <div class="mb-3">
        <h6 class="text-primary">Sección ${sec.seccion}</h6>
        <ul class="list-group">
    `;

    sec.lineas?.forEach((linea, i) => {
      contenido += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <span>${linea.texto ?? ""}</span>
          <span class="badge bg-secondary">Línea ${i + 1}</span>
        </li>
      `;
    });

    contenido += `
        </ul>
      </div>
    `;
  });

  contenido += `</div>`;

  detalleCell.innerHTML = contenido;
  detalleRow.appendChild(detalleCell);

  // Insertar debajo de la fila actual
  filaActual.parentNode.insertBefore(detalleRow, filaActual.nextSibling);
}


// ===============================
// MODAL EDICIÓN
// ===============================

function abrirModalEdicion(index) {

  formularioEditandoIndex = index;
  const formulario = formularios[index];
  const body = document.getElementById("modalEditarBody");

  body.innerHTML = "";

  formulario.datos.forEach(sec => {

    const bloque = document.createElement("div");
    bloque.className = "mb-3 p-2 border rounded";

    bloque.innerHTML = `<h6>Sección ${sec.seccion}</h6>`;

    sec.lineas.forEach((l, i) => {
      const textoOriginal = (l.texto ?? "").trim();

      // extras + de una entidad
      const entidades = extraerEntidades(textoOriginal, fuse);

      // visualización de entidades detectadas
      let entidadesHTML = "";

      if (entidades.length > 0) {

        entidadesHTML += `
          <div class="mt-2 p-2 bg-light border rounded">
            <small><strong>Entidades detectadas:</strong></small>
        `;

        entidades.forEach((e, index) => {

          entidadesHTML += `
            <div class="d-flex align-items-center mb-1 entidad-item">

              <input type="text"
                class="form-control form-control-sm me-2 entidad-valor"
                value="${e.valor}">

              <select class="form-select form-select-sm me-2 entidad-tipo">
                <option value="producto" ${e.tipo==='producto'?'selected':''}>Producto</option>
                <option value="anio" ${e.tipo==='anio'?'selected':''}>Año</option>
                <option value="mes" ${e.tipo==='mes'?'selected':''}>Mes</option>
                <option value="valor" ${e.tipo==='valor'?'selected':''}>Valor</option>
                <option value="tipo" ${e.tipo==='tipo'?'selected':''}>Tipo</option>
              </select>

              <small class="text-muted me-2">
                ${e.confianza.toFixed(2)}
              </small>

              <button type="button"
                class="btn btn-sm btn-outline-danger btn-eliminar-entidad">
                ✕
              </button>

            </div>
          `;
        });

        entidadesHTML += `
          <div class="mt-2">
            <button type="button"
              class="btn btn-sm btn-outline-secondary btn-agregar-entidad">
              ➕ Agregar entidad
            </button>
          </div>

        </div>
        `;

      }

      // renderizar línea original + entidades debajo
      bloque.innerHTML += `
        <div class="row g-2 mb-3">
          <div class="col-12">
            <input type="text" class="form-control input-texto-original"
              data-seccion="${sec.seccion}"
              data-linea="${i}"
              value="${textoOriginal}">
          </div>

          <div class="col-12">
            ${entidadesHTML}
          </div>
        </div>
      `;
    });

    

    /*
    bloque.innerHTML +=`
    <div class="mt-2">
      <button type="button"
        class="btn btn-sm btn-primary btn-preparar-registros"
        data-tabla="${tablaId}">
        Generar Tabla
      </button>
    </div>

    <div class="mt-2 contenedor-tabla"
        id="${tablaId}">
    </div>
    `
    */
    body.appendChild(bloque);
  });

  const tablaId = `tabla-${1}-${1}-${Date.now()}`;
  let bloqueGenerarTabla = `
    <div class="mt-2">
      <button type="button"
        class="btn btn-sm btn-primary btn-preparar-registros"
        data-tabla="${tablaId}">
        Generar Tabla
      </button>
    </div>

    <div class="mt-2 contenedor-tabla"
        id="${tablaId}">
    </div>
    `;

  body.insertAdjacentHTML("beforeend", bloqueGenerarTabla);

  const modal = new bootstrap.Modal(
    document.getElementById("modalEditarFormulario")
  );
  modal.show();
}

document.addEventListener("click", function(e) {

  if (e.target.classList.contains("btn-agregar-entidad")) {

    // Buscar el contenedor gris actual
    const contenedor = e.target.closest(".border");

    if (!contenedor) return;

    const nuevaEntidadHTML = `
      <div class="d-flex align-items-center mb-1 entidad-item">

        <input type="text"
          class="form-control form-control-sm me-2 entidad-valor"
          value="">

        <select class="form-select form-select-sm me-2 entidad-tipo">
          <option value="producto">Producto</option>
          <option value="anio">Año</option>
          <option value="mes">Mes</option>
          <option value="valor">Valor</option>
          <option value="tipo">Tipo</option>
        </select>

        <small class="text-muted me-2">
          manual
        </small>

        <button type="button"
          class="btn btn-sm btn-outline-danger btn-eliminar-entidad">
          ✕
        </button>

      </div>
    `;

    // Insertar antes del botón agregar
    e.target.closest(".mt-2").insertAdjacentHTML("beforebegin", nuevaEntidadHTML);

  }

});

document.addEventListener("click", async function(e) {

  if (e.target.classList.contains("btn-leer-imagen")) {
    debugger;

    const boton = e.target;
    const loader = document.getElementById("loader-ocr");
    const contenedor = document.getElementById("tabla-reprocesada");

    try {
      loader.style.display = "block";
      boton.disabled = true;

      var resultado = await analizarImagen(rutaImagenActual);

      const entidades = convertirResultadoAEntidades(resultado);


      generarTablaEditable(contenedor, entidades, "tabla-reprocesada");
      const tbody = contenedor.querySelector("tbody");
      const botonAgregar = contenedor.querySelector(".btn-agregar-fila");

      const tipoFormulario = resultado.tipoFormulario?.trim();

      let esPrimeraFila = true;

      resultado.productos.forEach(producto => {

        producto.valores.forEach(v => {

          if (!esPrimeraFila) {
            botonAgregar.click(); // crear fila adicional
          }

          const filaActual = esPrimeraFila
            ? tbody.querySelector("tr:first-child")
            : tbody.lastElementChild;

          const selects = filaActual.querySelectorAll("select");

          selects[0].value = producto.nombre;
          selects[1].value = v.anio;
          selects[2].value = v.mes;
          selects[3].value = v.valor;
          selects[4].value = tipoFormulario;

          esPrimeraFila = false;

        });

      });
      
    } catch (error) {

      PNotify.error({
        title: "Error",
        text: error.message,
        delay: 2000
      });
      
    } finally {
      loader.style.display = "none";
      boton.disabled = false;
    }
    

  }

});

function convertirResultadoAEntidades(resultado) {

  const entidades = [];
  const tipoFormulario = resultado.tipoFormulario?.trim();

  const productosUnicos = new Set();
  const aniosUnicos = new Set();
  const mesesUnicos = new Set();
  const valoresUnicos = new Set();

  resultado.productos.forEach(prod => {

    productosUnicos.add(prod.nombre);

    prod.valores.forEach(v => {
      aniosUnicos.add(v.anio);
      mesesUnicos.add(v.mes);
      valoresUnicos.add(v.valor);
    });

  });

  productosUnicos.forEach(p =>
    entidades.push({ tipo: "producto", valor: p })
  );

  aniosUnicos.forEach(a =>
    entidades.push({ tipo: "anio", valor: a })
  );

  mesesUnicos.forEach(m =>
    entidades.push({ tipo: "mes", valor: m })
  );

  valoresUnicos.forEach(v =>
    entidades.push({ tipo: "valor", valor: v })
  );

  if (tipoFormulario) {
    entidades.push({ tipo: "tipo", valor: tipoFormulario });
  }

  return entidades;
}


document.addEventListener("click", function(e) {

  if (e.target.classList.contains("btn-eliminar-entidad")) {

    const item = e.target.closest(".entidad-item");

    if (item) {
      item.remove();
    }

  }

});

document.addEventListener("click", function(e) {

  if (e.target.classList.contains("btn-preparar-registros")) {

    const tablaId = e.target.dataset.tabla;
    const contenedor = document.getElementById(tablaId);

    const bloqueSeccion = document; // e.target.closest(".mb-3");

    const entidades = [];
    const entidadesUnicas = new Set();
    bloqueSeccion.querySelectorAll(".entidad-item").forEach(item => {

      /*
      const valor = item.querySelector(".entidad-valor").value;
      const tipo = item.querySelector(".entidad-tipo").value;

      entidades.push({ tipo, valor });
      */
      const valorRaw = item.querySelector(".entidad-valor").value;
      const tipo = item.querySelector(".entidad-tipo").value;

      const valor = valorRaw.trim();

      if (!valor) return;

      // clave única tipo+valor
      const clave = `${tipo}|${valor}`;

      if (entidadesUnicas.has(clave)) return;

      entidadesUnicas.add(clave);

      entidades.push({ tipo, valor });
    });

    generarTablaEditable(contenedor, entidades, tablaId);
  }

});

function generarTablaEditable(contenedor, entidades, tablaId) {

  if (!entidades.length) return;

  // separar por tipo
  const porTipo = {
    producto: entidades.filter(e => e.tipo === "producto"),
    anio: entidades.filter(e => e.tipo === "anio"),
    mes: entidades.filter(e => e.tipo === "mes"),
    valor: entidades.filter(e => e.tipo === "valor"),
    tipo: entidades.filter(e => e.tipo === "tipo")
  };

  contenedor.innerHTML = `
    <div class="border rounded p-2 bg-white">

      <table class="table table-sm mb-2">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Año</th>
            <th>Mes</th>
            <th>Valor</th>
            <th>Tipo</th>
            <th></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>

      <button class="btn btn-sm btn-secondary btn-agregar-fila"
        data-tabla="${tablaId}">
        ➕ Agregar Fila
      </button>

      <button class="btn btn-sm btn-success btn-confirmar-tabla"
        data-tabla="${tablaId}">
        💾 Guardar Entidades
      </button>

    </div>
  `;

  agregarFila(tablaId, porTipo);
}

function agregarFila(tablaId, porTipo) {

  const contenedor = document.getElementById(tablaId);
  const tbody = contenedor.querySelector("tbody");

  const select = (tipo) => {

    const opciones = porTipo[tipo]
      .map(e => `<option value="${e.valor}">${e.valor}</option>`)
      .join("");

    return `
      <select class="form-select form-select-sm">
        <option value="">--</option>
        ${opciones}
      </select>
    `;
  };

  const fila = `
    <tr>
      <td>${select("producto")}</td>
      <td>${select("anio")}</td>
      <td>${select("mes")}</td>
      <td>${select("valor")}</td>
      <td>${select("tipo")}</td>
      <td>
        <button class="btn btn-sm btn-danger btn-eliminar-fila">✕</button>
      </td>
    </tr>
  `;

  tbody.insertAdjacentHTML("beforeend", fila);
}

document.addEventListener("click", function(e) {

  if (e.target.classList.contains("btn-agregar-fila")) {

    const tablaId = e.target.dataset.tabla;
    const contenedor = document.getElementById(tablaId);

    const selects = contenedor.querySelectorAll("tbody tr:first-child select");

    if (!selects.length) return;

    const porTipo = {
      producto: [...selects[0].options].filter(o=>o.value).map(o=>({valor:o.value})),
      anio: [...selects[1].options].filter(o=>o.value).map(o=>({valor:o.value})),
      mes: [...selects[2].options].filter(o=>o.value).map(o=>({valor:o.value})),
      valor: [...selects[3].options].filter(o=>o.value).map(o=>({valor:o.value})),
      tipo: [...selects[4].options].filter(o=>o.value).map(o=>({valor:o.value}))
    };

    agregarFila(tablaId, porTipo);
  }

  if (e.target.classList.contains("btn-eliminar-fila")) {
    e.target.closest("tr").remove();
  }

});

document.addEventListener("click", async function(e) {

  if (e.target.classList.contains("btn-confirmar-tabla")) {

    const tablaId = e.target.dataset.tabla;
    const contenedor = document.getElementById(tablaId);

    const registros = [];

    contenedor.querySelectorAll("tbody tr").forEach(tr => {

      const selects = tr.querySelectorAll("select");

      const registro = {
        producto: selects[0].value,
        anio: selects[1].value,
        mes: selects[2].value,
        valor: selects[3].value,
        tipo: selects[4].value
      };

      if (
        registro.producto &&
        registro.anio &&
        registro.mes &&
        registro.valor &&
        registro.tipo
      ) {
        registros.push(registro);
      }

    });

    if (registros.length === 0) {
      PNotify.notice({
        title: "Sin datos",
        text: "No hay registros para guardar.",
        delay: 2000
      });
      return;
    }

    console.log("Registros finales:", registros);

    try {

      const res = await ipcRenderer.invoke(
        "guardar-formulario-estructurado",
        { registros }
      );

      PNotify.success({
        text: `Se guardaron ${registros.length} registro(s) correctamente.`,
        delay: 2000,
      });

      const tbody = contenedor.querySelector("tbody");
      if (tbody) {
        tbody.innerHTML = "";
      }

    } catch (error) {

      console.error(error);
      PNotify.error({
        title: "Error",
        text: "Ocurrió un error al guardar.",
        delay: 2000
      });

    }
  }

});

document.addEventListener("input", function (e) {

  debugger;
  if (!e.target.classList.contains("input-texto-original")) return;

  const input = e.target;
  const texto = input.value.trim();

  const contenedorLinea = input.closest(".row");
  const contenedorEntidades = contenedorLinea.querySelector(".mt-2.p-2");

  if (!contenedorEntidades) return;

  const nuevasEntidades = extraerEntidades(texto, fuse);

  actualizarEntidades(contenedorEntidades, nuevasEntidades);
});

function actualizarEntidades(contenedor, nuevasEntidades) {

  // obtener entidades ya existentes
  const existentes = Array.from(
    contenedor.querySelectorAll(".entidad-item")
  ).map(el => {
    return {
      valor: el.querySelector(".entidad-valor").value,
      tipo: el.querySelector(".entidad-tipo").value
    };
  });

  nuevasEntidades.forEach(ent => {

    const yaExiste = existentes.some(e =>
      e.valor === ent.valor && e.tipo === ent.tipo
    );

    if (yaExiste) return;

    const entidadHTML = `
      <div class="d-flex align-items-center mb-1 entidad-item" data-auto="true">

        <input type="text"
          class="form-control form-control-sm me-2 entidad-valor"
          value="${ent.valor}">

        <select class="form-select form-select-sm me-2 entidad-tipo">
          <option value="producto" ${ent.tipo==='producto'?'selected':''}>Producto</option>
          <option value="anio" ${ent.tipo==='anio'?'selected':''}>Año</option>
          <option value="mes" ${ent.tipo==='mes'?'selected':''}>Mes</option>
          <option value="valor" ${ent.tipo==='valor'?'selected':''}>Valor</option>
          <option value="tipo" ${ent.tipo==='tipo'?'selected':''}>Tipo</option>
        </select>

        <small class="text-muted me-2">
          ${ent.confianza.toFixed(2)}
        </small>

        <button type="button"
          class="btn btn-sm btn-outline-danger btn-eliminar-entidad">
          ✕
        </button>

      </div>
    `;

    // insertar antes del botón agregar entidad
    const btnAgregar = contenedor.querySelector(".btn-agregar-entidad");
    btnAgregar.insertAdjacentHTML("beforebegin", entidadHTML);
  });

}
// ===============================
// GUARDAR EDICIÓN (IPC)
// ===============================

async function guardarEdicion() {

  const formulario = formularios[formularioEditandoIndex];

  const inputs = document.querySelectorAll(
    "#modalEditarBody input[type='text']"
  );

  let clasificacion = {};

  inputs.forEach(inp => {

    const seccion = parseInt(inp.dataset.seccion);
    const linea = parseInt(inp.dataset.linea);

    // Actualizar texto dentro del objeto original (datos brutos)
    const sec = formulario.datos.find(s => s.seccion == seccion);

    if (sec && sec.lineas[linea]) {
      sec.lineas[linea].texto = inp.value;
    }

    // Guardar clasificación (si existe)
    const select = document.querySelector(
      `select[data-seccion="${seccion}"][data-linea="${linea}"]`
    );

    if (select && select.value) {
      clasificacion[select.value] = inp.value;
    }

  });

  //  cambiar estado
  formulario.estado = "Confirmado";

  // Enviar datos realmente modificados
  const res = await ipcRenderer.invoke(
      "editar-formulario",
      {
          id: formulario.id,
          datos: formulario.datos,
          estado: formulario.estado,
          clasificacion
      }
  );

  bootstrap.Modal
    .getInstance(document.getElementById("modalEditarFormulario"))
    .hide();

  await cargarFormularios();
}

/**

 */


// ===============================
// CSV
// ===============================

function generarCSV(lista) {

  let csv = [];
  csv.push(["Fecha", "Sección", "Línea", "Texto"].join(";"));

  lista.forEach(formulario => {

    const fecha = new Date(formulario.fecha).toLocaleString();

    formulario.datos?.forEach(seccion => {
      seccion.lineas?.forEach((linea, index) => {

        const fila = [
          `"${fecha}"`,
          `"${seccion.seccion}"`,
          `"${index + 1}"`,
          `"${(linea?.texto ?? "").replace(/"/g, '""')}"`
        ];

        csv.push(fila.join(";"));
      });
    });
  });

  return csv.join("\n");
}


function descargarCSV(contenido) {

  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `formularios_${Date.now()}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}