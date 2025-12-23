# Docker Deployment Guide

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Build and start the container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the container
docker-compose down
```

The application will be available at `http://localhost:3001`

### Using Docker directly

```bash
# Build the image
docker build -t ai-power-viewer .

# Run the container
docker run -d \
  -p 3001:3001 \
  -v $(pwd)/models:/app/models \
  -v $(pwd)/data:/app/data \
  --name ai-power-viewer \
  ai-power-viewer

# View logs
docker logs -f ai-power-viewer

# Stop the container
docker stop ai-power-viewer
docker rm ai-power-viewer
```

## Configuration

### Environment Variables

You can customize the deployment using environment variables:

- `PORT`: Server port (default: 3001)
- `NODE_ENV`: Environment mode (default: production)
- `VITE_API_URL`: API base URL (leave empty for relative URLs - recommended)

**Note**: The frontend now uses relative URLs by default, so it will work regardless of where you host the application. You only need to set `VITE_API_URL` if your API is hosted on a completely different domain.

Example with custom port:

```bash
docker run -d \
  -p 8080:8080 \
  -e PORT=8080 \
  -v $(pwd)/models:/app/models \
  --name ai-power-viewer \
  ai-power-viewer
```

### Volumes

The following volumes are recommended:

- `./models:/app/models` - Persist trained ML models
- `./data:/app/data` - Persist power data (optional)

## GPU Support (Optional)

If you want to use GPU acceleration for TensorFlow:

1. Install [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)

2. Modify the Dockerfile to use the GPU-enabled base image

3. Run with GPU support:

```bash
docker run -d \
  --gpus all \
  -p 3001:3001 \
  -v $(pwd)/models:/app/models \
  --name ai-power-viewer \
  ai-power-viewer
```

## Troubleshooting

### Check container health

```bash
docker ps
```

Look for the `STATUS` column - it should show `healthy` after ~40 seconds.

### View logs

```bash
docker logs ai-power-viewer
```

### Access container shell

```bash
docker exec -it ai-power-viewer sh
```

### Rebuild after changes

```bash
# With docker-compose
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# With docker
docker stop ai-power-viewer
docker rm ai-power-viewer
docker build --no-cache -t ai-power-viewer .
docker run -d -p 3001:3001 --name ai-power-viewer ai-power-viewer
```

## Production Considerations

1. **Reverse Proxy**: Use nginx or Traefik in front of the container
2. **SSL/TLS**: Add HTTPS certificates via reverse proxy
3. **Model Persistence**: Always mount the `/app/models` volume
4. **Backup**: Regularly backup the models directory
5. **Updates**: Pull latest image and restart container
6. **Monitoring**: Monitor container health and logs
