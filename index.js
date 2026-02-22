import { app, BrowserWindow,ipcMain  } from 'electron'
import { initDB }  from './db.js';
import { initDBEstructurada } from './db_estructurada.js'
//const { randomUUID } = require("crypto");

let overlayWindow;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 600,
    webPreferences: {
      nodeIntegration: true, // Permitir require en renderer.js
      contextIsolation: false, // Desactiva el aislamiento de contexto
  }
  });
  
    win.loadFile('index.html')
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  //para mostrar la pantalla gris
  const showOverlay = () => {
    if (!overlayWindow) {
      overlayWindow = new BrowserWindow({
        fullscreen: true, // Cubrirá toda la pantalla
        transparent: true, // Fondo transparente
        frame: false, // Sin bordes
        alwaysOnTop: true, // Siempre visible sobre otras ventanas
        webPreferences: {
          nodeIntegration: true, // Permitir require en overlay.html
          contextIsolation: false, // Desactiva el aislamiento de contexto
        },
      });
  
      overlayWindow.loadFile('overlay.html'); // Carga la vista del overlay
  
      overlayWindow.once('closed', () => {
        overlayWindow = null; // Limpia la referencia cuando se cierra
      });
    }
  };
  
  //para ocultar la pantalla gris
  const hideOverlay = () => {
    if (overlayWindow) {
      overlayWindow.close();
      overlayWindow = null; // Limpia la referencia
    }
  };
  
  app.whenReady().then(() => {
    createWindow()
  
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

ipcMain.handle('guardar-formulario', async (event, datos) => {
  const db = await initDB();
  db.data.formularios.push({
    id: Math.floor(Math.random() * 10000),
    fecha: new Date().toISOString(),
    imagen:datos.imagen,
    datos: datos.datosSecciones,
    estado: datos.estado
  });
  await db.write();
  return { success: true };
});

ipcMain.handle('obtener-formularios', async () => {
  const db = await initDB();
  console.log(db.data)
  return db.data.formularios || [];
});

ipcMain.handle('editar-formulario', async (event, formularioEditado) => {
  const db = await initDB();
  const dbEstr = await initDBEstructurada();
  console.log(dbEstr);
  const index = db.data.formularios.findIndex(
    f => f.id === formularioEditado.id
  );

  if (index === -1) {
    return { success: false, error: "Formulario no encontrado" };
  }

  db.data.formularios[index] = {
    ...db.data.formularios[index],
    datos: formularioEditado.datos,
    estado: formularioEditado.estado
  };

  //guarda en la base estructurada
  const c = formularioEditado.clasificacion;

  if (c && c.anio && c.mes && c.valor) {

    const anio = parseInt(c.anio);
    const mes = parseInt(c.mes);
    const valor = parseFloat(c.valor);

    const producto = c.producto || "Sin producto";
    const tipo = c.tipo || "Sin tipo";

    // buscar
    let registro = dbEstr.data.formularios.find(r =>
      r.producto === producto &&
      r.tipo === tipo
    );

    if (!registro) {
      // crear nuevo registro
      registro = {
        id: Date.now(),
        tipo,
        fechaCarga: new Date().toISOString(),
        producto,
        imagen: "",
        periodos: [],
        estado: "Confirmado"
      };

      dbEstr.data.formularios.push(registro);
    }

    // verificar si ya existe el período
    const periodoExistente = registro.periodos.find(p =>
      p.anio === anio && p.mes === mes
    );

    if (!periodoExistente) {
      registro.periodos.push({
        anio,
        mes,
        valor,
        tipo,
        textoOriginal: "",
        origen: "manual",
        confianza: 1,
        lineasOCR: []
      });
    }
  }

  await db.write();
  await dbEstr.write();
  return { success: true };
});

ipcMain.handle("obtener-formularios-normalizados", async () => {
  try {
    const dbEstr = await initDBEstructurada();

    return dbEstr.data.formularios || [];

  } catch (error) {
    console.error("Error leyendo db_estructurada:", error);
    return [];
  }
});


// Manejo de eventos para mostrar y ocultar el overlay
ipcMain.on('show-overlay', showOverlay);
ipcMain.on('hide-overlay', hideOverlay);