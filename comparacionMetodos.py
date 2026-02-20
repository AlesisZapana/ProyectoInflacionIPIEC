from skimage import io, color, filters
from skimage.filters import threshold_niblack, threshold_sauvola, threshold_local
from skimage.util import img_as_ubyte
import numpy as np
import os
import cv2
import matplotlib.pyplot as plt

def kittler_threshold(gray_image):
    # Asegurarse que los valores estén entre 0 y 255 como enteros
    image = (gray_image * 255).astype(np.uint8)
    hist, bin_edges = np.histogram(image.ravel(), bins=256, range=(0, 256))
    hist = hist.astype(np.float32)
    hist /= hist.sum()  # Normalizar histograma

    best_thresh = 0
    min_criterion = np.inf

    for t in range(1, 255):
        p1 = np.sum(hist[:t])
        p2 = np.sum(hist[t:])
        if p1 == 0 or p2 == 0:
            continue

        mu1 = np.sum(np.arange(0, t) * hist[:t]) / p1
        mu2 = np.sum(np.arange(t, 256) * hist[t:]) / p2

        sigma1_sq = np.sum(((np.arange(0, t) - mu1) ** 2) * hist[:t]) / p1
        sigma2_sq = np.sum(((np.arange(t, 256) - mu2) ** 2) * hist[t:]) / p2

        if sigma1_sq <= 0 or sigma2_sq <= 0:
            continue

        criterion = 1 + 2 * (p1 * np.log(sigma1_sq) + p2 * np.log(sigma2_sq)) - \
                    2 * (p1 * np.log(p1) + p2 * np.log(p2))

        if criterion < min_criterion:
            min_criterion = criterion
            best_thresh = t

    return best_thresh / 255.0  # Normalizar a rango 0-1

# Cargar imagen
image = io.imread('imagenes/cropped_image.png')  # Cambia esta ruta

# Eliminar canal alfa si existe
if image.shape[-1] == 4:
    image = image[:, :, :3]

# Convertir a escala de grises
gray = color.rgb2gray(image)

# Crear carpeta de salida si no existe
output_dir = 'salidas_metodosCuadro'
os.makedirs(output_dir, exist_ok=True)

# Niblack
niblack_thresh = threshold_niblack(gray, window_size=25, k=0.8)
niblack_binary = gray > niblack_thresh
io.imsave(os.path.join(output_dir, 'niblack.png'), img_as_ubyte(niblack_binary))

# Sauvola
sauvola_thresh = threshold_sauvola(gray, window_size=25)
sauvola_binary = gray > sauvola_thresh
io.imsave(os.path.join(output_dir, 'sauvola.png'), img_as_ubyte(sauvola_binary))

# Wolf & Jolion (usando OpenCV como aproximación)
gray_uint8 = img_as_ubyte(gray)
mean = cv2.adaptiveThreshold(gray_uint8, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                             cv2.THRESH_BINARY, 25, 10)
cv2.imwrite(os.path.join(output_dir, 'wolf_jolion.png'), mean)

# Kapur (usa histogramas)
def threshold_kapur(image):
    hist, bins = np.histogram(image.ravel(), bins=256, range=[0, 1])
    hist = hist.astype(np.float32)
    hist /= hist.sum()
    cumsum = np.cumsum(hist)
    entropy_total = -np.nansum(hist * np.log(hist + 1e-10))
    max_entropy = -np.inf
    best_thresh = 0
    for t in range(1, 256):
        p1, p2 = cumsum[:t], cumsum[t:]
        h1 = hist[:t] / (p1[-1] + 1e-10)
        h2 = hist[t:] / (p2[-1] + 1e-10)
        e1 = -np.nansum(h1 * np.log(h1 + 1e-10))
        e2 = -np.nansum(h2 * np.log(h2 + 1e-10))
        entropy = e1 + e2
        if entropy > max_entropy:
            max_entropy = entropy
            best_thresh = t
    return best_thresh / 255.0

kapur_thresh = threshold_kapur(gray)
kapur_binary = gray > kapur_thresh
io.imsave(os.path.join(output_dir, 'kapur.png'), img_as_ubyte(kapur_binary))


# Kittler & Illingworth (requiere implementación especial, opcional)
kittler_thresh = kittler_threshold(gray)
kittler_binary = gray > kittler_thresh
io.imsave(os.path.join(output_dir, 'kittler.png'), img_as_ubyte(kittler_binary))

print("Imágenes binarizadas guardadas en la carpeta 'salidas_metodos'.")