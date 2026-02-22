//const Cropper = require('cropperjs');
const { exec } = require("child_process"); //ejecuta el archivo python
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path')

let cropper;

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

function convertirFecha(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Mes comienza en 0
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}${month}${day}${hours}${minutes}`;
}

document.getElementById('fileInput').addEventListener('change', (event) => {
    debugger;
    const file = event.target.files[0];
    if (!file) return;

    const imageUrl = URL.createObjectURL(file);
    const imageElement = document.getElementById('image');
    const placeholder = document.getElementById('image-placeholder');

    // 🔹 Mostrar imagen
    imageElement.src = imageUrl;
    imageElement.style.display = 'block';

    // 🔹 Ocultar placeholder
    if (placeholder) {
        placeholder.style.display = 'none';
    }

    // 🔹 Esperar a que cargue antes de iniciar cropper
    imageElement.onload = () => {

        if (cropper) {
            cropper.destroy();
            cropper = null;
        }

        cropper = new Cropper(imageElement, {
            viewMode: 1,
            autoCropArea: 1,
            responsive: true
        });

    };
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


