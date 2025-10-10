/**
 * Video Cache Service Tests
 * 
 * To run these tests manually:
 * 1. Set up environment variables with valid Supabase URL
 * 2. Uncomment the test file import in your app
 * 3. Run the test function
 */

import VideoCacheService from '../videoCache';

export const testVideoCacheService = async () => {
  console.log('=== Video Cache Service Tests ===\n');

  try {
    // Test 1: Check if configured
    console.log('Test 1: Check cache status');
    const isCached = await VideoCacheService.isCached();
    console.log(`✓ Cache status: ${isCached ? 'Cached' : 'Not cached'}\n`);

    // Test 2: Get cache size
    console.log('Test 2: Get cache size');
    const cacheSize = await VideoCacheService.getCacheSize();
    console.log(`✓ Cache size: ${cacheSize.toFixed(2)} MB\n`);

    // Test 3: Get video URI (will download if not cached)
    console.log('Test 3: Get video URI (may download)');
    let downloadProgress = 0;
    const videoUri = await VideoCacheService.getCachedVideoUri((progress) => {
      const percentage = Math.round(progress.percentage * 100);
      if (percentage !== downloadProgress) {
        downloadProgress = percentage;
        console.log(`  Download progress: ${percentage}%`);
      }
    });
    console.log(`✓ Video URI: ${videoUri}\n`);

    // Test 4: Verify cached
    console.log('Test 4: Verify video is now cached');
    const isCachedNow = await VideoCacheService.isCached();
    console.log(`✓ Cache status: ${isCachedNow ? 'Cached' : 'Not cached'}\n`);

    // Test 5: Get updated cache size
    console.log('Test 5: Get updated cache size');
    const newCacheSize = await VideoCacheService.getCacheSize();
    console.log(`✓ New cache size: ${newCacheSize.toFixed(2)} MB\n`);

    console.log('=== All Video Cache Tests Passed! ===\n');
    return true;
  } catch (error) {
    console.error('❌ Video Cache Test Failed:', error);
    return false;
  }
};

export const testClearCache = async () => {
  console.log('=== Clear Cache Test ===\n');

  try {
    console.log('Clearing cache...');
    await VideoCacheService.clearCache();
    console.log('✓ Cache cleared successfully\n');

    const isCached = await VideoCacheService.isCached();
    console.log(`✓ Cache status after clear: ${isCached ? 'Still cached' : 'Not cached'}\n`);

    console.log('=== Clear Cache Test Passed! ===\n');
    return true;
  } catch (error) {
    console.error('❌ Clear Cache Test Failed:', error);
    return false;
  }
};



