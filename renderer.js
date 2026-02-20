const Cropper = require('cropperjs');
const { exec } = require("child_process"); //ejecuta el archivo python
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path')

function convertirFecha(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Mes comienza en 0
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}`;
}

function ejecutarArchivoPython(ruta) {
  return new Promise((resolve, reject) => {
      exec(`python calidad.py "${ruta}"`, (error, stdout, stderr) => {
          if (error) {
              reject(`Error ejecutando el script: ${error.message}`);
              return;
          }

          if (stderr) {
              reject(`Error en el script: ${stderr}`);
              return;
          }

          resolve(stdout.trim()); // Devuelve el resultado del script
      });
  });
}

function ejecutarArchivoRobot(rutaRobot) {
  return new Promise((resolve, reject) => {
    const comando = `robot "${rutaRobot}"`;
    exec(comando, (error, stdout, stderr) => {
      if (error) {
        reject(`Error ejecutando robot: ${error.message}`);
        return;
      }
      if (stderr) {
        reject(`Stderr robot: ${stderr}`);
        return;
      }
      resolve(stdout.trim());
    });
  });
}


let cropper;

document.getElementById('fileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    const imageUrl = URL.createObjectURL(file);
    const imageElement = document.getElementById('image');
    imageElement.src = imageUrl;

    // Cropper.js
    if (cropper) cropper.destroy();
    cropper = new Cropper(imageElement, {
      aspectRatio: NaN,
      viewMode: 1,
    });
  }
});

document.getElementById('cropButton').addEventListener('click', () => {
  if (cropper) {
      const croppedCanvas = cropper.getCroppedCanvas();
      const croppedImage = croppedCanvas.toDataURL('image/png'); // Base64 PNG

      // Convierte Base64 a un archivo y guárdalo
      const base64Data = croppedImage.replace(/^data:image\/png;base64,/, "");
      var fechaSTR=convertirFecha(new Date());
      const outputPath = path.join(__dirname, `imagenes/recorte_${fechaSTR}.png`);

      fs.writeFile(outputPath, base64Data, 'base64', async (err) => {
          if (err) {
              console.error("Error al guardar la imagen:", err);
              return;
          }

          console.log("Imagen guardada en:", outputPath);

          // Llama al script de Python con la ruta
          try {
              ipcRenderer.send('show-overlay');
              const results = await ejecutarArchivoPython(outputPath);
              console.log(results);
              const rutaRobot = path.join(__dirname, 'abrirCalculadora.robot');

              //ejecutarArchivoRobot(rutaRobot);
              ipcRenderer.send('hide-overlay');

              const secciones = JSON.parse(results);
              const contenedorFormulario = document.getElementById("formulario-dinamico");
              contenedorFormulario.innerHTML = "";

              secciones.forEach((seccion, index) => {
                const divSeccion = document.createElement("div");
                divSeccion.style.border = "1px solid gray";
                divSeccion.style.padding = "10px";
                divSeccion.style.margin = "10px 0";

                const titulo = document.createElement("h3");
                titulo.innerText = `Sección ${index + 1}`;
                divSeccion.appendChild(titulo);

                const lineas = seccion.texto.split("\n");
                lineas.forEach((lineaObj, idx) => {

                  // normalizar
                  const texto = typeof lineaObj === "string" ? lineaObj : lineaObj.texto;
                  const score = typeof lineaObj === "string"
                    ? Math.random() // temporal
                    : lineaObj.score;

                  const row = document.createElement("div");
                  row.className = "d-flex align-items-center gap-2 mb-2";

                  const input = document.createElement("input");
                  input.type = "text";
                  input.className = "form-control";
                  input.value = texto;
                  input.dataset.score = score; //

                  const badge = document.createElement("span");
                  badge.className = "badge";
                  badge.innerText = `${Math.round(score * 100)}%`;

                  // Color 
                  if (score >= 0.8) badge.classList.add("bg-success");
                  else if (score >= 0.5) badge.classList.add("bg-warning");
                  else badge.classList.add("bg-danger");

                  row.appendChild(input);
                  row.appendChild(badge);

                  divSeccion.appendChild(row);
                });


                contenedorFormulario.appendChild(divSeccion);
              });

              const btnGuardar = document.createElement("button");
              btnGuardar.innerText = "Guardar";
              btnGuardar.style.marginTop = "20px";
              btnGuardar.style.padding = "10px 20px";
              btnGuardar.style.fontWeight = "bold";

              btnGuardar.addEventListener("click", () => {
                const datosSecciones = [];

                const seccionesDOM = document.querySelectorAll("#formulario-dinamico > div");
                seccionesDOM.forEach((div, i) => {
                  const inputs = div.querySelectorAll("input");
                  const lineas = Array.from(inputs).map(inp => ({
                    texto: inp.value,
                    score: parseFloat(inp.dataset.score)
                  }));

                  datosSecciones.push({ 
                    seccion: i + 1, 
                    lineas });
                });

                var datosFinales ={
                  datosSecciones,
                  imagen: outputPath,
                  estado: "Pendiente"
                }

                console.log("Datos a guardar:", datosFinales);
                debugger;
                ipcRenderer.invoke('guardar-formulario', datosFinales)

                  .then(res => {
                    if (res.success){
                      

                     // Restablecer la imagen
                      // Destruir y limpiar Cropper.js completamente
                      if (window.cropper) {
                        try {
                          window.cropper.destroy();
                        } catch (e) {
                          console.log("Error al destruir cropper:", e);
                        }
                        window.cropper = null;
                      }
                      
                      // Eliminar todos los elementos del DOM creados por Cropper
                      const cropperElements = document.querySelectorAll(
                        '.cropper-container, .cropper-wrap-box, .cropper-canvas, ' +
                        '.cropper-drag-box, .cropper-crop-box, .cropper-view-box, ' +
                        '.cropper-modal, .cropper-bg'
                      );
                      
                      cropperElements.forEach(element => {
                        if (element && element.parentNode) {
                          element.parentNode.removeChild(element);
                        }
                      });
                      
                      // Restablecer la imagen original
                      const image = document.getElementById('image');
                      const imagePlaceholder = document.getElementById('image-placeholder');
                      const fileInput = document.getElementById('fileInput');
                      
                      // Limpiar completamente la imagen
                      if (image) {
                        // Liberar el blob URL para evitar memory leaks
                        if (image.src && image.src.startsWith('blob:')) {
                          URL.revokeObjectURL(image.src);
                        }
                        
                        image.src = '';
                        image.style.display = 'none';
                        image.className = 'img-fluid rounded'; // Restablecer clases
                        image.removeAttribute('style'); // O mantener solo algunos estilos
                        image.style.maxWidth = '100%';
                        image.style.display = 'none';
                        
                        // Remover cualquier listener que pueda tener
                        image.onload = null;
                      }
                      
                      // Mostrar placeholder
                      imagePlaceholder.style.display = 'block';
                      if (imagePlaceholder) {
                        //probar en otro momento descomentando la siguiente linea:
                        //imagePlaceholder.style.display = 'block';

                      }
                      
                      // Limpiar input de archivo
                      if (fileInput) {
                        fileInput.value = '';
                      }
                      
                      // Limpiar formulario dinámico
                      const formularioDinamico = document.getElementById('formulario-dinamico');
                      if (formularioDinamico) {
                        formularioDinamico.innerHTML = `
                          <div class="alert alert-info">
                            <i class="bi bi-info-circle"></i>
                            Los controles del formulario aparecerán aquí después de recortar la imagen.
                          </div>
                        `;
                      }
                      
                      // Opcional: también podrías ocultar el contenedor de la imagen
                      const imageContainer = document.querySelector('.image-container');
                      if (imageContainer) {
                        // Limpiar cualquier elemento hijo adicional
                        const childElements = imageContainer.querySelectorAll('*');
                        childElements.forEach(child => {
                          if (child.id !== 'image' && child.id !== 'image-placeholder') {
                          }
                        });
                      }

                      alert("Datos guardados correctamente");
                    } 
                  })
                  .catch(err => {
                    console.error("Error al guardar:", err);
                  });
              });
              
              contenedorFormulario.appendChild(btnGuardar);

          } catch (error) {
              console.error("Error:", error);
          }
      });
  }
});


// Llama a esta función con la imagen recortada en base64
/*document.getElementById("btnPython").addEventListener("click", async () => {

  try {

    ipcRenderer.send('show-overlay');
    //const results = await ejecutarArchivoPython();

    //console.log(results);
    const rutaRobot = path.join(__dirname, 'abrirCalculadora.robot');

    //ejecutarArchivoRobot(rutaRobot);

    ipcRenderer.send('hide-overlay');
    //overlay.remove();

  } catch (error) {
    console.error("Error:", error);
  }
}); 
*/
function obtenerFormulariosFiltrados(formularios) {
  const fechaDesde = document.getElementById("fechaDesde").value;
  const fechaHasta = document.getElementById("fechaHasta").value;
  const estadoFiltro = document.getElementById("estadoFiltro").value;

  return formularios.filter(formulario => {

    const fechaFormulario = new Date(formulario.fecha);

    // Filtro fecha desde
    if (fechaDesde) {
      const desde = new Date(fechaDesde);
      if (fechaFormulario < desde) return false;
    }

    // Filtro fecha hasta
    if (fechaHasta) {
      const hasta = new Date(fechaHasta);
      hasta.setHours(23, 59, 59, 999);
      if (fechaFormulario > hasta) return false;
    }

    // Filtro estado
    if (estadoFiltro && formulario.estado !== estadoFiltro) {
      return false;
    }

    return true;
  });
}

function generarCSV(formularios) {
  let csv = [];

  // Encabezado fijo
  csv.push(["Fecha", "Sección", "Línea", "Texto"].join(";"));

  formularios.forEach(formulario => {
    const fecha = new Date(formulario.fecha).toLocaleString();

    formulario.datos?.forEach(seccion => {
      seccion.lineas?.forEach((texto, index) => {
        const fila = [
          `"${fecha}"`,
          `"${seccion.seccion}"`,
          `"${index + 1}"`,
          `"${(texto ?? "").replace(/"/g, '""')}"`
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



document.getElementById('btnAtrasFormulario').addEventListener('click', async () => {
  
  var btnAtrasFormulario = document.getElementById('btnAtrasFormulario');
  btnAtrasFormulario.style = 'display:none'

  var btnVerFormulario = document.getElementById('btnVerFormularios');
  btnVerFormulario.style = 'display:block'

  var divFormularios = document.getElementById('formulariosGuardados');
  divFormularios.innerHTML = "";

  var btnRecortarImagen = document.getElementById('cropButton');
  btnRecortarImagen.style ='display:block'

  var divInputImagen = document.getElementById('divInputImagen');
  divInputImagen.style ='display:block'

  var divFormulariosGuardados = document.getElementById('divFormulariosGuardados');
  divFormulariosGuardados.style.display = 'none'

  var divFormularioDinamico = document.getElementById('divFormularioDinamico');
  divFormularioDinamico.style = 'display: block'

  var divImagenSeleccionada = document.getElementById('divImagenSeleccionada');
  divImagenSeleccionada.style = 'display: block';
});


document.getElementById('btnVerFormularios').addEventListener('click', async () => {
  //al presionar se debe ocultar el botón de seleccionar archivo o de recortar. 
  //o mejor ponerlos en un div y ocultar
  //poner un botón de atrás cuando se presionar este botón, para "volver atrás".
  //
  var divInputImagen = document.getElementById('divInputImagen');
  divInputImagen.style ='display:none'

  var btnRecortarImagen = document.getElementById('cropButton');
  btnRecortarImagen.style ='display:none'

  var divFormularioDinamico = document.getElementById('divFormularioDinamico');
  divFormularioDinamico.style = 'display: none'

  var btnVerFormulario = document.getElementById('btnVerFormularios');
  btnVerFormulario.style = 'display:none'

  var btnAtrasFormulario = document.getElementById('btnAtrasFormulario');
  btnAtrasFormulario.style = 'display:block'
  //

  var divFormulariosGuardados = document.getElementById('divFormulariosGuardados');
  divFormulariosGuardados.style.display = 'block'

  var divImagenSeleccionada = document.getElementById('divImagenSeleccionada');
  divImagenSeleccionada.style = 'display: none';
  try {
    const formularios = await ipcRenderer.invoke('obtener-formularios');

    const contenedor = document.getElementById('formulariosGuardados');
    contenedor.innerHTML = ""; // Limpiar

    if (formularios.length === 0) {
      contenedor.innerText = "No hay formularios guardados.";
      return;
    }

    const filtrosDiv = document.createElement("div");
    filtrosDiv.className = "d-flex align-items-end gap-3 mb-3";

    filtrosDiv.innerHTML = `
      <div>
        <label class="form-label">Desde</label>
        <input type="date" id="fechaDesde" class="form-control">
      </div>

      <div>
        <label class="form-label">Hasta</label>
        <input type="date" id="fechaHasta" class="form-control">
      </div>

      <div>
        <label class="form-label">Estado</label>
        <select id="estadoFiltro" class="form-select">
          <option value="">Todos</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Confirmado">Confirmado</option>
        </select>
      </div>

      <div class="d-flex gap-2">
        <button id="btnFiltrar" class="btn btn-primary">
          <i class="bi bi-funnel"></i> Filtrar
        </button>

        <button id="btnExportarCsv" class="btn btn-success">
          <i class="bi bi-file-earmark-spreadsheet"></i> Exportar CSV
        </button>
      </div>
    `;

    contenedor.appendChild(filtrosDiv);

    let columnas = [];

    const divTabla = document.createElement("div");
    divTabla.setAttribute("id", "divTabla");
    const tabla = document.createElement("table");

    tabla.style.width = "100%";
    tabla.style.borderCollapse = "collapse";

    let thead = `
    <tr style="background:#f0f0f0">
      <th style="display:none; border:1px solid #ccc; padding:6px">#</th>
      <th style="border:1px solid #ccc; padding:6px">Fecha</th>
    `;

    columnas.forEach(c => {
      thead += `<th style="border:1px solid #ccc; padding:6px">${c}</th>`;
    });

    thead += `
    <th style="border:1px solid #ccc; padding:6px">Acciones</th>
    <th style="border:1px solid #ccc; padding:6px">Estado</th>
    </tr>`;

    tabla.innerHTML = thead;

    formularios.forEach((formulario, index) => {

      // Diccionario plano para lookup rápido
      let mapa = {};

      if (formulario.datos !== undefined && formulario.datos.length > 0) {
        
        formulario.datos.forEach(seccion => {
          
          seccion.lineas.forEach((linea, i) => {
            mapa[`S${seccion.seccion}_L${i + 1}`] = {
              texto: linea?.texto?.trim() ?? "",
              score: typeof linea?.score === "number" ? linea.score : null
            };
          });

        });

        let fila = `
          <tr>
            <td style="display:none; border:1px solid #ccc; padding:6px">${index + 1}</td>
            <td style="border:1px solid #ccc; padding:6px">
              ${new Date(formulario.fecha).toLocaleString()}
            </td>
        `;

        
        columnas.forEach(c => {
          fila += `
            <td style="border:1px solid #ccc; padding:6px">
              ${
                mapa[c] ?? ""
              }
            </td>
            `;
        });

        // Botón para ver imagen si existe
        let botonImagen = '';
        if (formulario.imagen) {
          botonImagen = `
            <button class="btnVerImagen btn btn-sm btn-outline-primary me-2" 
                    data-imagen="${formulario.imagen}" 
                    data-bs-toggle="modal" 
                    data-bs-target="#modalImagen">
              <i class="bi bi-image"></i> Ver Imagen
            </button>
          `;
        }

        fila += `
            <td style="border:1px solid #ccc; padding:6px">
              <div class="d-flex gap-2">
                ${botonImagen}
                <button class="btnVerDetalle btn btn-sm btn-info" data-index="${index}">
                  <i class="bi bi-eye"></i> Ver Detalle
                </button>

                <button class="btnEditar btn btn-sm btn-warning" data-index="${index}">
                  <i class="bi bi-pencil"></i> Editar
                </button>

              </div>
            </td>
            <td style="border:1px solid #ccc; padding:6px">${formulario.estado??""}</td>
          </tr>
        `;

        tabla.innerHTML += fila;
      }

    });

    divTabla.appendChild(tabla);

    contenedor.appendChild(divTabla);

    //tabla interna - inicio
    document.addEventListener("click", (e) => {
      if (!e.target.classList.contains("btnVerDetalle")) return;

      const index = e.target.getAttribute("data-index");
      const formulario = formularios[index];

      const fila = e.target.closest("tr");

      // Si ya existe un detalle abierto → lo quitamos
      if (fila.nextSibling && fila.nextSibling.classList?.contains("detalle-row")) {
        fila.nextSibling.remove();
        return;
      }

      // ===============================
      // Construir tabla de detalle
      // ===============================
      const detalleTr = document.createElement("tr");
      detalleTr.classList.add("detalle-row");

      const detalleTd = document.createElement("td");
      detalleTd.colSpan = columnas.length + 2; // Fecha + acciones + columnas dinámicas
      detalleTd.style.background = "#f9f9f9";
      detalleTd.style.padding = "10px";

      const detalleTabla = document.createElement("table");
      detalleTabla.style.width = "100%";
      detalleTabla.style.borderCollapse = "collapse";

      let head = `
      <tr style="background:#eee">
        <th style="border:1px solid #ccc; padding:6px">Sección</th>
        <th style="border:1px solid #ccc; padding:6px">Líneas</th>
      </tr>`;

      detalleTabla.innerHTML = head;

      formulario.datos.forEach(sec => {
        const tr = document.createElement("tr");

        const tdSec = document.createElement("td");
        tdSec.style.border = "1px solid #ccc";
        tdSec.style.padding = "6px";
        tdSec.textContent = `Sección ${sec.seccion}`;

        const tdLineas = document.createElement("td");
        tdLineas.style.border = "1px solid #ccc";
        tdLineas.style.padding = "6px";

        const innerTable = document.createElement("table");
        innerTable.style.width = "100%";
        innerTable.style.borderCollapse = "collapse";

        sec.lineas.forEach((l, i) => {

          const score = l.score !== undefined
          ? l.score.toFixed(2)
          : "";


          debugger;
          innerTable.innerHTML += `
            <tr>
              <td style="border:1px solid #ddd; padding:4px; width:120px">Línea ${i+1}</td>
              <td style="border:1px solid #ddd; padding:4px">${l.texto ?? ""}</td>
              <td style="border:1px solid #ddd; padding:4px; text-align:center">${score}</td>
            </tr>
            `;
        });

        tdLineas.appendChild(innerTable);

        tr.appendChild(tdSec);
        tr.appendChild(tdLineas);
        detalleTabla.appendChild(tr);
      });

      detalleTd.appendChild(detalleTabla);
      detalleTr.appendChild(detalleTd);

      // Insertar debajo de la fila seleccionada
      fila.parentNode.insertBefore(detalleTr, fila.nextSibling);
    });

    let formularioEditandoIndex = null;

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".btnEditar")) return;

      const btn = e.target.closest(".btnEditar");
      const index = btn.dataset.index;
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
            <div class="row g-2 mb-2 align-items-center">
              
              <div class="col-7">
                <input type="text" class="form-control"
                  data-seccion="${sec.seccion}"
                  data-linea="${i}"
                  value="${l.texto ?? ""}">
              </div>

              <div class="col-3">
                <select class="form-select form-select-sm"
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

              <div class="col-2 d-flex align-items-center">
                <span class="badge bg-secondary">Línea ${i + 1}</span>
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
    });

    document.getElementById("btnGuardarEdicion").addEventListener("click", async () => {
      const formulario = formularios[formularioEditandoIndex];
      debugger;
      const inputs = document.querySelectorAll(
        "#modalEditarBody input[type='text']"
      );

      const selects = document.querySelectorAll(
        "#modalEditarBody select"
      );

      let clasificacion = {};

      inputs.forEach(inp => {
        const seccion = parseInt(inp.dataset.seccion);
        const linea = parseInt(inp.dataset.linea);

        //const scoreInput = inp
        //  .closest(".row")
        //  .querySelector("input[data-score]");

        const select = document.querySelector(
          `select[data-seccion="${seccion}"][data-linea="${linea}"]`
        );

        //const sec = formulario.datos.find(s => s.seccion === seccion);

        if (!select || !select.value) return;

        clasificacion[select.value] = inp.value;

      });

      //marcar estado
      formulario.estado = "Confirmado";

      const res = await ipcRenderer.invoke(
        "editar-formulario",
        {
          id: formulario.id,
          datos: formulario.datos,
          estado: formulario.estado,
          clasificacion
        }
      );



      // cerrar modal
      bootstrap.Modal
        .getInstance(document.getElementById("modalEditarFormulario"))
        .hide();

      // refrescar tabla o recargar la vista
      //renderizarTabla();
    });



    document.getElementById("btnExportarCsv").addEventListener("click", () => {
      const filtrados = obtenerFormulariosFiltrados(formularios);

      if (filtrados.length === 0) {
        alert("No hay datos para exportar con los filtros seleccionados.");
        return;
      }

      const csv = generarCSV(filtrados);
      descargarCSV(csv);
    });

    function renderTabla(formulariosAMostrar) {
      const contenedorTabla = document.getElementById("divTabla");
      contenedorTabla.innerHTML = "";

      if (formulariosAMostrar.length === 0) {
        contenedorTabla.innerHTML = "<p class='text-muted'>No hay resultados.</p>";
        return;
      }

      debugger;
      const tabla = document.createElement("table");
      tabla.className = "table table-bordered table-sm";

      tabla.innerHTML = `
        <thead class="table-light">
          <tr>
            <th>Fecha</th>
            <th>Acciones</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;

      const tbody = tabla.querySelector("tbody");

      /*
      formulariosAMostrar.forEach((formulario, index) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${new Date(formulario.fecha).toLocaleString()}</td>
        `;

        // Botón para ver imagen si existe
        let botonImagen = '<td>';
        if (formulario.imagen) {
          botonImagen += `
            <button class="btnVerImagen btn btn-sm btn-outline-primary me-2" 
                    data-imagen="${formulario.imagen}" 
                    data-bs-toggle="modal" 
                    data-bs-target="#modalImagen">
              <i class="bi bi-image"></i> Ver Imagen
            </button>
          `;
          tr.innerHTML += botonImagen;
        }

        tr.innerHTML +=
            `<button class="btn btn-sm btn-info btnVerDetalle" data-index="${index}">
              <i class="bi bi-eye"></i> Ver Detalle
            </button>
            `

        

        tr.innerHTML+=`
          </td>
        `;

        tbody.appendChild(tr);
      });
      */

      formulariosAMostrar.forEach((formulario, index) => {
        const tr = document.createElement("tr");
        
        let imagenBtnHTML = '';
        if (formulario.imagen) {
            imagenBtnHTML = `
                <button class="btnVerImagen btn btn-sm btn-outline-primary me-2" 
                        data-imagen="${formulario.imagen}" 
                        data-bs-toggle="modal" 
                        data-bs-target="#modalImagen">
                    <i class="bi bi-image"></i> Ver Imagen
                </button>
            `;
        }
        
        tr.innerHTML = `
            <td>${new Date(formulario.fecha).toLocaleString()}</td>
            <td>
                ${imagenBtnHTML}
                <button class="btn btn-sm btn-info btnVerDetalle" data-index="${index}">
                    <i class="bi bi-eye"></i> Ver Detalle
                </button>
            </td>
            <td>
                ${formulario.estado}
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
      contenedorTabla.appendChild(tabla);
    }

    document.getElementById("btnFiltrar").addEventListener("click", () => {
      const filtrados = obtenerFormulariosFiltrados(formularios);
      renderTabla(filtrados);
    });

    //tabla interna - fin

    //console.log(formularios[0]);

    // Botón Exportar al final
    const btnExportar = document.createElement("button");
    btnExportar.innerText = "Exportar";
    btnExportar.style.marginTop = "20px";
    btnExportar.style.padding = "10px 20px";
    btnExportar.style.fontWeight = "bold";
    btnExportar.style.display = "block";

    btnExportar.addEventListener("click", () => {
      console.log("Exportar presionado");

      
    });

    //contenedor.appendChild(btnExportar);

  } catch (err) {
    console.error("Error al obtener formularios:", err);
  }
});

document.getElementById("btnAnalisis")
  .addEventListener("click", () => {
    window.location.href = "analisis.html";
});

