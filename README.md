# Bug Track Tracer

This is a simple bug tracking web application designed for Deno Deploy. It stores bug records in Deno KV and uses a passcode-based login system.

## Running Locally

```
PASSCODES="Denver, Oakland, Seattle" deno run -A main.ts
```

Open `http://localhost:8000` in a browser and log in using one of the passcodes.

## Deploying to Deno Deploy

Upload `main.ts` to Deno Deploy and configure an environment variable `PASSCODES` with a comma-delimited list of valid passcodes.
