// API Configuration
// Uses relative path in production, allows override via environment variable
export const API_BASE_URL = import.meta.env.VITE_API_URL || ''

// Helper function to build API URLs
export const getApiUrl = (path) => {
  // Remove leading slash from path if present to avoid double slashes
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${cleanPath}`
}
