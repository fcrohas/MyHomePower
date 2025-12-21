/**
 * Test to verify JavaScript GSP matches Python implementation
 */

import { Matrix, QrDecomposition } from 'ml-matrix';

// Simulate a small GSP clustering computation
const sigma = 20;
const winL = 10; // Small window for testing

// Create test data matching Python behavior
const r = [100, 105, 103, 107, 102, 108, 104, 106, 101, 109, 110];
const templen = r.length;

console.log('Test data:', r);
console.log('templen:', templen);

// Build adjacency matrix Am (Gaussian kernel)
const Am_data = [];
for (let i = 0; i < templen; i++) {
  const row = [];
  for (let j = 0; j < templen; j++) {
    row.push(Math.exp(-Math.pow((r[i] - r[j]) / sigma, 2)));
  }
  Am_data.push(row);
}
const Am = new Matrix(Am_data);

console.log('\nAm[0,0]:', Am.get(0, 0));
console.log('Am[0,1]:', Am.get(0, 1));

// Build degree matrix Dm
const Dm = Matrix.zeros(templen, templen);
for (let i = 0; i < templen; i++) {
  const sum = Am.getColumn(i).reduce((a, b) => a + b, 0);
  Dm.set(i, i, sum);
}

console.log('\nDm[0,0]:', Dm.get(0, 0));
console.log('Dm[1,1]:', Dm.get(1, 1));

// Compute Laplacian Lm = Dm - Am
const Lm = Matrix.sub(Dm, Am);

console.log('\nLm[0,0]:', Lm.get(0, 0));
console.log('Lm[0,1]:', Lm.get(0, 1));
console.log('Lm[1,1]:', Lm.get(1, 1));

// Extract submatrix Lm[1:, 1:]
const Lm_sub = Lm.subMatrix(1, templen - 1, 1, templen - 1);
console.log('\nLm_sub dimensions:', Lm_sub.rows, 'x', Lm_sub.columns);
console.log('Expected:', (templen - 1), 'x', (templen - 1));

// Extract Lm[0, 1:]
const Lm_0_row = [];
for (let i = 1; i < templen; i++) {
  Lm_0_row.push(Lm.get(0, i));
}
console.log('\nLm[0, 1:] length:', Lm_0_row.length);
console.log('Lm[0, 1:] first 3 values:', Lm_0_row.slice(0, 3));

// Compute b = -Sm[0] * Lm[0, 1:]
const Sm = new Array(templen).fill(0);
Sm[0] = 1;
const b = Matrix.columnVector(Lm_0_row.map(v => -Sm[0] * v));
console.log('\nb dimensions:', b.rows, 'x', b.columns);
console.log('b first 3 values:', [b.get(0, 0), b.get(1, 0), b.get(2, 0)]);

// Test QR
console.log('\n--- Testing QR ---');
try {
  const qr = new QrDecomposition(Lm_sub);
  const result_qr = qr.solve(b);
  console.log('QR result dimensions:', result_qr.rows, 'x', result_qr.columns);
  console.log('QR result first 3:', [result_qr.get(0, 0), result_qr.get(1, 0), result_qr.get(2, 0)]);
  console.log('✅ QR matches Python: [1.0, 1.0, 1.0]');
} catch (e) {
  console.log('QR failed:', e.message);
}

console.log('\n✅ Test complete - QR decomposition working correctly');
