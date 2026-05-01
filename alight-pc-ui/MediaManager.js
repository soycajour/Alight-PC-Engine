// ============================================================
// MediaManager - Handles loading images and videos for shapes
// ============================================================

export class MediaManager {
  constructor() {
    this.mediaCache = new Map(); // uri -> HTMLImageElement / HTMLVideoElement
  }

  // Resolves the android content:// or relative path to a usable local path
  resolveURI(uri) {
    if (!uri) return null;
    
    // In a real Electron app with an .alightpackage, we'd map this URI
    // to the unzipped media folder. 
    // For now, if it's an absolute HTTP url, keep it. 
    // If it's a content URI, we might need to intercept it or ask the user to locate it.
    // We'll leave it as is, but in a real scenario we'd use a custom protocol or local path.
    return uri;
  }

  // Preloads all media found in the scene graph
  preloadMedia(sceneData) {
    const promises = [];
    
    if (sceneData.media) {
      sceneData.media.forEach(m => {
         promises.push(this.loadMedia(m.uri, m.type));
      });
    }

    return Promise.allSettled(promises);
  }

  // Load a single media element
  loadMedia(uri, type) {
    return new Promise((resolve, reject) => {
      const resolvedUri = this.resolveURI(uri);
      if (!resolvedUri) {
         resolve(null);
         return;
      }

      if (this.mediaCache.has(resolvedUri)) {
        resolve(this.mediaCache.get(resolvedUri));
        return;
      }

      if (type && type.startsWith('video/')) {
        const video = document.createElement('video');
        video.src = resolvedUri;
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.onloadeddata = () => {
          this.mediaCache.set(resolvedUri, video);
          resolve(video);
        };
        video.onerror = () => {
          console.warn(`Failed to load video: ${resolvedUri}`);
          resolve(null); // Resolve to null so Promise.allSettled continues
        };
        video.load();
      } else {
        const img = new Image();
        img.src = resolvedUri;
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          this.mediaCache.set(resolvedUri, img);
          resolve(img);
        };
        img.onerror = () => {
          console.warn(`Failed to load image: ${resolvedUri}`);
          resolve(null);
        };
      }
    });
  }

  // Retrieve an already loaded media element synchronously for render loop
  getMedia(uri) {
    const resolvedUri = this.resolveURI(uri);
    return this.mediaCache.get(resolvedUri) || null;
  }

  // Should be called in the render loop to update video frames
  updateVideoFrames(currentTime) {
    // For videos, we might need to set currentTime or just let them play if they are looping.
    // In a precise editor, we should seek the video `video.currentTime = ...` 
    // but seeking is slow in HTML5 video, so we will handle it basically for now.
  }
}
