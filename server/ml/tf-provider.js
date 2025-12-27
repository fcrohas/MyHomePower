let tfInstance;

try {
  // Try to load GPU version first
  const tfGpu = await import('@tensorflow/tfjs-node-gpu');
  tfInstance = tfGpu.default || tfGpu;
  console.log('🚀 Using TensorFlow.js with GPU support');
} catch (e) {
  try {
    // Fallback to CPU version
    const tfCpu = await import('@tensorflow/tfjs-node');
    tfInstance = tfCpu.default || tfCpu;
    console.log('💻 Using TensorFlow.js with CPU support');
  } catch (e2) {
    console.error('❌ Failed to load TensorFlow.js:', e2);
    throw e2;
  }
}

export const tf = tfInstance;
export default tfInstance;
