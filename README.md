# Sierra Silenciosa

Juego de caza en primera persona con rifle de precisión, hecho con three.js y sin dependencias externas.

Abre `index.html` con un servidor local (`python3 -m http.server`) y entra en `http://localhost:8000`.

- Balística con caída de la bala, rozamiento y deriva por viento, alza de 100 a 400 m y retícula mil-dot.
- Animales que te oyen, te ven y te huelen según el viento: ciervo, corzo, jabalí, zorro y cierva (protegida).
- Zonas de impacto (corazón, pulmones, cabeza, cuello, cuerpo), rastro de sangre y cámara de bala.

## Gráficos

Todo se genera por código al arrancar: texturas de hierba, tierra, roca, suelo de pinar y corteza (con relieve), ramas de pino y hojas de encina, cielo con nubes, niebla de altura y postprocesado (resplandor, etalonaje, viñeta y grano). En **Opciones → Calidad gráfica** puedes bajar a *Media* o *Baja* si va a tirones.

### Usar fotos reales para el terreno

Descarga texturas libres (por ejemplo de [Poly Haven](https://polyhaven.com/textures) o [ambientCG](https://ambientcg.com), en 1K o 2K, formato JPG), cópialas en `assets/textures/` y rellena `assets/textures/manifest.json`:

```json
{
  "grass": "grass_diff.jpg", "grass_normal": "grass_nor_gl.jpg",
  "dirt": "dirt_diff.jpg", "dirt_normal": "dirt_nor_gl.jpg",
  "rock": "rock_diff.jpg", "rock_normal": "rock_nor_gl.jpg",
  "forest": "forest_diff.jpg", "forest_normal": "forest_nor_gl.jpg",
  "bark": "bark_diff.jpg", "bark_normal": "bark_nor_gl.jpg"
}
```

Cualquier clave que falte sigue usando la textura generada. Los mapas de relieve tienen que ser del tipo OpenGL (`nor_gl`).
