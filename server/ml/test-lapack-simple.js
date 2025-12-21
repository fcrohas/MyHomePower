/**
 * Debug test for LAPACK pinv
 */

import { pseudoInverse } from './lapackPinv.js';
import { Matrix } from 'ml-matrix';

// Simple 2x2 test matrix
const testMatrix = new Matrix([[4, 0], [3, -5]]);
console.log('Test matrix:');
console.log(testMatrix.to2DArray());

const pinv = pseudoInverse(testMatrix);
console.log('\nPinv result:');
console.log(pinv.to2DArray());

// Verify: A * pinv(A) * A should equal A
const verify = testMatrix.mmul(pinv).mmul(testMatrix);
console.log('\nA * pinv(A) * A (should equal A):');
console.log(verify.to2DArray());

// Test with NumPy reference
console.log('\nNumPy reference for [[4,0],[3,-5]]:');
console.log('[[0.25, 0.15], [0, -0.2]]');
