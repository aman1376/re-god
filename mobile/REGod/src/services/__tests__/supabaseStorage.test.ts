/**
 * Supabase Storage Service Tests
 * 
 * To run these tests manually:
 * 1. Set up environment variables with valid Supabase credentials
 * 2. Create a test image in your app
 * 3. Run the test function
 */

import SupabaseStorageService from '../supabaseStorage';

export const testSupabaseConfiguration = () => {
  console.log('=== Supabase Configuration Test ===\n');

  const isConfigured = SupabaseStorageService.isConfigured();
  console.log(`Supabase configured: ${isConfigured ? '✓ Yes' : '❌ No'}\n`);

  if (!isConfigured) {
    console.log('Please set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file\n');
    return false;
  }

  console.log('=== Configuration Test Passed! ===\n');
  return true;
};

export const testImageValidation = () => {
  console.log('=== Image Validation Tests ===\n');

  const tests = [
    { uri: 'test.jpg', expected: true, name: 'JPG' },
    { uri: 'test.jpeg', expected: true, name: 'JPEG' },
    { uri: 'test.png', expected: true, name: 'PNG' },
    { uri: 'test.gif', expected: true, name: 'GIF' },
    { uri: 'test.webp', expected: true, name: 'WEBP' },
    { uri: 'test.bmp', expected: false, name: 'BMP (invalid)' },
    { uri: 'test.txt', expected: false, name: 'TXT (invalid)' },
  ];

  let allPassed = true;

  tests.forEach(test => {
    const result = SupabaseStorageService.validateImage(test.uri);
    const passed = result.valid === test.expected;
    
    if (passed) {
      console.log(`✓ ${test.name}: ${result.valid ? 'Valid' : 'Invalid'}`);
    } else {
      console.log(`❌ ${test.name}: Expected ${test.expected}, got ${result.valid}`);
      allPassed = false;
    }
  });

  console.log();
  if (allPassed) {
    console.log('=== All Validation Tests Passed! ===\n');
  } else {
    console.log('=== Some Validation Tests Failed! ===\n');
  }

  return allPassed;
};

export const testPublicUrlGeneration = () => {
  console.log('=== Public URL Generation Test ===\n');

  // Mock Supabase URL for testing
  const testCases = [
    {
      bucket: 'avatars' as const,
      filePath: 'user123_1234567890.jpg',
      description: 'Avatar URL'
    },
    {
      bucket: 'courses' as const,
      filePath: 'course_1/course_cover.jpg',
      description: 'Course cover URL'
    },
    {
      bucket: 'courses' as const,
      filePath: 'course_1/chapters/chapter_1/chapter_banner.png',
      description: 'Chapter banner URL'
    },
    {
      bucket: 'videos' as const,
      filePath: 'auth-video.mp4',
      description: 'Video URL'
    },
  ];

  testCases.forEach(test => {
    const url = SupabaseStorageService.getPublicUrl(test.bucket, test.filePath);
    console.log(`✓ ${test.description}:`);
    console.log(`  ${url}\n`);
  });

  console.log('=== URL Generation Test Passed! ===\n');
  return true;
};

// Run all tests
export const runAllSupabaseTests = () => {
  console.log('\n🚀 Starting Supabase Storage Tests...\n');

  const configTest = testSupabaseConfiguration();
  const validationTest = testImageValidation();
  const urlTest = testPublicUrlGeneration();

  console.log('\n📊 Test Summary:');
  console.log(`Configuration: ${configTest ? '✓' : '❌'}`);
  console.log(`Validation: ${validationTest ? '✓' : '❌'}`);
  console.log(`URL Generation: ${urlTest ? '✓' : '❌'}`);

  const allPassed = configTest && validationTest && urlTest;
  console.log(`\n${allPassed ? '✅ All tests passed!' : '❌ Some tests failed'}\n`);

  return allPassed;
};



