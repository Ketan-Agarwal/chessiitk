# ChessClubIITK


# Setting up the backend deployment

1) Go to your Vercel deployment project, then Environment variables. Add `VITE_API_URL` and `VITE_RECAPTCHA_SITE_KEY`. The latter must be the site key for a Google reCAPTCHA v3 property that includes the production and preview hostnames.
2) In the repository, go to backend->app.py. Under CORS, replace the url in the origins with the url of your host domain. Only this URL will be allowed to access the service. PS: if you go to inspect -> console on the website, you'll see a error message with CORS on it if it's setup incorrectly. Make sure there are no trailing backslashes. In future, maybe this can also be turned into an environment variable.
3) In Cloud Run, configure `RECAPTCHA_SECRET_KEY`, `RECAPTCHA_ALLOWED_HOSTNAMES` (comma-separated), and optionally `RECAPTCHA_MIN_SCORE` (defaults to `0.5`). The secret key must never be exposed through a `VITE_` variable. Configure `MEDIA_STORAGE_BACKEND=gcs`, `GCS_UPLOAD_BUCKET`, and optionally `GCS_PUBLIC_BASE_URL`; grant the Cloud Run service account object create/delete access and configure the bucket or public base URL for public reads. Apply the SQL files in `backend/migrations` in numeric order before deploying this version.

**Note 1: The service on Google run is linked with my repository. Hence any changes to the backend should be notified to me. Only when I sync this fork will the backend get updated**

Note 2: I formatted the code a lot during backend deployment. The below instructions for local testing may or may not work as I might have hardcoded a few variables.

# ♟️ Chess Club IITK - Developer Setup Guide for local testing

Welcome to the Sanctum! This guide will get your local development environment set up so you can safely write code and connect to our live cloud database without needing any passwords, JSON keys, or IP whitelisting.

## Prerequisites
Before you start, make sure you have the following installed on your machine:
* **Python 3.9+**
* **Node.js & npm**
* **Google Cloud CLI:** [Install it here](https://cloud.google.com/sdk/docs/install)
* **Cloud SQL Auth Proxy:** * **Mac (Homebrew):** Run `brew install cloud-sql-proxy`
  * **Mac (Direct Download if Brew fails):** ```bash
    curl -o cloud-sql-proxy [https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.22.1/cloud-sql-proxy.darwin.arm64](https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.22.1/cloud-sql-proxy.darwin.arm64)
    chmod +x cloud-sql-proxy
    ```
  * **Windows:** [Download the .exe here](https://cloud.google.com/sql/docs/mysql/connect-auth-proxy).

---

## 🚀 Setup Instructions

### Step 1: Clone the Repository
```bash
git clone [https://github.com/YOUR_TEAM_REPO/ChessClubIITK.git](https://github.com/YOUR_TEAM_REPO/ChessClubIITK.git)
cd ChessClubIITK
Step 2: Setup the Python Backend
Open a terminal in the backend folder and set up your virtual environment:

Bash
cd backend
python3 -m venv venv

# Mac/Linux:
source venv/bin/activate
# Windows:
# venv\Scripts\activate

pip install -r requirements.txt
Create a .env file inside the backend folder and add these lines:

Code snippet
# Database (Connects to your local proxy tunnel)
DB_HOST="127.0.0.1"
DB_PORT="3306"
DB_USER="db_user"
DB_NAME="user_auth_db"
DB_PASSWORD="<ASK_SIDDHANT_FOR_PASSWORD>"

# Email Setup for OTPs
EMAIL_SENDER="mysterymaninyourarea@gmail.com"
EMAIL_PASSWORD="<ASK_SIDDHANT_FOR_APP_PASSWORD>"
JWT_SECRET="<ASK_SIDDHANT/DIVYESH>"
JWT_ACCESS_TOKEN_HOURS="12"
MEDIA_STORAGE_BACKEND="local"
Step 3: Setup the React Frontend
Open a new terminal tab in the react-app folder:

Bash
cd react-app
npm install
🔐 The Magic Database Tunnel
We use Google's zero-key authentication. Instead of dealing with IP whitelists on the IITK Wi-Fi, you will log in through your browser to open a secure tunnel straight to the cloud database.

1. Log into Google Cloud
Run this in your terminal and log in with your authorized Google Account (ensure Siddhant has added this email to the IAM access list):

Bash
gcloud auth application-default login
2. Open the Tunnel
Keep a terminal window open in the background and run the proxy command:

Bash
# If installed via Homebrew or Windows .exe:
cloud-sql-proxy backend-499903:asia-south2:chessiitk-mysql-delhi-01

# If downloaded directly to your folder via curl:
./cloud-sql-proxy backend-499903:asia-south2:chessiitk-mysql-delhi-01
(If the terminal says Ready for new connections, you are successfully connected to the cloud database! Leave this running.)

🏃‍♂️ Running the App Daily
Whenever you sit down to code, you need three terminal tabs running:

The Proxy Tunnel: (See step above)

The Backend: ```bash
cd backend
source venv/bin/activate
python app.py

The Frontend:

Bash
cd react-app
npm run dev
Open http://localhost:5173 in your browser, and you're ready to build!
