const { ipcRenderer } = require('electron');
//const { chart} = require('chart.js');

let formularios = [];
let datosFiltrados = [];
let chart = null;
document.addEventListener("DOMContentLoaded", async () => {
    formularios = await ipcRenderer.invoke("obtener-formularios-normalizados");

    cargarSelectTipos();
    cargarSelectProductos();
    aplicarFiltros();

});


document.getElementById("btnExportarCSV").addEventListener("click", () => {

  let csv = "Producto,Año,Mes,Precio\n";

    datosFiltrados.forEach(d => {
        csv += `${d.producto},${d.anio},${d.mes ?? ""},${d.precio}\n`;
    });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "reporte_filtrado.csv";
  a.click();
});

function cargarSelectTipos() {

    const select = document.getElementById("filtroTipo");
    select.innerHTML = '<option value="">Todos</option>';

    const tiposUnicos = [...new Set(formularios.map(f => f.tipo))];

    tiposUnicos
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    .forEach(tipo => {
        const option = document.createElement("option");
        option.value = tipo;
        option.textContent = tipo;
        select.appendChild(option);
    });
}


function cargarSelectProductos(tipoSeleccionado = "") {

    const select = document.getElementById("filtroProducto");
    select.innerHTML = '<option value="">Todos</option>';

    let productosFiltrados = formularios;

    if (tipoSeleccionado) {
        productosFiltrados = formularios.filter(f => f.tipo === tipoSeleccionado);
    }

    const productosUnicos = [...new Set(productosFiltrados.map(f => f.producto))];

    productosUnicos
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    .forEach(prod => {
        const option = document.createElement("option");
        option.value = prod;
        option.textContent = prod;
        select.appendChild(option);
    });

}

document.getElementById("filtroTipo").addEventListener("change", function() {
    cargarSelectProductos(this.value);
});

document.getElementById("btnFiltrar")
    .addEventListener("click", aplicarFiltros);

function aplicarFiltros() {

    const desde = document.getElementById("filtroDesde").value;
    const hasta = document.getElementById("filtroHasta").value;
    const producto = document.getElementById("filtroProducto").value;
    const tipo = document.getElementById("filtroTipo").value;
    

    let desdeNum = null;
    let hastaNum = null;

    if (desde) {
        const [anioDesde, mesDesde] = desde.split("-");
        desdeNum = parseInt(anioDesde) * 100 + parseInt(mesDesde);
    }

    if (hasta) {
        const [anioHasta, mesHasta] = hasta.split("-");
        hastaNum = parseInt(anioHasta) * 100 + parseInt(mesHasta);
    }

    datosFiltrados = [];

    formularios.forEach(form => {

        // filtro por tipo
        if (tipo && form.tipo !== tipo) return;

        if (producto && form.producto !== producto) return;

        // aplanar periodos
        form.periodos.forEach(periodo => {

            const periodoNum = periodo.anio * 100 + periodo.mes;

            if (desdeNum && periodoNum < desdeNum) return;

            if (hastaNum && periodoNum > hastaNum) return;
            
            datosFiltrados.push({
                fecha: `${periodo.mes}/${periodo.anio}`,
                formulario: form.id,
                producto: form.producto,
                tipo: form.tipo,
                precio: periodo.valor??0,
                anio: periodo.anio,
                mes: periodo.mes
            });

        });

    });

    // si solo tiene tipo y no producto => se agrupa y suman
    if (tipo && !producto) {
        datosFiltrados = agruparYSumarPorPeriodo(datosFiltrados);
    }
    renderTabla();
    renderGrafico();
}

function agruparYSumarPorPeriodo(datos) {

    const agrupado = {};

    datos.forEach(d => {

        const key = `${d.anio}-${d.mes}`;

        if (!agrupado[key]) {
            agrupado[key] = {
                anio: d.anio,
                mes: d.mes,
                precio: 0
            };
        }

        agrupado[key].precio += d.precio;
    });

    return Object.values(agrupado);
}

function renderTabla() {

  const tbody = document.querySelector("#tablaResultados tbody");
    tbody.innerHTML = "";

    if (datosFiltrados.length === 0) return;

    datosFiltrados.forEach(d => {

      const tr = document.createElement("tr");

      if (!d.formulario) {

          const periodo = `${String(d.mes).padStart(2, '0')}/${d.anio}`;

          tr.innerHTML = `
              <td>${periodo}</td>
              <td>${document.getElementById("filtroTipo").value}</td>
              <td>Todos (${document.getElementById("filtroTipo").value})</td>
              <td>$${d.precio ?? 0}</td>
              <td>-</td>
              <td>-</td>
          `;

      } else {

          // modo normal (producto individual)

          const periodo = `${String(d.mes).padStart(2, '0')}/${d.anio}`;

          tr.innerHTML = `
              <td>${periodo}</td>
              <td>${d.tipo??""}</td>
              <td>${d.producto}</td>
              <td>$${d.precio ?? 0}</td>
              <td>-</td>
              <td>-</td>
          `;
      }

      tbody.appendChild(tr);
  });

}


function renderGrafico() {

  const inflacionPlugin = {
        id: "inflacionPlugin",
        afterDatasetsDraw(chart, args, pluginOptions) {

            const { ctx } = chart;
            const dataset = chart.data.datasets[0];
            const meta = chart.getDatasetMeta(0);

            ctx.save();
            ctx.font = "12px Arial";
            ctx.fillStyle = "blue";
            ctx.textAlign = "center";

            for (let i = 1; i < dataset.data.length; i++) {

                const valorAnterior = dataset.data[i - 1];
                const valorActual = dataset.data[i];

                if (valorAnterior === 0) continue;

                const variacion =
                    ((valorActual - valorAnterior) / valorAnterior) * 100;

                const puntoActual = meta.data[i];
                const puntoAnterior = meta.data[i - 1];

                const x = (puntoActual.x + puntoAnterior.x) / 2;
                const y = (puntoActual.y + puntoAnterior.y) / 2 - 10;

                ctx.fillText(
                    variacion.toFixed(1) + "%",
                    x,
                    y
                );
            }

            ctx.restore();
        }
  };
  /*
    const ctx = document.getElementById("graficoPrecios");

    // ordenar por año/mes
    const ordenados = [...datosFiltrados].sort((a, b) => {
        if (a.anio !== b.anio) return a.anio - b.anio;
        return (a.mes || 0) - (b.mes || 0);
    });

    const labels = ordenados.map(d => `${d.anio}-${d.mes ?? 0}`);
    const valores = ordenados.map(d => d.precio??0);

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Precio",
                data: valores,
                tension: 0.3
            }]
        }
    });
    */

    const ctx = document
        .getElementById("graficoPrecios")
        .getContext("2d");

    const ordenados = [...datosFiltrados].sort((a, b) => {
        if (a.anio !== b.anio) return a.anio - b.anio;
        return (a.mes || 0) - (b.mes || 0);
    });

    const labels = ordenados.map(d => `${d.anio}-${d.mes ?? 0}`);
    const valores = ordenados.map(d => d.precio ?? 0);

    //BASE 100
    const valorBase = valores[0];

    const indiceBase100 = valores.map(v =>
        valorBase === 0 ? 0 : (v / valorBase) * 100
    );

    const variacionAcumulada = valores.map(v =>
        (valorBase === 0 ? 0 : ((v / valorBase) - 1) * 100)
    );

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
        type: "line",
        data: {
            labels,
            datasets: [
              {
                label: "Precio",
                data: valores,
                tension: 0.3,
                pointRadius: 5
              },
              {
                label: "Variación acumulada %",
                data: variacionAcumulada,
                tension: 0.3,
                borderDash: [5, 5],
                pointRadius: 4,
                yAxisID: 'y1'
              }
          ]
        },
        options: {
            responsive: true,
            /*plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return "$" + context.raw;
                        }
                    }
                }
            }*/
           interaction: {
                mode: 'index',
                intersect: false
            },
            scales: {
              y: {
                  type: 'linear',
                  position: 'left',
                  title: {
                      display: true,
                      text: 'Precio'
                  }
              },
              y1: {
                  type: 'linear',
                  position: 'right',
                  title: {
                      display: true,
                      text: 'Variación Acumulada %'
                  },
                  grid: {
                      drawOnChartArea: false
                  }
              }
            }

        },
        plugins: [inflacionPlugin]
    });



}
