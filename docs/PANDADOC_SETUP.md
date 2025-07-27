# PandaDoc OAuth Setup with ngrok

Since PandaDoc doesn't allow localhost URLs for OAuth redirects, we need to use a tunneling service like ngrok for local development.

## Prerequisites

1. Install ngrok:
   ```bash
   # macOS with Homebrew
   brew install ngrok/ngrok/ngrok
   
   # Or download from https://ngrok.com/download
   ```

2. Sign up for a free ngrok account at https://ngrok.com and get your auth token

3. Configure ngrok with your auth token:
   ```bash
   ngrok config add-authtoken YOUR_AUTH_TOKEN
   ```

## Setup Steps

### 1. Start the ngrok tunnel

```bash
# In one terminal window
./start-ngrok.sh
```

This will display a URL like: `https://xxxx-xx-xx-xx-xx.ngrok-free.app`

### 2. Update your .env.local

Replace the localhost URLs with your ngrok URL:

```env
AUTH_ISSUER=https://xxxx-xx-xx-xx-xx.ngrok-free.app
NEXT_PUBLIC_AUTH_URL=https://xxxx-xx-xx-xx-xx.ngrok-free.app
```

### 3. Configure PandaDoc OAuth App

1. Go to https://developers.pandadoc.com/
2. Create or update your OAuth app
3. Set the redirect URI to:
   ```
   https://xxxx-xx-xx-xx-xx.ngrok-free.app/api/auth/callback/pandadoc
   ```
4. Copy your Client ID and Client Secret to `.env.local`:
   ```env
   PANDADOC_CLIENT_ID=your-client-id
   PANDADOC_CLIENT_SECRET=your-client-secret
   ```

### 4. Start the development server

```bash
# In another terminal window
npm run dev
```

### 5. Access your app

Open your browser to your ngrok URL (not localhost):
```
https://xxxx-xx-xx-xx-xx.ngrok-free.app
```

## Important Notes

- The ngrok URL changes each time you restart ngrok (unless you have a paid plan)
- You'll need to update the redirect URI in PandaDoc each time the URL changes
- For production, use your actual domain instead of ngrok
- ngrok free tier has request limits, but should be sufficient for development

## Alternative Solutions

### 1. Use a subdomain with a reverse proxy
If you have a domain, you can set up a subdomain that proxies to your local development:
- Set up nginx/caddy on a VPS to proxy `dev.yourdomain.com` to your local machine via SSH tunnel
- This gives you a stable URL for development

### 2. Deploy to a staging environment
- Deploy to Vercel preview deployments
- Use the preview URL for OAuth testing
- This is more stable but requires pushing code for each test

### 3. Use localtunnel or other alternatives
- `npx localtunnel --port 3000`
- Similar to ngrok but different features/limitations

## Troubleshooting

1. **"Tunnel not found" error**: Make sure ngrok is running and the URL in .env.local matches exactly
2. **OAuth redirect mismatch**: Double-check the redirect URI in PandaDoc matches your ngrok URL
3. **HTTPS errors**: ngrok provides HTTPS by default, make sure you're using https:// not http://