## Setup

To use this project the following is required:
 - TypeScript
 - npm
 - cloudflare workers

## Dev

To test your project, run:

```sh
npm run dev
```

And then open Dialect interstitial website: https://dial.to/?action=solana-action:http://localhost:8787. It'll use your local web server, so you can develop and test almost in realtime.

## Deploy

Deploy to Cloudflare Workers

```sh
npm run deploy
```

Read more: https://developers.cloudflare.com/workers/

#### Credit for starting template

https://github.com/zhelezkov/solana-action-templates/tree/main/cloudflare-workers-template
