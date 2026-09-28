import asyncio
from playwright.async_api import async_playwright
import json

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        # We will collect API responses that contain episode data
        episodes_data = []

        async def handle_response(response):
            if "apiv2.sonyliv.com" in response.url and "EPISODE" in response.url.upper():
                try:
                    data = await response.json()
                    episodes_data.append(data)
                    print(f"Captured API response: {response.url}")
                except Exception as e:
                    pass
            elif "apiv2.sonyliv.com" in response.url:
                # Catch any other sonyliv api that might return a list of episodes
                try:
                    text = await response.text()
                    if "episodeNumber" in text or "duration" in text:
                        data = await response.json()
                        episodes_data.append(data)
                        print(f"Captured API response (generic): {response.url}")
                except:
                    pass

        page.on("response", handle_response)
        
        print("Navigating to SonyLIV...")
        await page.goto("https://www.sonyliv.com/shows/taarak-mehta-ka-ooltah-chashmah-1700000084", wait_until="networkidle")
        
        # Scroll a bit to trigger API loads
        for i in range(5):
            await page.mouse.wheel(0, 2000)
            await asyncio.sleep(2)
            
        await browser.close()
        
        with open("sonyliv_captured.json", "w", encoding="utf-8") as f:
            json.dump(episodes_data, f, indent=2)
        print("Done. Saved captured JSON.")

asyncio.run(main())
