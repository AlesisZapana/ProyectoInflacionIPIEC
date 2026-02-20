import torch
import torch.nn as nn
import torchvision.transforms as transforms
from torchvision.utils import save_image
import os
import cv2
import numpy as np
from PIL import Image

# ---------- Modelo simple U-Net ----------
class UNet(nn.Module):
    def __init__(self):
        super(UNet, self).__init__()
        self.encoder = nn.Sequential(
            nn.Conv2d(1, 64, kernel_size=3, padding=1),
            nn.ReLU(),
            nn.Conv2d(64, 64, kernel_size=3, padding=1),
            nn.ReLU()
        )
        self.decoder = nn.Sequential(
            nn.Conv2d(64, 1, kernel_size=3, padding=1),
            nn.Sigmoid()
        )

    def forward(self, x):
        x = self.encoder(x)
        x = self.decoder(x)
        return x

# ---------- Cargar y preprocesar imagen ----------
def preprocess_image(image_path, size=(256, 256)):
    image = Image.open(image_path).convert("L")  # escala de grises
    transform = transforms.Compose([
        transforms.Resize(size),
        transforms.ToTensor(),  # escala [0, 1]
    ])
    return transform(image).unsqueeze(0)  # [1, 1, H, W]

# ---------- Guardar imagen de salida ----------
def save_output(output_tensor, output_path):
    output_image = output_tensor.squeeze().detach().numpy()
    output_image = (output_image * 255).astype(np.uint8)
    cv2.imwrite(output_path, output_image)

# ---------- Ejecutar ----------
if __name__ == "__main__":
    input_path = "imagenes/precio_original.png"  # tu imagen de entrada
    output_folder = "resultados_unet"
    os.makedirs(output_folder, exist_ok=True)

    # Cargar modelo y poner en eval
    model = UNet()
    model.eval()

    # Cargar imagen
    image_tensor = preprocess_image(input_path)

    # Aplicar U-Net (sin entrenamiento real, solo ejemplo)
    with torch.no_grad():
        output = model(image_tensor)

    # Guardar
    save_path = os.path.join(output_folder, "imagen_unet.png")
    save_output(output, save_path)
    print(f"Imagen segmentada guardada en: {save_path}")
