const { ipcRenderer } = require("electron");

// ===============================
// ESTADO GLOBAL DE LA VISTA
// ===============================

let formularios = [];
let formularioEditandoIndex = null;


// ===============================
// INICIALIZACIÓN
// ===============================

document.addEventListener("DOMContentLoaded", async () => {
  await cargarFormularios();
  configurarEventos();
});


// ===============================
// CARGA DE DATOS (IPC)
// ===============================

async function cargarFormularios() {
  try {
    //formularios = await window.electronAPI.obtenerFormularios(); 
    formularios = await ipcRenderer.invoke("obtener-formularios");

    renderTabla(formularios);

  } catch (error) {
    console.error("Error al cargar formularios:", error);
  }
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
    mostrarImagen(imgPath);
  }
}


// ===============================
// DETALLE
// ===============================

function mostrarDetalle(index) {
  const formulario = formularios[index];
  console.log("Detalle:", formulario);
  // Aquí podés insertar la lógica expandible
}

function mostrarImagen(imgPath) {

  const img = document.getElementById("imagenModal");

  if (!imgPath) {
    img.src = "";
    img.alt = "Imagen no disponible";
    return;
  }

  // En Electron las rutas locales necesitan file://
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
  detalleCell.colSpan = 3; // Ajustar según cantidad de columnas
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

      bloque.innerHTML += `
        <div class="row g-2 mb-2">
          <div class="col-8">
            <input type="text" class="form-control"
              data-seccion="${sec.seccion}"
              data-linea="${i}"
              value="${l.texto ?? ""}">
          </div>

          <div class="col-4">
            <select class="form-select"
              data-seccion="${sec.seccion}"
              data-linea="${i}">
              <option value="">-- Clasificar --</option>
              <option value="anio">Año</option>
              <option value="mes">Mes</option>
              <option value="valor">Valor</option>
              <option value="producto">Producto</option>
              <option value="tipo">Tipo</option>
            </select>
          </div>
        </div>
      `;
    });

    body.appendChild(bloque);
  });

  const modal = new bootstrap.Modal(
    document.getElementById("modalEditarFormulario")
  );
  modal.show();
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

    // 🔹 1. Actualizar texto dentro del objeto original
    const sec = formulario.datos.find(s => s.seccion == seccion);

    if (sec && sec.lineas[linea]) {
      sec.lineas[linea].texto = inp.value;
    }

    // 🔹 2. Guardar clasificación si existe
    const select = document.querySelector(
      `select[data-seccion="${seccion}"][data-linea="${linea}"]`
    );

    if (select && select.value) {
      clasificacion[select.value] = inp.value;
    }

  });

  // 🔹 3. Marcar estado
  formulario.estado = "Confirmado";

  // 🔹 4. Enviar datos realmente modificados
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