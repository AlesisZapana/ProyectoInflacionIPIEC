from skimage import io, color, filters
from jiwer import cer
from PIL import Image
import pytesseract
import numpy as np
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'


custom_oem_psm_config = r'-l spa --psm 6'

#precio
#imagen_binarizada = io.imread('salidas_metodos/metodo_wolf_jolion.png')
#cuadro
imagen_binarizada = io.imread('salidas_metodosCuadro/otsu.png')
ground_truth = open("ground_truth/form1.txt", encoding="utf-8").read()
ocr_output = pytesseract.image_to_string(imagen_binarizada, config=custom_oem_psm_config)

print(ocr_output)
error = cer(ground_truth, ocr_output)
print(f"Error de caracteres (CER): {error:.2%}")
