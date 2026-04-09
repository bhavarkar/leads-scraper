# Leads Scraper – Apollo.io + Hunter.io

This Apify Actor allows you to scrape leads from Apollo.io using their internal search API and enrich the results with professional emails via Hunter.io.

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Apify CLI](https://docs.apify.com/cli) (optional, for local development)

### Installation
1. Clone or download this repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Configuration
You need two pieces of authentication to use this scraper:
1. **Apollo.io Session Cookie**: 
   - Log in to [Apollo.io](https://app.apollo.io/).
   - Open Browser DevTools (F12) -> Application -> Cookies.
   - Copy the value of the `apollo_session_cookie` (or look for the `Cookie` header in any search request).
2. **Hunter.io API Key**:
   - Get it from your [Hunter.io Dashboard](https://hunter.io/api).

## 🛠️ Local Development

To run the actor locally:
1. Create the local storage directory:
   ```bash
   mkdir -p storage/key_value_stores/default
   ```
2. Create an `INPUT.json` file in that directory with your settings.
3. Run the actor:
   ```bash
   npm run dev
   ```

## 📄 Output Schema
The actor pushes data to the default dataset in the following format:
```json
{
  "firstName": "Satoshi",
  "lastName": "Nakamoto",
  "title": "Founder",
  "company": "Bitcoin",
  "companyDomain": "bitcoin.org",
  "linkedinUrl": "...",
  "companyLinkedinUrl": "...",
  "email": "satoshi@bitcoin.org",
  "emailStatus": "verified",
  "phone": "+123456789",
  "country": "Japan",
  "state": "Tokyo"
}
```

## 🔄 Resumability
Progress is tracked in the Key-Value Store. If a run fails or is stopped, restarting it with the exact same filters will resume from the last page processed.
