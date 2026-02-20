const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    log: (message) => console.log(message)
});
