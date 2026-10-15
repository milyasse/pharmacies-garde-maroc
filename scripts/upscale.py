# Agrandissement IA (Real-ESRGAN x4plus, CPU) puis réduction vers la taille cible.
import sys, cv2, torch
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer
src, dst, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
up = RealESRGANer(scale=4, model_path='RealESRGAN_x4plus.pth', model=model, tile=256, tile_pad=10, pre_pad=0, half=False, device=torch.device('cpu'))
img = cv2.imread(src, cv2.IMREAD_COLOR)
out, _ = up.enhance(img, outscale=4)
h = round(out.shape[0] * width / out.shape[1])
out = cv2.resize(out, (width, h), interpolation=cv2.INTER_AREA)
cv2.imwrite(dst, out)
print('ok', out.shape)
