/**
 * Compresses an image file to be under the specified size limit (default 500KB)
 * Uses canvas-based compression with quality reduction and resizing
 * 
 * @param file The image file to compress
 * @param maxSizeBytes Maximum size in bytes (default: 500 * 1024 = 500KB)
 * @returns A Promise that resolves to a compressed File object, or the original file if compression fails
 */
export async function compressImage(
  file: File,
  maxSizeBytes: number = 500 * 1024
): Promise<File> {
  console.log(`[Compress] Starting compression for: ${file.name}, size: ${(file.size / 1024 / 1024).toFixed(2)}MB, target: ${(maxSizeBytes / 1024).toFixed(2)}KB`);
  
  // If file is already under the limit, return as-is
  if (file.size <= maxSizeBytes) {
    console.log(`[Compress] File already under limit, returning as-is`);
    return file;
  }

  // Check if file is an image type that can be compressed
  // Canvas API can handle most image types, but some may not work
  if (!file.type || !file.type.startsWith('image/')) {
    // Not an image type we can compress, return original
    console.warn('[Compress] File type not compressible, returning original:', file.type);
    return file;
  }

  // Add timeout to prevent hanging
  const timeoutPromise = new Promise<File>((_, reject) => {
    setTimeout(() => {
      console.warn('[Compress] Compression timeout after 30 seconds, using original file');
      reject(new Error('Compression timeout'));
    }, 30000); // 30 second timeout
  });

  const compressionPromise = new Promise<File>((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      console.log('[Compress] FileReader loaded, creating image');
      const img = new Image();
      
      img.onload = () => {
        console.log(`[Compress] Image loaded, dimensions: ${img.width}x${img.height}`);
        // Start with original dimensions
        let width = img.width;
        let height = img.height;
        let quality = 0.9;
        
        // Calculate initial dimensions (max 2000px on longest side to start)
        const maxDimension = 2000;
        if (width > height && width > maxDimension) {
          height = (height / width) * maxDimension;
          width = maxDimension;
        } else if (height > maxDimension) {
          width = (width / height) * maxDimension;
          height = maxDimension;
        }
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          // If canvas context fails, return original file as fallback
          console.warn('Could not get canvas context, using original file');
          resolve(file);
          return;
        }
        
        // Try different quality levels and dimensions until we're under the limit
        let attempts = 0;
        const maxAttempts = 50; // Prevent infinite loops
        
        const tryCompress = (currentQuality: number, currentWidth: number, currentHeight: number) => {
          attempts++;
          if (attempts > maxAttempts) {
            // Fallback: return the original file if we can't compress it
            console.warn('Image compression exceeded max attempts, using original file');
            resolve(file);
            return;
          }
          
          canvas.width = currentWidth;
          canvas.height = currentHeight;
          
          // Clear and draw
          ctx.clearRect(0, 0, currentWidth, currentHeight);
          ctx.drawImage(img, 0, 0, currentWidth, currentHeight);
          
          // Convert to blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                // If blob creation fails, return original file as fallback
                console.warn('Failed to create blob during compression, using original file');
                resolve(file);
                return;
              }
              
              // If we're under the limit, we're done
              if (blob.size <= maxSizeBytes) {
                console.log(`[Compress] Success! Compressed to ${(blob.size / 1024).toFixed(2)}KB (attempt ${attempts})`);
                const compressedFile = new File(
                  [blob],
                  file.name,
                  {
                    type: file.type || 'image/jpeg',
                    lastModified: Date.now(),
                  }
                );
                resolve(compressedFile);
                return;
              }
              
              console.log(`[Compress] Attempt ${attempts}: ${(blob.size / 1024).toFixed(2)}KB (target: ${(maxSizeBytes / 1024).toFixed(2)}KB), quality: ${currentQuality.toFixed(2)}, size: ${currentWidth}x${currentHeight}`);
              
              // If still too large, try reducing quality or dimensions
              if (currentQuality > 0.1) {
                // Reduce quality by 0.1
                tryCompress(Math.max(0.1, currentQuality - 0.1), currentWidth, currentHeight);
              } else if (currentWidth > 200 || currentHeight > 200) {
                // If quality is already low, reduce dimensions by 20%
                const newWidth = Math.max(200, Math.floor(currentWidth * 0.8));
                const newHeight = Math.max(200, Math.floor(currentHeight * 0.8));
                // Continue with low quality (0.2) when reducing dimensions
                tryCompress(0.2, newWidth, newHeight);
              } else {
                // Can't compress further, return what we have (best effort)
                const compressedFile = new File(
                  [blob],
                  file.name,
                  {
                    type: file.type || 'image/jpeg',
                    lastModified: Date.now(),
                  }
                );
                resolve(compressedFile);
              }
            },
            file.type || 'image/jpeg',
            currentQuality
          );
        };
        
        // Start compression
        tryCompress(quality, width, height);
      };
      
      img.onerror = () => {
        // If image fails to load, return original file as fallback
        console.warn('Failed to load image for compression, using original file');
        resolve(file);
      };
      
      if (e.target?.result) {
        img.src = e.target.result as string;
      } else {
        // If no result, return original file as fallback
        console.warn('FileReader returned no result, using original file');
        resolve(file);
      }
    };
    
    reader.onerror = () => {
      // If reading fails, return original file as fallback
      console.warn('Failed to read file for compression, using original file');
      resolve(file);
    };
    
    try {
      reader.readAsDataURL(file);
    } catch (error) {
      // If reading throws, return original file as fallback
      console.warn('[Compress] Error reading file for compression, using original file:', error);
      resolve(file);
    }
  });
  
  // Race between compression and timeout
  return Promise.race([compressionPromise, timeoutPromise]).catch((error) => {
    // If compression fails for any reason, return original file as fallback
    console.warn('[Compress] Image compression failed, using original file:', error);
    return file;
  });
}
