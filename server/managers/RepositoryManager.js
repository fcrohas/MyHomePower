import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class RepositoryManager {
  constructor() {
    this.repositoriesFile = path.join(__dirname, '../library/repositories.json');
    this.cacheDir = path.join(__dirname, '../library/cache');
    this.repositories = [];
    this.autoRefreshInterval = 24 * 60 * 60 * 1000; // 24 hours default
    this.refreshTimer = null;
    
    this.init();
  }

  init() {
    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Load or create repositories configuration
    if (fs.existsSync(this.repositoriesFile)) {
      try {
        const data = fs.readFileSync(this.repositoriesFile, 'utf8');
        const config = JSON.parse(data);
        this.repositories = config.repositories || [];
        this.autoRefreshInterval = config.autoRefreshInterval || this.autoRefreshInterval;
      } catch (error) {
        console.error('Error loading repositories configuration:', error);
        this.createDefaultConfig();
      }
    } else {
      this.createDefaultConfig();
    }

    // Start auto-refresh timer
    this.startAutoRefresh();
  }

  createDefaultConfig() {
    this.repositories = [
      {
        id: 'official',
        name: 'Official MyHomePower Models',
        url: 'https://raw.githubusercontent.com/fcrohas/MyHomePower-Models/main',
        enabled: true,
        lastSync: null,
        type: 'official'
      }
    ];
    this.saveConfig();
  }

  saveConfig() {
    const config = {
      repositories: this.repositories,
      autoRefreshInterval: this.autoRefreshInterval,
      lastUpdate: new Date().toISOString()
    };
    fs.writeFileSync(this.repositoriesFile, JSON.stringify(config, null, 2));
  }

  startAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
    }

    if (this.autoRefreshInterval > 0) {
      // Refresh on startup (silently handle errors)
      this.refreshAllRepositories().catch(err => {
        console.log('📚 Repository sync will retry later. You can use local library features now.');
      });

      // Set up periodic refresh
      this.refreshTimer = setInterval(() => {
        this.refreshAllRepositories().catch(() => {
          // Silent retry on periodic refresh
        });
      }, this.autoRefreshInterval);
    }
  }

  stopAutoRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  setAutoRefreshInterval(milliseconds) {
    this.autoRefreshInterval = milliseconds;
    this.saveConfig();
    this.startAutoRefresh();
  }

  async fetchUrl(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      
      const request = protocol.get(url, { timeout: 10000 }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          return this.fetchUrl(redirectUrl).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => resolve(data));
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  async downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(outputPath);

      const request = protocol.get(url, { timeout: 30000 }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          file.close();
          fs.unlinkSync(outputPath);
          const redirectUrl = response.headers.location;
          return this.downloadFile(redirectUrl, outputPath).then(resolve).catch(reject);
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(outputPath);
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve(outputPath);
        });
      });

      request.on('error', (err) => {
        file.close();
        fs.unlinkSync(outputPath);
        reject(err);
      });

      request.on('timeout', () => {
        request.destroy();
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error('Download timeout'));
      });

      file.on('error', (err) => {
        file.close();
        fs.unlinkSync(outputPath);
        reject(err);
      });
    });
  }

  async validateRepository(url) {
    try {
      const indexUrl = `${url}/index.json`;
      const data = await this.fetchUrl(indexUrl);
      const index = JSON.parse(data);

      // Validate structure
      if (!index.models || !Array.isArray(index.models)) {
        throw new Error('Invalid repository structure: missing models array');
      }

      return { valid: true, index };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  async refreshRepository(repoId) {
    const repo = this.repositories.find(r => r.id === repoId);
    if (!repo || !repo.enabled) {
      throw new Error('Repository not found or disabled');
    }

    const indexUrl = `${repo.url}/index.json`;
    const cacheFile = path.join(this.cacheDir, `${repo.id}-index.json`);

    try {
      const data = await this.fetchUrl(indexUrl);
      const index = JSON.parse(data);

      // Validate structure
      if (!index.models || !Array.isArray(index.models)) {
        throw new Error('Invalid repository structure');
      }

      // Save to cache
      fs.writeFileSync(cacheFile, data);

      // Update last sync time
      repo.lastSync = new Date().toISOString();
      this.saveConfig();

      return { success: true, index, modelCount: index.models.length };
    } catch (error) {
      console.warn(`⚠️  Unable to refresh repository '${repo.name}': ${error.message}`);
      if (repo.type === 'official') {
        console.log(`💡 Tip: The official repository may not be set up yet. The app will work with local models only.`);
      }
      return { success: false, error: error.message };
    }
  }

  async refreshAllRepositories() {
    const results = [];
    for (const repo of this.repositories) {
      if (repo.enabled) {
        const result = await this.refreshRepository(repo.id);
        results.push({ repoId: repo.id, name: repo.name, ...result });
      }
    }
    return results;
  }

  getRepositories() {
    return this.repositories;
  }

  getRepository(id) {
    return this.repositories.find(r => r.id === id);
  }

  addRepository(name, url, type = 'custom') {
    const id = `custom-${Date.now()}`;
    const repo = {
      id,
      name,
      url: url.replace(/\/$/, ''), // Remove trailing slash
      enabled: true,
      lastSync: null,
      type
    };

    this.repositories.push(repo);
    this.saveConfig();
    return repo;
  }

  removeRepository(id) {
    const repo = this.repositories.find(r => r.id === id);
    if (!repo) {
      throw new Error('Repository not found');
    }

    if (repo.type === 'official') {
      throw new Error('Cannot remove official repository');
    }

    // Remove from list
    this.repositories = this.repositories.filter(r => r.id !== id);

    // Remove cached index
    const cacheFile = path.join(this.cacheDir, `${id}-index.json`);
    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
    }

    this.saveConfig();
    return true;
  }

  updateRepository(id, updates) {
    const repo = this.repositories.find(r => r.id === id);
    if (!repo) {
      throw new Error('Repository not found');
    }

    Object.assign(repo, updates);
    this.saveConfig();
    return repo;
  }

  async getOnlineModels(repoId = null) {
    const models = [];
    const repositories = repoId 
      ? [this.repositories.find(r => r.id === repoId)]
      : this.repositories.filter(r => r.enabled);

    for (const repo of repositories) {
      if (!repo) continue;

      const cacheFile = path.join(this.cacheDir, `${repo.id}-index.json`);
      
      if (fs.existsSync(cacheFile)) {
        try {
          const data = fs.readFileSync(cacheFile, 'utf8');
          const index = JSON.parse(data);
          
          if (index.models && Array.isArray(index.models)) {
            // Add repository info to each model
            index.models.forEach(model => {
              models.push({
                ...model,
                repositoryId: repo.id,
                repositoryName: repo.name,
                repositoryUrl: repo.url
              });
            });
          }
        } catch (error) {
          console.error(`Error reading cache for ${repo.name}:`, error);
        }
      }
    }

    return models;
  }

  async getOnlineModel(repoId, modelId) {
    const models = await this.getOnlineModels(repoId);
    return models.find(m => m.id === modelId);
  }

  async downloadModel(repoId, modelId, localLibraryPath) {
    const repo = this.repositories.find(r => r.id === repoId);
    if (!repo) {
      throw new Error('Repository not found');
    }

    const model = await this.getOnlineModel(repoId, modelId);
    if (!model) {
      throw new Error('Model not found in repository');
    }

    // Create temp directory for download
    const tempDir = path.join(this.cacheDir, `download-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      // Download model file
      const modelUrl = `${repo.url}/${model.files.model}`;
      const tempModelFile = path.join(tempDir, 'model.zip');
      
      await this.downloadFile(modelUrl, tempModelFile);

      // Download metadata if separate
      let metadata = model;
      if (model.files.metadata) {
        const metadataUrl = `${repo.url}/${model.files.metadata}`;
        const metadataData = await this.fetchUrl(metadataUrl);
        metadata = { ...model, ...JSON.parse(metadataData) };
      }

      // Return downloaded files and metadata
      return {
        modelFile: tempModelFile,
        metadata,
        tempDir
      };
    } catch (error) {
      // Clean up temp directory on error
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      throw error;
    }
  }

  cleanupTempDir(tempDir) {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

export default RepositoryManager;
