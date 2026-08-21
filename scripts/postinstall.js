const { execSync } = require('child_process');
if (process.platform !== 'win32') {
  try {
    console.log('Installing Linux sharp binary for cross-platform deployment...');
    execSync('npm install --os=linux --cpu=x64 --libc=glibc sharp', { stdio: 'inherit' });
  } catch (e) {
    console.error('Failed to install Linux sharp binary:', e.message);
  }
} else {
  console.log('Skipping Linux sharp binary installation on Windows local environment.');
}
