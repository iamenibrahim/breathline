# Run from the repo root: python3 scripts/gen-terrain.py (needs numpy, matplotlib, Pillow).
# Generates a faint topographic contour texture for the map backdrop (2000x1280 map units, 0.8 px per unit).
import numpy as np, matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image
rng = np.random.default_rng(20261120)
W, H = 1600, 1024
y, x = np.mgrid[0:H, 0:W] / 100.0
z = np.zeros_like(x)
for _ in range(38):
    cx, cy = rng.uniform(-1, W / 100 + 1), rng.uniform(-1, H / 100 + 1)
    s = rng.uniform(0.8, 3.2); a = rng.uniform(-1, 1)
    z += a * np.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s))
z += 0.15 * np.sin(x * 0.9) * np.cos(y * 1.3)
fig = plt.figure(figsize=(W / 100, H / 100), dpi=100)
ax = fig.add_axes([0, 0, 1, 1]); ax.axis('off')
lv = np.linspace(z.min(), z.max(), 34)
ax.contour(z, levels=lv, colors='#ecebe4', linewidths=0.6, alpha=0.55)
ax.contour(z, levels=lv[::5], colors='#ecebe4', linewidths=1.1, alpha=0.8)
ax.set_xlim(0, W); ax.set_ylim(H, 0)
fig.savefig('/tmp/terrain_raw.png', transparent=True)
im = Image.open('/tmp/terrain_raw.png').convert('LA')
im.save('src/ui/assets/terrain.png', optimize=True)
