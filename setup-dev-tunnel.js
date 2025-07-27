#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const envPath = path.join(__dirname, '.env.local');

console.log('🚀 Starting development tunnel setup...\n');

// Check if ngrok is installed
const checkNgrok = spawn('which', ['ngrok']);
checkNgrok.on('close', (code) => {
  if (code !== 0) {
    console.error('❌ ngrok is not installed. Please install it first:');
    console.error('\nUsing Homebrew (macOS):');
    console.error('  brew install ngrok/ngrok/ngrok\n');
    console.error('Or download from: https://ngrok.com/download\n');
    process.exit(1);
  }
  
  startNgrok();
});

function startNgrok() {
  console.log('📡 Starting ngrok tunnel on port 3000...\n');
  
  const ngrok = spawn('ngrok', ['http', '3000', '--log=stdout']);
  
  let ngrokUrl = null;
  
  ngrok.stdout.on('data', (data) => {
    const output = data.toString();
    
    // Look for the public URL in ngrok output
    const urlMatch = output.match(/url=https:\/\/[a-zA-Z0-9-]+\.ngrok[a-zA-Z0-9-]*\.app/);
    if (urlMatch && !ngrokUrl) {
      ngrokUrl = urlMatch[0].replace('url=', '');
      console.log(`✅ Ngrok tunnel started: ${ngrokUrl}\n`);
      
      updateEnvFile(ngrokUrl);
      showInstructions(ngrokUrl);
    }
  });
  
  ngrok.stderr.on('data', (data) => {
    console.error(`ngrok error: ${data}`);
  });
  
  ngrok.on('close', (code) => {
    console.log(`\n👋 Ngrok tunnel closed`);
    process.exit(code);
  });
  
  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down tunnel...');
    ngrok.kill();
    process.exit(0);
  });
}

function updateEnvFile(ngrokUrl) {
  try {
    let envContent = '';
    
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
      
      // Update AUTH_ISSUER
      if (envContent.includes('AUTH_ISSUER=')) {
        envContent = envContent.replace(/AUTH_ISSUER=.*/g, `AUTH_ISSUER=${ngrokUrl}`);
      } else {
        envContent += `\nAUTH_ISSUER=${ngrokUrl}`;
      }
      
      // Update NEXT_PUBLIC_AUTH_URL
      if (envContent.includes('NEXT_PUBLIC_AUTH_URL=')) {
        envContent = envContent.replace(/NEXT_PUBLIC_AUTH_URL=.*/g, `NEXT_PUBLIC_AUTH_URL=${ngrokUrl}`);
      } else {
        envContent += `\nNEXT_PUBLIC_AUTH_URL=${ngrokUrl}`;
      }
    } else {
      console.warn('⚠️  .env.local file not found. Please create it from .env.example first.');
      return;
    }
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Updated .env.local with ngrok URL\n');
  } catch (error) {
    console.error('❌ Error updating .env.local:', error.message);
  }
}

function showInstructions(ngrokUrl) {
  console.log('📋 Next steps:\n');
  console.log('1. Update your PandaDoc OAuth app redirect URI to:');
  console.log(`   ${ngrokUrl}/api/auth/callback/pandadoc\n`);
  console.log('2. In a new terminal, start the dev server:');
  console.log('   npm run dev\n');
  console.log('3. Access your app at:');
  console.log(`   ${ngrokUrl}\n`);
  console.log('📌 Keep this terminal open to maintain the tunnel');
  console.log('Press Ctrl+C to stop the tunnel\n');
}