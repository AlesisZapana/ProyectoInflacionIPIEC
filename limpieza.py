import cv2
import numpy as np

archivo='imagen_0'
tipo='.jpg'
# leer imagen
img = cv2.imread('imagenes/'+archivo+tipo)
#cv2.imread('productos.jpeg')

# blur
blur = cv2.GaussianBlur(img, (3,3), 0)

# convert to hsv and get saturation channel
sat = cv2.cvtColor(blur, cv2.COLOR_BGR2HSV)[:,:,1]

# threshold saturation channel
thresh = cv2.threshold(sat, 50, 255, cv2.THRESH_BINARY)[1]

# apply morphology close and open to make mask
kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9,9))
morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel, iterations=1)
mask = cv2.morphologyEx(morph, cv2.MORPH_OPEN, kernel, iterations=1)


# método otsu, valor umbral
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY+cv2.THRESH_OTSU)[1]

# write black to otsu image where mask is black
otsu_result = otsu.copy()
otsu_result[mask==0] = 0

# write black to input image where mask is black
img_result = img.copy()
img_result[mask==0] = 0

# write result to disk
cv2.imwrite("resultados/"+archivo+"_mask.png", mask)
cv2.imwrite("resultados/"+archivo+"_otsu.png", otsu)
cv2.imwrite("resultados/"+archivo+"_otsu_result.png", otsu_result)
cv2.imwrite("resultados/"+archivo+"_img_result.png", img_result)

