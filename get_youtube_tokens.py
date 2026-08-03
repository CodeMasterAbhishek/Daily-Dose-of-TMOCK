import os
import sys
import webbrowser

try:
    from google_auth_oauthlib.flow import InstalledAppFlow
except ImportError:
    print("Error: Required packages missing. Run: pip install google-auth-oauthlib google-api-python-client")
    sys.exit(1)

SCOPES = ['https://www.googleapis.com/auth/youtube']


def main():
    print("=======================================================", flush=True)
    print("  YouTube OAuth2 Token Generator", flush=True)
    print("=======================================================", flush=True)

    client_secret_file = 'client_secret.json'
    if not os.path.exists(client_secret_file):
        print(f"\n[ERROR] '{client_secret_file}' not found in current directory!", flush=True)
        return

    flow = InstalledAppFlow.from_client_secrets_file(client_secret_file, SCOPES)
    
    # Try running local server
    print("\nOpening authentication link in your browser...", flush=True)
    credentials = flow.run_local_server(port=8080, open_browser=True)

    print("\n=======================================================", flush=True)
    print("  SUCCESS! Here are your credentials for GitHub Secrets:", flush=True)
    print("=======================================================\n", flush=True)
    print(f"YOUTUBE_CLIENT_ID     : {credentials.client_id}", flush=True)
    print(f"YOUTUBE_CLIENT_SECRET : {credentials.client_secret}", flush=True)
    print(f"YOUTUBE_REFRESH_TOKEN : {credentials.refresh_token}", flush=True)
    print("\nCopy these values and add them into your GitHub Repository Secrets!", flush=True)
    print("=======================================================\n", flush=True)


if __name__ == '__main__':
    main()
