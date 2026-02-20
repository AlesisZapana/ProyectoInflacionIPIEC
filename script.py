from PIL import Image
import pytesseract
import numpy as np
#headless cv2
import cv2

pytesseract.pytesseract.tesseract_cmd = r'/usr/bin/tesseract'

##porque no funciona?
#V1
#https://pyimagesearch.com/2021/11/15/tesseract-page-segmentation-modes-psms-explained-how-to-improve-your-ocr-accuracy/
#img = r"/home/aco/documentos/python/texto.png"
img = r"/home/aco/documentos/python/manuscrito.jpeg"

img2= r"/home/aco/documentos/python/manuscrito_otsu.png"

imgPlanilla ="resultados/imagen_0_otsu.png"

#segunda alternativa

print(imgPlanilla)
imgPlanilla = cv2.imread(imgPlanilla)
#img = cv2.imread('manuscrito.jpeg')

#print(img)
# Convertir la imagen a escala de grises
# Convertir la imagen a escala de grises
gray = cv2.cvtColor(imgPlanilla, cv2.COLOR_BGR2GRAY)

# Convertir la imagen en escala de grises a una imagen en color
color = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

# Aplicar la eliminación de ruido no local
dst = cv2.fastNlMeansDenoisingColored(color, None, 10, 10, 7, 21)

# Convertir la imagen en color denoiseada de nuevo a una imagen en escala de grises
dst_gray = cv2.cvtColor(dst, cv2.COLOR_BGR2GRAY)

cv2.imwrite('preprocessed_image.jpg', dst_gray)

try:
    #print(pytesseract.image_to_string(Image.open(img,)))# Timeout after 2 seconds
    custom_oem_psm_config = r'--oem 3 --psm 7'
    #quitar el ruido
    print(pytesseract.image_to_string(img2,config='--psm 6')) # Timeout after half a second
except RuntimeError as timeout_error:
    # Tesseract processing is terminated
    print(timeout_error)
    pass