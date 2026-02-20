import sys
import json
from PIL import Image
import pytesseract
import numpy as np
#headless cv2
import cv2
from robot import run

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
archivo_robot = "abrirCalculadora.robot"


#V1
#https://pyimagesearch.com/2021/11/15/tesseract-page-segmentation-modes-psms-explained-how-to-improve-your-ocr-accuracy/
#img = r"/home/aco/documentos/python/texto.png"
#img = r"/home/aco/documentos/python/manuscrito_otsu.png"
#img = r"/home/aco/documentos/python/imagen0_otsu.png"
keyword = "|"
x_positions = []

if len(sys.argv) < 2:
    print("Error: No se proporcionó la ruta de la imagen.")
    sys.exit(1)
    
#11/01/2025 -> comentado
#img = r"C:\Users\H7241T\Documents\tesis\electron\my-electron-app\resultados\imagen_0_otsu.png"
img = sys.argv[1]
imgCV=cv2.imread(img)

#psm 4 -> para imagenes que contengan texto que deben ser organizados en filas

#psm 5 -> lo mismo que el 4 pero para imágenes rotadas hacia un lado
#psm 6 -> para bloques de texto uniformes
#psm 7 -> imagen con texto que esté organizado en una sola línea.
#print(img)

# Verifica que se haya pasado un argumento

#no está haciendo la limpieza de la imagen?

try:
    #print(pytesseract.image_to_string(Image.open(img,)))# Timeout after 2 seconds
    #spa=> spanish
    custom_oem_psm_config = r'-l spa --psm 6'

    # Convertir la imagen a escala de grises
    gray = cv2.cvtColor(imgCV, cv2.COLOR_BGR2GRAY)

    #textoPuro=pytesseract.image_to_string(otsu_result,config=custom_oem_psm_config)
    data = pytesseract.image_to_data(img, config=custom_oem_psm_config, output_type=pytesseract.Output.DICT)

    otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)[1]

    cv2.imwrite("imagenes/imagenCompleta_gris.png", gray)
    cv2.imwrite("imagenes/imagenCompleta_otsu.png", otsu)

    for i, text in enumerate(data["text"]):
        if keyword.lower() in text.lower():
            x_positions.append(data["left"][i])  # Coordenada X de la palabra

    # Ordenar y añadir los extremos de la imagen
    x_positions = sorted(set(x_positions))

    x_positions = [0] + x_positions + [gray.shape[1]]  # Agregar inicio y fin de la imagen
    secciones = []

    for i in range(len(x_positions) - 1):
        x1, x2 = x_positions[i], x_positions[i + 1]
        sub_img = imgCV[:, x1:x2]  # Recortar en el eje X

        imagen=cv2.cvtColor(sub_img, cv2.COLOR_BGR2GRAY)
        

        otsu = cv2.threshold(imagen, 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)[1]
        #otsu fin
        
        # Extraer texto de la subimagen
        textoPuro = pytesseract.image_to_string(otsu, config=custom_oem_psm_config)
        
        # Eliminar líneas en blanco
        texto = '\n'.join(linea for linea in textoPuro.splitlines() if linea.strip())
        
        # Guardar cada sección en un archivo separado
        file_name = f"seccion_{i+1}.txt"
        with open(file_name, "w", encoding="utf-8") as file:
            file.writelines(texto)

        secciones.append({
            "seccion": i + 1,
            "texto": texto
        })

    #print(f"Texto de la seccion {i+1}:\n{texto}\n{'-'*50}")
    print(json.dumps(secciones, ensure_ascii=False))
    #run(archivo_robot)

    #quitar lineas en blanco
    #version vieja
    #texto='\n'.join(linea for linea in textoPuro.splitlines() if linea.strip())
    #print(textoPuro)
    #descargar txt    
    #file =open("planilla_prueba.txt","w")
    #file.writelines(texto)
    #file.close()

except RuntimeError as timeout_error:
    # Tesseract processing is terminated
    print(timeout_error)
    pass


#no es lo mismo varias lineas en una celda. Se interpreta linea por linea, no existe lógica para la diferencia de celda

#Lee bien el texto manuscrito en MAYUSCULA, no tanto en minúscula
