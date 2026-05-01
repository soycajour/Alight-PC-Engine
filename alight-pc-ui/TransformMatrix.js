// ============================================================
// TransformMatrix — 2D Affine Transform (TRS) Math
// Used for computing world transforms via parent-child chains
// ============================================================

export class TransformMatrix {
  // Creates a 3x3 matrix as a flat array [a,b,c,d,e,f] (like Canvas2D)
  // [a c e]
  // [b d f]
  // [0 0 1]
  constructor() {
    this.m = [1, 0, 0, 1, 0, 0]; // Identity
  }

  static identity() {
    const mat = new TransformMatrix();
    mat.m = [1, 0, 0, 1, 0, 0];
    return mat;
  }

  // Build matrix from TRS decomposition
  // tx, ty = translation, sx, sy = scale, rot = rotation in DEGREES, px, py = pivot
  static fromTRS(tx, ty, sx, sy, rot, px, py) {
    const mat = new TransformMatrix();
    const rad = (rot || 0) * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // Standard TRS with Pivot: T(tx, ty) * R(rot) * S(sx, sy) * T(-px, -py)
    const a = cos * sx;
    const b = sin * sx;
    const c = -sin * sy;
    const d = cos * sy;
    const e = tx - (a * px + c * py);
    const f = ty - (b * px + d * py);

    mat.m = [a, b, c, d, e, f];
    return mat;
  }

  // Multiply this matrix by another: result = this * other
  multiply(other) {
    const [a1, b1, c1, d1, e1, f1] = this.m;
    const [a2, b2, c2, d2, e2, f2] = other.m;
    const result = new TransformMatrix();
    result.m = [
      a1 * a2 + c1 * b2,
      b1 * a2 + d1 * b2,
      a1 * c2 + c1 * d2,
      b1 * c2 + d1 * d2,
      a1 * e2 + c1 * f2 + e1,
      b1 * e2 + d1 * f2 + f1
    ];
    return result;
  }

  // Apply this transform to a Canvas2D context
  applyToCanvas(ctx) {
    const [a, b, c, d, e, f] = this.m;
    ctx.transform(a, b, c, d, e, f);
  }

  // Extract just the translation
  get tx() { return this.m[4]; }
  get ty() { return this.m[5]; }

  inverse() {
    const [a, b, c, d, e, f] = this.m;
    const det = a * d - b * c;
    const result = new TransformMatrix();
    if (Math.abs(det) < 1e-6) return result; // Return identity if singular
    const invDet = 1 / det;
    result.m = [
       d * invDet,
      -b * invDet,
      -c * invDet,
       a * invDet,
      (c * f - d * e) * invDet,
      (b * e - a * f) * invDet
    ];
    return result;
  }

  transformPoint(x, y) {
    const [a, b, c, d, e, f] = this.m;
    return {
      x: a * x + c * y + e,
      y: b * x + d * y + f
    };
  }
}

// ============================================================
// WorldTransformResolver — walks parent chain to compute
// the cumulative world-space matrix for any node
// ============================================================
export class WorldTransformResolver {
  constructor(nodeLookup, evaluateTransformFn, AlightXMLParser) {
    this.lookup = nodeLookup;
    this.cache = new Map(); // nodeId → matrix (cache per frame)
    this.evaluateTransform = evaluateTransformFn;
    this.AlightXMLParser = AlightXMLParser;
  }

  // Call this at the start of each frame to clear per-frame cache
  clearCache() {
    this.cache.clear();
  }

  // Get the world-space TransformMatrix for a node at a given absolute time
  getWorldMatrix(nodeId, currentAnimTime) {
    if (this.cache.has(nodeId)) return this.cache.get(nodeId);

    const node = this.lookup[nodeId];
    if (!node) return TransformMatrix.identity();

    // Evaluate this node's local transform
    const totalTime = (node.endTime - node.startTime) || 1;
    const normalizedTime = Math.max(0, Math.min(1, (currentAnimTime - node.startTime) / totalTime));
    const localTRS = this.AlightXMLParser.evaluateTransform(node.transform, normalizedTime);

    const localMatrix = TransformMatrix.fromTRS(
      localTRS.x, localTRS.y,
      localTRS.scaleX, localTRS.scaleY,
      localTRS.rotation,
      localTRS.pivotX, localTRS.pivotY
    );

    // If node has a parent, accumulate the parent's world matrix
    let worldMatrix;
    if (node.parentId && this.lookup[node.parentId]) {
      const parentMatrix = this.getWorldMatrix(node.parentId, currentAnimTime);
      worldMatrix = parentMatrix.multiply(localMatrix);
    } else {
      worldMatrix = localMatrix;
    }

    this.cache.set(nodeId, worldMatrix);
    return worldMatrix;
  }
}
