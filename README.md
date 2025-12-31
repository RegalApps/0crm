# Vapi Cron Calls

Automated daily check-in calls via Vapi, triggered by Vercel Cron jobs.

## Schedule

| Slot    | Eastern Time | UTC (Winter EST) | UTC (Summer EDT) | Purpose                                                |
| ------- | ------------ | ---------------- | ---------------- | ------------------------------------------------------ |
| morning | 6:00 AM      | 11:00            | 10:00            | Quick, concise 3 goals check-in                        |
| noon    | 12:00 PM     | 17:00            | 16:00            | Update on how we're doing on those 3 goals             |
| evening | 8:00 PM      | 01:00 (+1 day)   | 00:00            | Weekly tracking: ICP calls, investor intros, feature dev |

> **Note**: Vercel cron runs in UTC. The current schedule uses EST (UTC-5). During daylight saving time (EDT), calls will arrive 1 hour earlier. Manually update `vercel.json` if needed.

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment variables**
   
   Create a `.env.local` file:
   ```
   VAPI_API_KEY=your_vapi_private_api_key
   PHONE_NUMBER=+15551234567
   ```
   
   - `VAPI_API_KEY`: Your Vapi private API key (from dashboard)
   - `PHONE_NUMBER`: Phone number to call in E.164 format

3. **Run locally**
   ```bash
   npm run dev
   ```

4. **Test API endpoint**
   ```bash
   # Morning check-in
   curl "http://localhost:3000/api/vapi-call?slot=morning"
   
   # Noon check-in
   curl "http://localhost:3000/api/vapi-call?slot=noon"
   
   # Evening check-in
   curl "http://localhost:3000/api/vapi-call?slot=evening"
   ```

## Deploy to Vercel

1. Push to GitHub/GitLab/Bitbucket
2. Import project in Vercel dashboard
3. Add environment variables:
   - `VAPI_API_KEY`
   - `PHONE_NUMBER`
4. Deploy

Cron jobs will automatically activate based on `vercel.json` configuration.

## API Reference

### GET `/api/vapi-call`

Query parameters:
- `slot` (required): `morning` | `noon` | `evening`

Response:
```json
{
  "success": true,
  "slot": "morning",
  "callId": "call_abc123",
  "message": "Call initiated for morning check-in"
}
```

## Configuration

- **Vapi Public Key**: `0ec6a5ad-e004-4ca1-a0cf-cb586cb54efd`
- **Voice ID (11labs)**: `AMagyyApPEVuxcHAR8xR`


