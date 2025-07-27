#!/bin/bash

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "ngrok is not installed. Please install it first:"
    echo ""
    echo "Using Homebrew (macOS):"
    echo "  brew install ngrok/ngrok/ngrok"
    echo ""
    echo "Or download from: https://ngrok.com/download"
    echo ""
    echo "After installing, you'll need to authenticate:"
    echo "  ngrok config add-authtoken YOUR_AUTH_TOKEN"
    echo ""
    exit 1
fi

# Start ngrok tunnel on port 3000
echo "Starting ngrok tunnel on port 3000..."
echo ""
echo "IMPORTANT: After ngrok starts:"
echo "1. Copy the HTTPS URL (e.g., https://xxxx-xx-xx-xx-xx.ngrok-free.app)"
echo "2. Update your .env.local file:"
echo "   AUTH_ISSUER=https://xxxx-xx-xx-xx-xx.ngrok-free.app"
echo "   NEXT_PUBLIC_AUTH_URL=https://xxxx-xx-xx-xx-xx.ngrok-free.app"
echo "3. Update your PandaDoc OAuth app redirect URI to:"
echo "   https://xxxx-xx-xx-xx-xx.ngrok-free.app/api/auth/callback/pandadoc"
echo ""
echo "Press Ctrl+C to stop the tunnel"
echo ""

# Start ngrok
ngrok http 3000