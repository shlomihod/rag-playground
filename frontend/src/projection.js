/**
 * PCA projection: project a high-dimensional vector to 2D.
 * Formula: (q - mean) @ components.T
 */

let mean, components;

export function initProjection(pcaModel) {
  mean = pcaModel.mean;
  components = pcaModel.components;
}

export function projectTo2D(vector) {
  const centered = vector.map((v, i) => v - mean[i]);
  return components.map(comp =>
    comp.reduce((sum, c, i) => sum + c * centered[i], 0)
  );
}
