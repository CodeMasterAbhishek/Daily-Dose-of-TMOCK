import csv
import subprocess

def check_dates():
    with open('data/episodes.csv', 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)
        
    print("Checking the first 5 episodes to verify dates...")
    print(f"{'Episode':<10} | {'Stored Date':<15} | {'Actual YouTube Date'}")
    print("-" * 50)
    
    for row in rows[:5]:
        ep_num = row[0]
        url = row[2]
        stored_date = row[4]
        
        try:
            result = subprocess.run(
                ['yt-dlp', '--print', 'upload_date', url], 
                capture_output=True, text=True, check=True
            )
            actual_date = result.stdout.strip()
            # Convert YYYYMMDD to DD MMM YYYY if needed, but just raw is fine for diagnostic
        except Exception as e:
            actual_date = "Error"
            
        print(f"{ep_num:<10} | {stored_date if stored_date else 'Empty':<15} | {actual_date}")

if __name__ == "__main__":
    check_dates()
