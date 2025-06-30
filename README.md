# Bug Track Tracer

This is a simple Jamstack bug tracking app. All data is stored in SQLiteCloud and accessed via the Weblite REST API. Authentication is a passcode-based login.

## Running Locally

Open `index.html` in a browser. The default passcodes are `Denver`, `Oakland`, and `Seattle`. You can change them by editing `app.js`.

## Deployment

Host the static files (`index.html` and `app.js`) on any static site provider. The app communicates directly with SQLiteCloud, so no server code is required.
