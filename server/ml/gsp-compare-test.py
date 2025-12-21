#!/usr/bin/env python3
"""
Test to verify Python GSP computation for comparison with JavaScript
"""

import numpy as np
import math

# Same test data as JavaScript
sigma = 20
r = [100, 105, 103, 107, 102, 108, 104, 106, 101, 109, 110]
templen = len(r)

print('Test data:', r)
print('templen:', templen)

# Build adjacency matrix Am (Gaussian kernel)
Am = np.zeros((templen, templen))
for i in range(templen):
    for j in range(templen):
        Am[i, j] = math.exp(-((r[i] - r[j]) / sigma) ** 2)

print('\nAm[0,0]:', Am[0, 0])
print('Am[0,1]:', Am[0, 1])

# Build degree matrix Dm
Dm = np.zeros((templen, templen))
for i in range(templen):
    Dm[i, i] = np.sum(Am[:, i])

print('\nDm[0,0]:', Dm[0, 0])
print('Dm[1,1]:', Dm[1, 1])

# Compute Laplacian Lm = Dm - Am
Lm = Dm - Am

print('\nLm[0,0]:', Lm[0, 0])
print('Lm[0,1]:', Lm[0, 1])
print('Lm[1,1]:', Lm[1, 1])

# Extract submatrix Lm[1:, 1:]
Lm_sub = Lm[1:templen, 1:templen]
print('\nLm_sub shape:', Lm_sub.shape)
print('Expected:', (templen - 1, templen - 1))

# Extract Lm[0, 1:]
Lm_0_row = Lm[0, 1:templen]
print('\nLm[0, 1:] shape:', Lm_0_row.shape)
print('Lm[0, 1:] first 3 values:', Lm_0_row[:3])

# Compute b = -Sm[0] * Lm[0, 1:]
Sm = np.zeros((templen, 1))
Sm[0] = 1
b = ((-Sm[0].T) * Lm_0_row).reshape(-1, 1)
print('\nb shape:', b.shape)
print('b first 3 values:', b[:3].flatten())

# Compute pseudoinverse
print('\n--- Computing pinv ---')
Lm_inv = np.linalg.pinv(Lm_sub)
print('pinv shape:', Lm_inv.shape)
print('pinv[0,0]:', Lm_inv[0, 0])

result = np.matmul(Lm_inv, b)
print('result shape:', result.shape)
print('result first 3:', result[:3].flatten())

print('\n✅ Python computation complete')
