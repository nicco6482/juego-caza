# Sierra Silenciosa

### [▶ Jugar ahora](https://nicco6482.github.io/juego-caza/)

Juego de caza en primera persona con rifle de precisión, hecho con three.js y sin dependencias externas.

Abre `index.html` con un servidor local (`python3 -m http.server`) y entra en `http://localhost:8000`.

- Balística con caída de la bala, rozamiento y deriva por viento, alza de 100 a 400 m y retícula mil-dot.
- Animales que te oyen, te ven y te huelen según el viento: ciervo, gamo, corzo, jabalí, muflón, cabra montés, zorro y liebre; la cierva y el lobo ibérico están protegidos.
- Zonas de impacto (corazón, pulmones, cabeza, cuello, cuerpo), rastro de sangre y cámara de bala.
- Cinco armas (teclas 1-5 o rueda del ratón): rifle de cerrojo con visor, rifle de palanca, escopeta paralela, superpuesta y semiautomática.
- Caza menor: perdiz roja, tórtola, zorzal, agachadiza y ánade real; con escopeta, ojeo de aves que entran a tiro.
- Rehala: 2 bracos húngaros y 3 podencos que levantan y cobran las aves, y 2 teckels que siguen el rastro de las piezas heridas.

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

### Usar modelos 3D reales para los animales

Los animales se generan por código, pero el juego puede usar modelos de verdad (glTF/GLB con esqueleto y animaciones). Cópialos en `assets/models/` y decláralos en `assets/models/manifest.json`, una entrada por especie (`ciervo`, `cierva`, `gamo`, `gama`, `corzo`, `jabali`, `muflon`, `cabra`, `cabra_h`, `zorro`, `lobo`, `liebre`):

```json
{
  "ciervo": {
    "file": "ciervo.glb",
    "anims": { "idle": "Idle", "walk": "Walk", "run": "Gallop", "eat": "Eating", "death": "Death" }
  }
}
```

- `anims` es opcional: si no se indica, se buscan animaciones cuyo nombre contenga *idle*, *walk*, *run/gallop*, *eat/graze* y *death*.
- Opcionales: `scale` (si no, se ajusta al tamaño del animal), `rotationY` (en radianes, si el modelo no mira hacia +Z) y `offsetY`.
- Las zonas de impacto siguen siendo las del animal generado, así que conviene que el modelo tenga proporciones realistas.
- Revisa la licencia de cada modelo (CC0 o CC-BY con atribución).
