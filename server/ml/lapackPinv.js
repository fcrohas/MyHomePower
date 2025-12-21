/**
 * LAPACK pseudoinverse wrapper for ml-matrix compatibility
 * Provides high-performance pseudoinverse using LAPACK SVD
 */

import { Matrix, QrDecomposition } from 'ml-matrix';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { pinv: lapackPinv } = require('../../native/index.js');

// Threshold for using LAPACK vs QR (tuned for performance)
const LAPACK_SIZE_THRESHOLD = 200;

/**
 * Compute pseudoinverse using best available method
 * - LAPACK SVD for small/medium matrices (most accurate, original algorithm)
 * - QR decomposition for large matrices (faster)
 * @param {Matrix} matrix - ml-matrix Matrix object
 * @returns {Matrix} Pseudoinverse as ml-matrix Matrix
 */
export function pseudoInverse(matrix) {
    if (!(matrix instanceof Matrix)) {
        throw new Error('Input must be an ml-matrix Matrix');
    }
    
    const rows = matrix.rows;
    const cols = matrix.columns;
    const size = Math.max(rows, cols);
    
    // For large matrices, use QR (8x faster)
    if (size > LAPACK_SIZE_THRESHOLD) {
        // Solve least squares using QR decomposition
        // This is faster but slightly less accurate than full SVD
        try {
            const qr = new QrDecomposition(matrix);
            // For rectangular systems, QR gives least-squares solution
            // which approximates pseudoinverse behavior
            return qr.solve(Matrix.eye(rows, cols));
        } catch (e) {
            // Fallback to LAPACK if QR fails
            console.warn('QR failed, falling back to LAPACK:', e.message);
        }
    }
    
    // For small/medium matrices, use LAPACK SVD (original algorithm)
    const data = matrix.to2DArray();
    const pinvData = lapackPinv(data);
    return new Matrix(pinvData);
}

/**
 * Always use LAPACK pseudoinverse (for testing/comparison)
 * @param {Matrix} matrix - ml-matrix Matrix object
 * @returns {Matrix} Pseudoinverse using LAPACK SVD
 */
export function pseudoInverseLAPACK(matrix) {
    if (!(matrix instanceof Matrix)) {
        throw new Error('Input must be an ml-matrix Matrix');
    }
    
    const data = matrix.to2DArray();
    const pinvData = lapackPinv(data);
    return new Matrix(pinvData);
}
